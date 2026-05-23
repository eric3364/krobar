// Approve a job: mark approved, publish template, sync to sicai_archetypes.
import { jsonResponse, requireAdmin, corsHeaders } from "../_shared/sicai.ts";
import { publishArchetypeFromJob } from "../_shared/sicai-publish.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const gate = await requireAdmin(req);
    if (gate instanceof Response) return gate;
    const { admin, userId } = gate;
    const { job_id, notes } = await req.json();
    if (!job_id) return jsonResponse({ error: "job_id required" }, 400);

    const { data: job, error: jErr } = await admin.from("sicai_generation_jobs")
      .select("id, status, template_id, batch_id, sicai_templates(illustration_id), sicai_generation_batches(theme_id, theme_code, is_dry_run)")
      .eq("id", job_id).maybeSingle();
    if (jErr || !job) return jsonResponse({ error: "job not found" }, 404);
    if (!["approved", "review_needed", "qc_failed", "qc_pending"].includes(job.status)) {
      return jsonResponse({ error: `cannot approve job in status ${job.status}` }, 400);
    }
    const illustrationId = (job as any).sicai_templates?.illustration_id;
    const batchInfo = (job as any).sicai_generation_batches;

    await admin.from("sicai_reviews").insert({
      job_id, reviewer_id: userId, decision: "approve", notes: notes ?? null,
    });
    await admin.from("sicai_generation_jobs").update({ status: "approved" }).eq("id", job_id);
    await admin.from("sicai_templates").update({ status: "published" }).eq("id", job.template_id);

    const pub = batchInfo?.is_dry_run
      ? { ok: false as const, reason: "skipped: dry-run batch" }
      : await publishArchetypeFromJob(admin, {
          job_id,
          illustration_id: illustrationId,
          theme_id: batchInfo?.theme_id,
          theme_code: batchInfo?.theme_code,
        });

    // Refresh batch approved_count
    if (job.batch_id) {
      const { count } = await admin.from("sicai_generation_jobs")
        .select("id", { count: "exact", head: true })
        .eq("batch_id", job.batch_id).eq("status", "approved");
      await admin.from("sicai_generation_batches")
        .update({ approved_count: count ?? 0 }).eq("id", job.batch_id);
    }

    return jsonResponse({
      job_id, template_id: job.template_id, illustration_id: illustrationId,
      published: pub.ok,
      archetypes_graphiques_id: pub.ok ? pub.archetype_id : null,
      publish_error: pub.ok ? null : pub.reason,
    });
  } catch (e) {
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});
