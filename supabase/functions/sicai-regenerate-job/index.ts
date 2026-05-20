// Create a new queued job for a template (retry). Marks the old job as rejected.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { jsonResponse, requireAdmin, buildOpenAIBody } from "../_shared/sicai.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const gate = await requireAdmin(req);
    if (gate instanceof Response) return gate;
    const { admin, userId } = gate;
    const { job_id, prompt_override, notes } = await req.json();
    if (!job_id) return jsonResponse({ error: "job_id required" }, 400);
    if (!notes || !String(notes).trim()) {
      return jsonResponse({ error: "notes required for regenerate" }, 400);
    }

    const { data: job } = await admin.from("sicai_generation_jobs")
      .select("id, custom_id, template_id, batch_id, retry_count, sicai_templates(prompt_full)")
      .eq("id", job_id).maybeSingle();
    if (!job) return jsonResponse({ error: "job not found" }, 404);

    const tpl = (job as any).sicai_templates;
    const prompt = prompt_override ?? tpl?.prompt_full;
    if (!prompt) return jsonResponse({ error: "no prompt available" }, 400);

    const nextRetry = (job.retry_count ?? 0) + 1;
    const baseCustomId = (job.custom_id ?? "").replace(/-retry-\d+$/, "");
    const newCustomId = `${baseCustomId}-retry-${nextRetry}`;
    const body = buildOpenAIBody(prompt, job.batch_id ?? "regen");

    await admin.from("sicai_reviews").insert({
      job_id, reviewer_id: userId, decision: "request_regen", notes,
    });

    const { data: created, error: insErr } = await admin.from("sicai_generation_jobs")
      .insert({
        template_id: job.template_id,
        batch_id: job.batch_id,
        custom_id: newCustomId,
        status: "queued",
        retry_count: nextRetry,
        openai_request_json: body,
      }).select("id").single();
    if (insErr) return jsonResponse({ error: insErr.message }, 500);

    await admin.from("sicai_generation_jobs").update({ status: "rejected" }).eq("id", job_id);

    return jsonResponse({
      old_job_id: job_id, new_job_id: created.id, new_custom_id: newCustomId, status: "queued",
    });
  } catch (e) {
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});
