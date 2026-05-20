// Post-process a generated job: normalize PNG palette, build SVG overlay, save assets.
import { PNG } from "npm:pngjs@7.0.0";
import { Buffer } from "node:buffer";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { adminClient, jsonResponse, requireAdmin, sha256 } from "../_shared/sicai.ts";
import { quantizeToPalette, buildSvg } from "../_shared/sicai-overlay.ts";

const BUCKET = "sicai-assets";

async function downloadPng(admin: any, path: string): Promise<Uint8Array> {
  const { data, error } = await admin.storage.from(BUCKET).download(path);
  if (error || !data) throw new Error(`download ${path}: ${error?.message}`);
  return new Uint8Array(await data.arrayBuffer());
}

function decodePng(bytes: Uint8Array): { w: number; h: number; data: Uint8Array } {
  const png = PNG.sync.read(Buffer.from(bytes));
  return { w: png.width, h: png.height, data: new Uint8Array(png.data) };
}

function encodePng(w: number, h: number, data: Uint8Array): Uint8Array {
  const png = new PNG({ width: w, height: h });
  png.data = Buffer.from(data);
  return new Uint8Array(PNG.sync.write(png));
}

function normalizePalette(w: number, h: number, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b] = quantizeToPalette(data[i], data[i + 1], data[i + 2]);
    out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = 255;
  }
  return out;
}

function resizeNearest(srcW: number, srcH: number, src: Uint8Array, dstW: number, dstH: number): Uint8Array {
  const out = new Uint8Array(dstW * dstH * 4);
  for (let y = 0; y < dstH; y++) {
    const sy = Math.min(srcH - 1, Math.floor(y * srcH / dstH));
    for (let x = 0; x < dstW; x++) {
      const sx = Math.min(srcW - 1, Math.floor(x * srcW / dstW));
      const si = (sy * srcW + sx) * 4;
      const di = (y * dstW + x) * 4;
      out[di] = src[si]; out[di + 1] = src[si + 1]; out[di + 2] = src[si + 2]; out[di + 3] = 255;
    }
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const gate = await requireAdmin(req);
    if (gate instanceof Response) return gate;
    const { admin } = gate;
    const { job_id, force } = await req.json();
    if (!job_id) return jsonResponse({ error: "job_id required" }, 400);

    const { data: job, error: jErr } = await admin
      .from("sicai_generation_jobs")
      .select("id, status, template_id, sicai_templates(illustration_id, family_code, cardinality_code, regime_code)")
      .eq("id", job_id).maybeSingle();
    if (jErr || !job) return jsonResponse({ error: "job not found" }, 404);
    const tpl = (job as any).sicai_templates;
    if (!tpl) return jsonResponse({ error: "template missing" }, 400);

    // Idempotence
    if (!force) {
      const { data: existing } = await admin.from("sicai_assets")
        .select("storage_path").eq("job_id", job_id).eq("asset_kind", "svg_final").maybeSingle();
      if (existing) return jsonResponse({ job_id, status: "qc_pending", svg_path: existing.storage_path, cached: true });
    }

    const { data: masterAsset } = await admin.from("sicai_assets")
      .select("storage_path").eq("job_id", job_id).eq("asset_kind", "png_master").maybeSingle();
    if (!masterAsset) return jsonResponse({ error: "png_master missing" }, 400);

    // A. Load + normalize
    const masterBytes = await downloadPng(admin, masterAsset.storage_path);
    const decoded = decodePng(masterBytes);
    const normData = normalizePalette(decoded.w, decoded.h, decoded.data);
    const normPng = encodePng(decoded.w, decoded.h, normData);
    const normPath = `png_normalized/${job_id}.png`;
    await admin.storage.from(BUCKET).upload(normPath, normPng, { contentType: "image/png", upsert: true });
    await admin.from("sicai_assets").insert({
      job_id, asset_kind: "png_normalized", storage_path: normPath,
      width: decoded.w, height: decoded.h, file_size_bytes: normPng.byteLength,
      checksum: await sha256(normPng),
    });

    // B+C. Build SVG with raster-embedded + overlays
    const pngBase64 = Buffer.from(normPng).toString("base64");
    const svg = buildSvg({
      pngBase64,
      cardinalityCode: tpl.cardinality_code,
      illustrationId: tpl.illustration_id,
      familyCode: tpl.family_code,
      regimeCode: tpl.regime_code,
    });
    const svgBytes = new TextEncoder().encode(svg);
    const svgPath = `svg_final/${job_id}.svg`;
    await admin.storage.from(BUCKET).upload(svgPath, svgBytes, { contentType: "image/svg+xml", upsert: true });
    await admin.from("sicai_assets").insert({
      job_id, asset_kind: "svg_final", storage_path: svgPath,
      width: 1600, height: 900, file_size_bytes: svgBytes.byteLength,
      checksum: await sha256(svgBytes),
    });

    // E. Thumbnail (400x225) via downsample of normalized
    const thumbData = resizeNearest(decoded.w, decoded.h, normData, 400, 225);
    const thumbPng = encodePng(400, 225, thumbData);
    const thumbPath = `thumbnails/${job_id}.png`;
    await admin.storage.from(BUCKET).upload(thumbPath, thumbPng, { contentType: "image/png", upsert: true });
    await admin.from("sicai_assets").insert({
      job_id, asset_kind: "thumbnail", storage_path: thumbPath,
      width: 400, height: 225, file_size_bytes: thumbPng.byteLength,
      checksum: await sha256(thumbPng),
    });

    await admin.from("sicai_generation_jobs").update({ status: "qc_pending" }).eq("id", job_id);
    return jsonResponse({ job_id, status: "qc_pending", svg_path: svgPath });
  } catch (e) {
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});
