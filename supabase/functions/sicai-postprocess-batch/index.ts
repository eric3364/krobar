// Process up to N jobs of a batch through post-process + QC (bounded for timeout).
import { jsonResponse, requireAdmin, corsHeaders } from "../_shared/sicai.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

async function callFn(name: string, body: unknown, auth: string) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: auth },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, json };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const gate = await requireAdmin(req);
    if (gate instanceof Response) return gate;
    const { admin } = gate;
    const auth = req.headers.get("Authorization") ?? "";
    const { batch_id, limit = 8 } = await req.json();
    if (!batch_id) return jsonResponse({ error: "batch_id required" }, 400);

    const { data: jobs } = await admin.from("sicai_generation_jobs")
      .select("id, status").eq("batch_id", batch_id)
      .in("status", ["generated", "qc_pending"]).limit(limit);

    const results: any[] = [];
    for (const j of jobs ?? []) {
      try {
        if (j.status === "generated") {
          const r = await callFn("sicai-postprocess-svg", { job_id: j.id }, auth);
          if (!r.ok) { results.push({ job_id: j.id, step: "postprocess", error: r.json }); continue; }
        }
        const q = await callFn("sicai-run-qc", { job_id: j.id }, auth);
        results.push({ job_id: j.id, qc: q.json, ok: q.ok });
      } catch (e) {
        results.push({ job_id: j.id, error: (e as Error).message });
      }
    }

    // Refresh batch counters
    const { count: approved } = await admin.from("sicai_generation_jobs")
      .select("id", { count: "exact", head: true }).eq("batch_id", batch_id).eq("status", "approved");
    const { count: failed } = await admin.from("sicai_generation_jobs")
      .select("id", { count: "exact", head: true }).eq("batch_id", batch_id).eq("status", "qc_failed");
    const { count: remaining } = await admin.from("sicai_generation_jobs")
      .select("id", { count: "exact", head: true }).eq("batch_id", batch_id)
      .in("status", ["generated", "qc_pending"]);
    await admin.from("sicai_generation_batches").update({
      approved_count: approved ?? 0,
      failed_count: failed ?? 0,
      status: (remaining ?? 0) === 0 ? "completed" : "qc",
    }).eq("id", batch_id);

    return jsonResponse({ processed: results.length, remaining: remaining ?? 0, results });
  } catch (e) {
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});
