// QC checks for a post-processed job. Writes sicai_qc_checks rows + updates job status.
import { PNG } from "npm:pngjs@7.0.0";
import { Buffer } from "node:buffer";
import { jsonResponse, requireAdmin, corsHeaders } from "../_shared/sicai.ts";
import { SICAI_PALETTE, MIN_SIZES, getOverlayRects } from "../_shared/sicai-overlay.ts";

const BUCKET = "sicai-assets";

type Status = "pass" | "warn" | "fail" | "skipped";

async function downloadBytes(admin: any, path: string): Promise<Uint8Array> {
  const { data, error } = await admin.storage.from(BUCKET).download(path);
  if (error || !data) throw new Error(`download ${path}: ${error?.message}`);
  return new Uint8Array(await data.arrayBuffer());
}

function decodePng(bytes: Uint8Array) {
  const png = PNG.sync.read(Buffer.from(bytes));
  return { w: png.width, h: png.height, data: new Uint8Array(png.data) };
}

function maxComponentDiff(r: number, g: number, b: number): number {
  return Math.max(r, g, b) - Math.min(r, g, b);
}

function distToPalette(r: number, g: number, b: number): number {
  let best = Infinity;
  for (const c of SICAI_PALETTE) {
    const dr = r - c[0], dg = g - c[1], db = b - c[2];
    const d = Math.sqrt(dr * dr + dg * dg + db * db);
    if (d < best) best = d;
  }
  return best;
}

// 8x8 average hash
function aHash(w: number, h: number, data: Uint8Array): bigint {
  const dst = 8;
  const sums = new Float32Array(dst * dst);
  for (let y = 0; y < dst; y++) {
    const sy0 = Math.floor(y * h / dst), sy1 = Math.floor((y + 1) * h / dst);
    for (let x = 0; x < dst; x++) {
      const sx0 = Math.floor(x * w / dst), sx1 = Math.floor((x + 1) * w / dst);
      let s = 0, n = 0;
      for (let yy = sy0; yy < sy1; yy++) {
        for (let xx = sx0; xx < sx1; xx++) {
          const i = (yy * w + xx) * 4;
          s += (data[i] + data[i + 1] + data[i + 2]) / 3;
          n++;
        }
      }
      sums[y * dst + x] = s / Math.max(1, n);
    }
  }
  let avg = 0;
  for (const v of sums) avg += v;
  avg /= sums.length;
  let hash = 0n;
  for (let i = 0; i < sums.length; i++) {
    if (sums[i] >= avg) hash |= 1n << BigInt(i);
  }
  return hash;
}

