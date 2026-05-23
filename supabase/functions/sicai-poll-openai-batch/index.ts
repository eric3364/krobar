// Poll one OpenAI batch, download outputs/errors, upload PNG masters, update jobs.
import { requireAdmin, jsonResponse, sha256, corsHeaders, themedPath } from "../_shared/sicai.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const STORAGE_BUCKET = "sicai-assets";

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function downloadFile(fileId: string): Promise<string> {
  const r = await fetch(`https://api.openai.com/v1/files/${fileId}/content`, {
    headers: { "Authorization": `Bearer ${OPENAI_API_KEY}` },
  });
  if (!r.ok) throw new Error(`download ${fileId} failed: ${r.status}`);
  return await r.text();
}

export async function pollBatch(admin: any, batchId: string) {
  const { data: batch, error } = await admin
    .from("sicai_generation_batches").select("*").eq("id", batchId).single();
  if (error || !batch) throw new Error("batch not found");
  if (!batch.openai_batch_id) throw new Error("batch has no openai_batch_id");

  const r = await fetch(`https://api.openai.com/v1/batches/${batch.openai_batch_id}`, {
    headers: { "Authorization": `Bearer ${OPENAI_API_KEY}` },
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`poll ${batch.openai_batch_id} failed: ${r.status} ${t.slice(0, 200)}`);
  }
  const oa = await r.json();

  if (oa.status === "in_progress" || oa.status === "finalizing" || oa.status === "validating") {
    return {
      batch_id: batchId,
      openai_status: oa.status,
      local_status: "running",
      jobs_completed: oa.request_counts?.completed ?? 0,
      jobs_failed: oa.request_counts?.failed ?? 0,
    };
  }

  if (oa.status === "completed") {
    // Build job lookup by custom_id
    const { data: jobs } = await admin.from("sicai_generation_jobs")
      .select("id, custom_id").eq("batch_id", batchId);
    const byCustom = new Map<string, string>();
    for (const j of jobs ?? []) byCustom.set(j.custom_id, j.id);

    let completed = 0, failed = 0;

    // Output file
    if (oa.output_file_id) {
      const text = await downloadFile(oa.output_file_id);
      for (const line of text.split("\n")) {
        if (!line.trim()) continue;
        let entry: any;
        try { entry = JSON.parse(line); } catch { continue; }
        const jobId = byCustom.get(entry.custom_id);
        if (!jobId) continue;

        const data = entry.response?.body?.data?.[0];
        const b64 = data?.b64_json;
        if (!b64) {
          await admin.from("sicai_generation_jobs").update({
            status: "qc_failed", error_message: "missing b64_json in batch output",
          }).eq("id", jobId);
          failed++;
          continue;
        }
        const bytes = b64ToBytes(b64);
        const checksum = await sha256(bytes);
        const storage_path = `png_master/${jobId}.png`;

        const { error: upErr } = await admin.storage.from(STORAGE_BUCKET)
          .upload(storage_path, bytes, { contentType: "image/png", upsert: true });
        if (upErr) {
          await admin.from("sicai_generation_jobs").update({
            status: "qc_failed", error_message: `storage: ${upErr.message}`,
          }).eq("id", jobId);
          failed++;
          continue;
        }
        await admin.from("sicai_assets").insert({
          job_id: jobId,
          asset_kind: "png_master",
          storage_path,
          checksum,
          width: 1536,
          height: 1024,
          file_size_bytes: bytes.length,
        });
        const responseClone = JSON.parse(JSON.stringify(entry.response ?? {}));
        if (responseClone?.body?.data) {
          responseClone.body.data = responseClone.body.data.map((d: any) => ({ ...d, b64_json: undefined }));
        }
        await admin.from("sicai_generation_jobs").update({
          openai_response_json: responseClone,
          revised_prompt: data?.revised_prompt ?? null,
          usage_input_tokens: entry.response?.body?.usage?.input_tokens ?? null,
          usage_output_tokens: entry.response?.body?.usage?.output_tokens ?? null,
          status: "generated",
        }).eq("id", jobId);
        completed++;
      }
    }

    if (oa.error_file_id) {
      const text = await downloadFile(oa.error_file_id);
      for (const line of text.split("\n")) {
        if (!line.trim()) continue;
        let entry: any;
        try { entry = JSON.parse(line); } catch { continue; }
        const jobId = byCustom.get(entry.custom_id);
        if (!jobId) continue;
        await admin.from("sicai_generation_jobs").update({
          status: "qc_failed",
          error_code: String(entry.error?.code ?? entry.response?.status_code ?? "unknown"),
          error_message: (entry.error?.message ?? JSON.stringify(entry.error ?? entry).slice(0, 500)),
        }).eq("id", jobId);
        failed++;
      }
    }

    await admin.from("sicai_generation_batches").update({
      status: "qc",
      approved_count: completed,
      failed_count: failed,
    }).eq("id", batchId);

    return {
      batch_id: batchId,
      openai_status: "completed",
      local_status: "qc",
      jobs_completed: completed,
      jobs_failed: failed,
    };
  }

  if (oa.status === "failed" || oa.status === "expired" || oa.status === "cancelled") {
    await admin.from("sicai_generation_batches").update({ status: "failed" }).eq("id", batchId);
    await admin.from("sicai_generation_jobs").update({
      status: "qc_failed", error_message: `batch_${oa.status}`,
    }).eq("batch_id", batchId).eq("status", "generating");
    return {
      batch_id: batchId,
      openai_status: oa.status,
      local_status: "failed",
      jobs_completed: 0,
      jobs_failed: oa.request_counts?.failed ?? 0,
    };
  }

  return { batch_id: batchId, openai_status: oa.status, local_status: batch.status };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method not allowed" }, 405);
  if (!OPENAI_API_KEY) return jsonResponse({ error: "OPENAI_API_KEY missing" }, 500);

  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;
  const { admin } = auth;

  try {
    const { batch_id } = await req.json();
    if (!batch_id) return jsonResponse({ error: "batch_id required" }, 400);
    const result = await pollBatch(admin, batch_id);
    return jsonResponse(result);
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
