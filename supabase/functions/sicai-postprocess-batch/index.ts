// Process up to N jobs of a batch through post-process + QC (bounded for timeout).
import { jsonResponse, requireAdmin, corsHeaders } from "../_shared/sicai.ts";
import { publishArchetypeFromJob } from "../_shared/sicai-publish.ts";



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
    const { batch_id, limit = 8, qc_only = false, continue_until_done = false } = await req.json();
    if (!batch_id) return jsonResponse({ error: "batch_id required" }, 400);

    // qc_only: re-run sicai-run-qc on already-postprocessed jobs (preserves assets).
    // Default: process raw "generated" jobs through postprocess + QC.
    const targetStatuses = qc_only
      ? ["approved", "review_needed", "qc_failed", "qc_pending"]
      : ["generated", "qc_pending"];

    let jobs: Array<{ id: string; status: string }> = [];
    if (qc_only) {
      // Select all candidates, then order by "least recently QC-checked" (NULLS FIRST)
      // so successive clicks progress through the full batch.
      const { data: allJobs } = await admin.from("sicai_generation_jobs")
        .select("id, status").eq("batch_id", batch_id).in("status", targetStatuses);
      const ids = (allJobs ?? []).map((j) => j.id);
      const lastChecked: Record<string, string> = {};
      if (ids.length > 0) {
        const { data: qcRows } = await admin.from("sicai_qc_checks")
          .select("job_id, created_at").in("job_id", ids);
        for (const r of qcRows ?? []) {
          const cur = lastChecked[r.job_id];
          if (!cur || (r.created_at && r.created_at > cur)) lastChecked[r.job_id] = r.created_at;
        }
      }
      jobs = (allJobs ?? []).slice().sort((a, b) => {
        const la = lastChecked[a.id];
        const lb = lastChecked[b.id];
        if (!la && !lb) return 0;
        if (!la) return -1; // NULLS FIRST
        if (!lb) return 1;
        return la < lb ? -1 : la > lb ? 1 : 0;
      }).slice(0, limit);
    } else {
      const { data } = await admin.from("sicai_generation_jobs")
        .select("id, status").eq("batch_id", batch_id)
        .in("status", targetStatuses).limit(limit);
      jobs = data ?? [];
    }

    const results: any[] = [];
    for (const j of jobs) {
      try {
        if (!qc_only && j.status === "generated") {
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
    const { count: review } = await admin.from("sicai_generation_jobs")
      .select("id", { count: "exact", head: true }).eq("batch_id", batch_id).eq("status", "review_needed");
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

    // Chain next chunk in background if requested and work remains.
    // This keeps post-processing alive even if the browser closes.
    const willContinue = continue_until_done && !qc_only && (remaining ?? 0) > 0 && results.length > 0;
    if (willContinue) {
      const next = fetch(`${SUPABASE_URL}/functions/v1/sicai-postprocess-batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: auth },
        body: JSON.stringify({ batch_id, limit, continue_until_done: true }),
      }).catch((e) => console.error("chain failed", e));
      // @ts-ignore - EdgeRuntime is available in Supabase Edge runtime
      try { EdgeRuntime.waitUntil(next); } catch { /* ignore */ }
    }

    return jsonResponse({
      processed: results.length,
      remaining: remaining ?? 0,
      approved: approved ?? 0,
      review: review ?? 0,
      failed: failed ?? 0,
      continuing: willContinue,
      results,
    });
  } catch (e) {
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});