function hamming(a: bigint, b: bigint): number {
  let x = a ^ b;
  let c = 0;
  while (x) { c += Number(x & 1n); x >>= 1n; }
  return c;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const gate = await requireAdmin(req);
    if (gate instanceof Response) return gate;
    const { admin } = gate;
    const { job_id } = await req.json();
    if (!job_id) return jsonResponse({ error: "job_id required" }, 400);

    const { data: job } = await admin.from("sicai_generation_jobs")
      .select("id, template_id, sicai_templates(family_code, cardinality_code, regime_code, illustration_id)")
      .eq("id", job_id).maybeSingle();
    if (!job) return jsonResponse({ error: "job not found" }, 404);
    const tpl = (job as any).sicai_templates;

    const { data: assets } = await admin.from("sicai_assets")
      .select("asset_kind, storage_path").eq("job_id", job_id);
    const byKind: Record<string, string> = {};
    for (const a of assets ?? []) byKind[a.asset_kind] = a.storage_path;
    if (!byKind.png_normalized || !byKind.svg_final) {
      return jsonResponse({ error: "post-process assets missing" }, 400);
    }

    // Clear previous QC rows
    await admin.from("sicai_qc_checks").delete().eq("job_id", job_id);

    const normBytes = await downloadBytes(admin, byKind.png_normalized);
    const norm = decodePng(normBytes);
    const svgText = new TextDecoder().decode(await downloadBytes(admin, byKind.svg_final));

    const checks: Array<{ name: string; status: Status; score?: number; details?: any }> = [];

    // 1. palette_bw
    {
      let satSum = 0, satN = 0, off = 0, total = 0;
      for (let i = 0; i < norm.data.length; i += 4) {
        const r = norm.data[i], g = norm.data[i + 1], b = norm.data[i + 2];
        satSum += maxComponentDiff(r, g, b) / 255;
        satN++;
        if (distToPalette(r, g, b) > 10) off++;
        total++;
      }
      const satAvg = satSum / satN;
      const offRatio = off / total;
      const status: Status = satAvg < 0.05 && offRatio < 0.01 ? "pass"
        : satAvg < 0.10 || offRatio < 0.05 ? "warn" : "fail";
      checks.push({ name: "palette_bw", status, score: 1 - satAvg, details: { sat_avg: satAvg, off_ratio: offRatio } });
    }

    // 2. placeholder_count
    {
      const titleN = (svgText.match(/data-slot="title"/g) || []).length;
      const verbN = (svgText.match(/data-slot="verbatim-/g) || []).length;
      const expected = getOverlayRects(tpl.cardinality_code).verbatims.length;
      const ok = titleN === 1 && verbN === expected;
      checks.push({ name: "placeholder_count", status: ok ? "pass" : "fail",
        details: { title: titleN, verbatim: verbN, expected_verbatim: expected } });
    }

    // 3. placeholder_min_size
    {
      const min = MIN_SIZES[(tpl.cardinality_code || "").toUpperCase()];
      let ok = true;
      const rects = [...svgText.matchAll(/<rect data-slot="verbatim-\d+"[^>]*width="(\d+)"\s+height="(\d+)"/g)];
      for (const m of rects) {
        if (min && (parseInt(m[1]) < min.w || parseInt(m[2]) < min.h)) { ok = false; break; }
      }
      checks.push({ name: "placeholder_min_size", status: ok ? "pass" : "fail", details: { count: rects.length } });
    }

    // 4. bg_lightness (border 10px)
    {
      const { w, h, data } = norm;
      const bw = 10;
      let sum = 0, n = 0;
      const sample = (x: number, y: number) => {
        const i = (y * w + x) * 4;
        sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
        n++;
      };
      for (let x = 0; x < w; x++) for (let y = 0; y < bw; y++) { sample(x, y); sample(x, h - 1 - y); }
      for (let y = bw; y < h - bw; y++) for (let x = 0; x < bw; x++) { sample(x, y); sample(w - 1 - x, y); }
      const lum = (sum / n) / 255;
      const status: Status = lum > 0.92 ? "pass" : lum > 0.85 ? "warn" : "fail";
      checks.push({ name: "bg_lightness", status, score: lum, details: { lum } });
    }

    // 5. svg_ready_score (raster embedded → 0.5)
    {
      const imgs = (svgText.match(/<image\s/g) || []).length;
      const paths = (svgText.match(/<path\s/g) || []).length;
      const score = paths > 5 ? 1.0 : imgs > 0 ? 0.5 : 0.0;
      const status: Status = score > 0.85 ? "pass" : score >= 0.5 ? "warn" : "fail";
      checks.push({ name: "svg_ready_score", status, score, details: { imgs, paths } });
    }

    // 6. regime_distinctness
    {
      const { data: siblings } = await admin.from("sicai_generation_jobs")
        .select("id, sicai_templates!inner(family_code, cardinality_code, regime_code)")
        .neq("id", job_id)
        .eq("sicai_templates.family_code", tpl.family_code)
        .eq("sicai_templates.cardinality_code", tpl.cardinality_code);
      const sibIds = (siblings ?? []).map((s: any) => s.id);
      if (sibIds.length === 0) {
        checks.push({ name: "regime_distinctness", status: "skipped", details: { siblings: 0 } });
      } else {
        const { data: sibAssets } = await admin.from("sicai_assets")
          .select("job_id, storage_path").eq("asset_kind", "png_normalized").in("job_id", sibIds);
        const hashes: bigint[] = [aHash(norm.w, norm.h, norm.data)];
        for (const a of sibAssets ?? []) {
          try {
            const bytes = await downloadBytes(admin, a.storage_path);
            const dec = decodePng(bytes);
            hashes.push(aHash(dec.w, dec.h, dec.data));
          } catch { /* ignore */ }
        }
        if (hashes.length < 2) {
          checks.push({ name: "regime_distinctness", status: "skipped", details: { hashes: hashes.length } });
        } else {
          let sum = 0, c = 0;
          for (let i = 0; i < hashes.length; i++)
            for (let j = i + 1; j < hashes.length; j++) { sum += hamming(hashes[i], hashes[j]); c++; }
          const avg = sum / c;
          const status: Status = avg > 30 ? "pass" : avg >= 20 ? "warn" : "fail";
          checks.push({ name: "regime_distinctness", status, score: avg, details: { avg_distance: avg, n: hashes.length } });
        }
      }
    }

    // 7. visible_text / anchor_count / forbidden_effects → skipped (MVP)
    for (const name of ["visible_text", "anchor_count", "forbidden_effects"]) {
      checks.push({ name, status: "skipped", details: { reason: "not implemented in MVP" } });
    }

    // Insert checks
    await admin.from("sicai_qc_checks").insert(checks.map((c) => ({
      job_id, check_name: c.name, check_status: c.status,
      score: c.score ?? null, details_json: c.details ?? null,
    })));

    const passed = checks.filter((c) => c.status === "pass").length;
    const warned = checks.filter((c) => c.status === "warn").length;
    const failed = checks.filter((c) => c.status === "fail").length;
    const final = failed > 0 ? "qc_failed" : warned > 0 ? "review_needed" : "approved";
    await admin.from("sicai_generation_jobs").update({ status: final }).eq("id", job_id);

    return jsonResponse({
      job_id, checks_passed: passed, checks_warned: warned, checks_failed: failed, final_status: final,
    });
  } catch (e) {
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});
