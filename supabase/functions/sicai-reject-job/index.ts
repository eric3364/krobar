import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { jsonResponse, requireAdmin } from "../_shared/sicai.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const gate = await requireAdmin(req);
    if (gate instanceof Response) return gate;
    const { admin, userId } = gate;
    const { job_id, notes } = await req.json();
    if (!job_id) return jsonResponse({ error: "job_id required" }, 400);
    if (!notes || !String(notes).trim()) {
      return jsonResponse({ error: "notes required for reject" }, 400);
    }

    const { data: job } = await admin.from("sicai_generation_jobs")
      .select("id, batch_id").eq("id", job_id).maybeSingle();
    if (!job) return jsonResponse({ error: "job not found" }, 404);

    await admin.from("sicai_reviews").insert({
      job_id, reviewer_id: userId, decision: "reject", notes,
    });
    await admin.from("sicai_generation_jobs").update({ status: "rejected" }).eq("id", job_id);

    if (job.batch_id) {
      const { count } = await admin.from("sicai_generation_jobs")
        .select("id", { count: "exact", head: true })
        .eq("batch_id", job.batch_id).in("status", ["rejected", "qc_failed"]);
      await admin.from("sicai_generation_batches")
        .update({ failed_count: count ?? 0 }).eq("id", job.batch_id);
    }

    return jsonResponse({ job_id, status: "rejected" });
  } catch (e) {
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});
