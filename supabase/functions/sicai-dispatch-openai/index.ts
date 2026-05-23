// Dispatch a SICAI batch to OpenAI: either sync (1 job) or openai_batch (upload JSONL + create batch).
import { requireAdmin, jsonResponse, sha256, corsHeaders, themedPath } from "../_shared/sicai.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const STORAGE_BUCKET = "sicai-assets";

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function runSyncJob(admin: any, batchId: string, jobIdHint?: string) {
  // Pick target job
  let q = admin.from("sicai_generation_jobs").select("*, sicai_generation_batches!inner(theme_code)").eq("batch_id", batchId);
  q = jobIdHint ? q.eq("id", jobIdHint) : q.eq("status", "queued").limit(1);
  const { data: jobs, error } = await q;
  if (error) throw error;
  const job = jobs?.[0];
  if (!job) return { error: "no job found" };
  const themeCode = job.sicai_generation_batches?.theme_code ?? "neutre";

  await admin.from("sicai_generation_jobs").update({ status: "generating" }).eq("id", job.id);

  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 140_000);

  try {
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify(job.openai_request_json),
      signal: controller.signal,
    });
    clearTimeout(tid);

    if (!resp.ok) {
      const errText = await resp.text();
      await admin.from("sicai_generation_jobs").update({
        status: "qc_failed",
        error_code: String(resp.status),
        error_message: errText.slice(0, 1000),
      }).eq("id", job.id);
      return { job_id: job.id, status: "qc_failed", error: errText.slice(0, 200) };
    }

    const data = await resp.json();
    const b64 = data?.data?.[0]?.b64_json;
    const revised_prompt = data?.data?.[0]?.revised_prompt ?? null;
    if (!b64) {
      await admin.from("sicai_generation_jobs").update({
        status: "qc_failed", error_message: "no b64_json in response",
      }).eq("id", job.id);
      return { job_id: job.id, status: "qc_failed", error: "no b64_json" };
    }

    const bytes = b64ToBytes(b64);
    const checksum = await sha256(bytes);
    const storage_path = `png_master/${job.id}.png`;

    const { error: upErr } = await admin.storage.from(STORAGE_BUCKET)
      .upload(storage_path, bytes, { contentType: "image/png", upsert: true });
    if (upErr) throw upErr;

    await admin.from("sicai_assets").insert({
      job_id: job.id,
      asset_kind: "png_master",
      storage_path,
      checksum,
      width: 1536,
      height: 1024,
      file_size_bytes: bytes.length,
    });

    const responseClone = { ...data };
    if (responseClone?.data) {
      responseClone.data = responseClone.data.map((d: any) => ({ ...d, b64_json: undefined }));
    }

    await admin.from("sicai_generation_jobs").update({
      openai_response_json: responseClone,
      revised_prompt,
      usage_input_tokens: data?.usage?.input_tokens ?? null,
      usage_output_tokens: data?.usage?.output_tokens ?? null,
      status: "generated",
    }).eq("id", job.id);

    return { job_id: job.id, status: "generated", asset_path: storage_path };
  } catch (e: any) {
    clearTimeout(tid);
    const aborted = e?.name === "AbortError";
    await admin.from("sicai_generation_jobs").update({
      status: "qc_failed",
      error_code: aborted ? "timeout" : "network",
      error_message: aborted ? "OpenAI call exceeded 140s" : (e?.message ?? String(e)),
    }).eq("id", job.id);
    return { job_id: job.id, status: "qc_failed", error: e?.message ?? String(e) };
  }
}

async function runBatchMode(admin: any, batchId: string) {
  const { data: jobs, error } = await admin
    .from("sicai_generation_jobs").select("*").eq("batch_id", batchId);
  if (error) throw error;
  if (!jobs || jobs.length === 0) return { error: "no jobs" };

  const jsonl = jobs.map((j: any) => JSON.stringify({
    custom_id: j.custom_id,
    method: "POST",
    url: "/v1/images/generations",
    body: j.openai_request_json,
  })).join("\n");

  // 1) Upload file
  const fd = new FormData();
  fd.append("purpose", "batch");
  fd.append("file", new Blob([jsonl], { type: "application/jsonl" }), "sicai-batch.jsonl");
  const fileResp = await fetch("https://api.openai.com/v1/files", {
    method: "POST",
    headers: { "Authorization": `Bearer ${OPENAI_API_KEY}` },
    body: fd,
  });
  if (!fileResp.ok) {
    const t = await fileResp.text();
    throw new Error(`OpenAI files upload failed: ${fileResp.status} ${t.slice(0, 500)}`);
  }
  const fileData = await fileResp.json();
  const input_file_id = fileData.id;

  // 2) Create batch
  const batchResp = await fetch("https://api.openai.com/v1/batches", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      input_file_id,
      endpoint: "/v1/images/generations",
      completion_window: "24h",
      metadata: { krobar_batch_id: batchId, purpose: "sicai_72_templates" },
    }),
  });
  if (!batchResp.ok) {
    const t = await batchResp.text();
    throw new Error(`OpenAI batch create failed: ${batchResp.status} ${t.slice(0, 500)}`);
  }
  const batchData = await batchResp.json();

  await admin.from("sicai_generation_batches").update({
    openai_batch_id: batchData.id,
    status: "running",
  }).eq("id", batchId);

  await admin.from("sicai_generation_jobs").update({ status: "generating" }).eq("batch_id", batchId);

  return {
    batch_id: batchId,
    openai_batch_id: batchData.id,
    status: "running",
    estimated_completion: "24h",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method not allowed" }, 405);
  if (!OPENAI_API_KEY) return jsonResponse({ error: "OPENAI_API_KEY missing" }, 500);

  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;
  const { admin } = auth;

  try {
    const { batch_id, job_id } = await req.json();
    if (!batch_id) return jsonResponse({ error: "batch_id required" }, 400);

    const { data: batch, error } = await admin.from("sicai_generation_batches")
      .select("*").eq("id", batch_id).single();
    if (error || !batch) return jsonResponse({ error: "batch not found" }, 404);

    if (batch.batch_mode === "sync") {
      const r = await runSyncJob(admin, batch_id, job_id);
      // Update batch counts
      const { count: failed } = await admin.from("sicai_generation_jobs")
        .select("*", { count: "exact", head: true }).eq("batch_id", batch_id).eq("status", "qc_failed");
      const { count: done } = await admin.from("sicai_generation_jobs")
        .select("*", { count: "exact", head: true }).eq("batch_id", batch_id).eq("status", "generated");
      await admin.from("sicai_generation_batches").update({
        approved_count: done ?? 0, failed_count: failed ?? 0,
      }).eq("id", batch_id);
      return jsonResponse(r);
    } else {
      const r = await runBatchMode(admin, batch_id);
      return jsonResponse(r);
    }
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
