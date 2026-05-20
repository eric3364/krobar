// Approve a job: mark approved, publish template, sync to sicai_archetypes.
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

    const { data: job, error: jErr } = await admin.from("sicai_generation_jobs")
      .select("id, status, template_id, batch_id, sicai_templates(illustration_id)")
      .eq("id", job_id).maybeSingle();
    if (jErr || !job) return jsonResponse({ error: "job not found" }, 404);
    if (!["approved", "review_needed", "qc_failed", "qc_pending"].includes(job.status)) {
      return jsonResponse({ error: `cannot approve job in status ${job.status}` }, 400);
    }
    const illustrationId = (job as any).sicai_templates?.illustration_id;

    // Find assets
    const { data: assets } = await admin.from("sicai_assets")
      .select("asset_kind, storage_path").eq("job_id", job_id);
    const byKind: Record<string, string> = {};
    for (const a of assets ?? []) byKind[a.asset_kind] = a.storage_path;

    await admin.from("sicai_reviews").insert({
      job_id, reviewer_id: userId, decision: "approve", notes: notes ?? null,
    });
    await admin.from("sicai_generation_jobs").update({ status: "approved" }).eq("id", job_id);
    await admin.from("sicai_templates").update({ status: "published" }).eq("id", job.template_id);

    // Sync to sicai_archetypes if a row matches
    let archetypeId: string | null = null;
    if (illustrationId) {
      const { data: arch } = await admin.from("sicai_archetypes")
        .select("id").eq("archetype_id", illustrationId).maybeSingle();
      if (arch) {
        await admin.from("sicai_archetypes").update({
          svg_storage_path: byKind.svg_final ?? null,
          thumbnail_storage_path: byKind.thumbnail ?? null,
          is_published: true,
          published_at: new Date().toISOString(),
          source_job_id: job_id,
        }).eq("id", arch.id);
        archetypeId = arch.id;
      }
    }

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
      published: true, archetypes_graphiques_id: archetypeId,
    });
  } catch (e) {
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});
