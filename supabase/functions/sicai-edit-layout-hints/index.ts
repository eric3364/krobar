// Edit placeholder coordinates (title + verbatim-N) of an existing svg_final asset.
// Overwrites the SVG at its stable path, bumps the asset.version counter,
// and re-runs sicai-run-qc to refresh placeholder_count + placeholder_min_size.
import { adminClient, jsonResponse, requireAdmin, sha256, corsHeaders } from "../_shared/sicai.ts";

const BUCKET = "sicai-assets";

type Box = { x: number; y: number; w: number; h: number; rx?: number; ry?: number };
type VBox = Box & { id: string };

function clampBox(b: Box): Box {
  const x = Math.max(0, Math.min(1600, Math.round(b.x)));
  const y = Math.max(0, Math.min(900, Math.round(b.y)));
  const w = Math.max(1, Math.min(1600 - x, Math.round(b.w)));
  const h = Math.max(1, Math.min(900 - y, Math.round(b.h)));
  const rx = Math.max(0, Math.round(b.rx ?? 0));
  const ry = Math.max(0, Math.round(b.ry ?? rx));
  return { x, y, w, h, rx, ry };
}

function replaceRectAttrs(svg: string, slot: string, box: Box): { svg: string; matched: boolean } {
  // Match the entire <rect data-slot="{slot}" ... /> tag (self-closing).
  const re = new RegExp(`<rect\\b([^>]*?)data-slot="${slot.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}"([^>]*?)/?>`, "i");
  const m = svg.match(re);
  if (!m) return { svg, matched: false };
  const full = m[0];
  let inner = full.slice(0, -2); // strip "/>"
  if (full.endsWith(">") && !full.endsWith("/>")) inner = full.slice(0, -1);
  // Strip x/y/width/height/rx/ry from inner
  inner = inner
    .replace(/\s(x|y|width|height|rx|ry)="[^"]*"/gi, "");
  const replaced = `${inner} x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="${box.rx ?? 0}" ry="${box.ry ?? box.rx ?? 0}" />`;
  return { svg: svg.replace(full, replaced), matched: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const gate = await requireAdmin(req);
    if (gate instanceof Response) return gate;
    const { admin } = gate;

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonResponse({ error: "invalid body" }, 400);
    const { job_id, layout_hints } = body as {
      job_id?: string;
      layout_hints?: { title_box?: Box; verbatim_boxes?: VBox[] };
    };
    if (!job_id) return jsonResponse({ error: "job_id required" }, 400);
    if (!layout_hints || typeof layout_hints !== "object") {
      return jsonResponse({ error: "layout_hints required" }, 400);
    }

    // Latest svg_final asset for this job
    const { data: assetRow, error: aErr } = await admin
      .from("sicai_assets")
      .select("id, storage_path, version")
      .eq("job_id", job_id)
      .eq("asset_kind", "svg_final")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (aErr || !assetRow) return jsonResponse({ error: "svg_final not found" }, 404);

    // Download current SVG
    const dl = await admin.storage.from(BUCKET).download(assetRow.storage_path);
    if (dl.error || !dl.data) return jsonResponse({ error: `download: ${dl.error?.message ?? "no data"}` }, 500);
    let svgText = await dl.data.text();

    const updates: { slot: string; matched: boolean }[] = [];

    if (layout_hints.title_box) {
      const r = replaceRectAttrs(svgText, "title", clampBox(layout_hints.title_box));
      svgText = r.svg;
      updates.push({ slot: "title", matched: r.matched });
    }
    if (Array.isArray(layout_hints.verbatim_boxes)) {
      for (let i = 0; i < layout_hints.verbatim_boxes.length; i++) {
        const vb = layout_hints.verbatim_boxes[i];
        // Slot id can be provided ("v1") or inferred from index (1-based)
        const idx = vb.id && /^v(\d+)$/.test(vb.id) ? Number(vb.id.slice(1)) : i + 1;
        const slot = `verbatim-${idx}`;
        const r = replaceRectAttrs(svgText, slot, clampBox(vb));
        svgText = r.svg;
        updates.push({ slot, matched: r.matched });
      }
    }

    const notMatched = updates.filter((u) => !u.matched).map((u) => u.slot);
    if (notMatched.length === updates.length) {
      return jsonResponse({ error: "no data-slot rect could be matched in SVG", updates }, 400);
    }

    // Overwrite the SVG at the stable path
    const svgBytes = new TextEncoder().encode(svgText);
    const up = await admin.storage.from(BUCKET).upload(assetRow.storage_path, svgBytes, {
      contentType: "image/svg+xml",
      upsert: true,
    });
    if (up.error) return jsonResponse({ error: `upload: ${up.error.message}` }, 500);

    // Bump version + refresh checksum/size on the existing asset row
    const newVersion = (assetRow.version ?? 1) + 1;
    await admin.from("sicai_assets").update({
      version: newVersion,
      file_size_bytes: svgBytes.byteLength,
      checksum: await sha256(svgBytes),
    }).eq("id", assetRow.id);

    // Re-run QC (full pass — fast, 1-2s)
    let qcResult: unknown = null;
    try {
      const qcUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/sicai-run-qc`;
      const authHeader = req.headers.get("Authorization") ?? "";
      const qcRes = await fetch(qcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
        body: JSON.stringify({ job_id }),
      });
      qcResult = await qcRes.json().catch(() => null);
    } catch (e) {
      qcResult = { error: (e as Error).message };
    }

    return jsonResponse({
      job_id,
      svg_path: assetRow.storage_path,
      version: newVersion,
      updates,
      not_matched: notMatched,
      qc: qcResult,
    });
  } catch (e) {
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});
