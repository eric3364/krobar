// Create a SICAI generation batch + queue all jobs with pre-computed OpenAI payloads.
import {
  requireAdmin, jsonResponse, buildOpenAIBody, slugifyCustomId,
  COST_SYNC, COST_BATCH, corsHeaders,
} from "../_shared/sicai.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method not allowed" }, 405);

  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;
  const { admin, userId } = auth;

  try {
    const body = await req.json().catch(() => ({}));
    const label: string = body.label ?? `Batch SICAI ${new Date().toISOString()}`;
    const batch_mode: string = body.batch_mode === "sync" ? "sync" : "openai_batch";
    const template_ids: string[] | null = Array.isArray(body.template_ids) && body.template_ids.length > 0
      ? body.template_ids : null;

    let q = admin.from("sicai_templates").select("id, illustration_id, prompt_full, status").order("illustration_id");
    q = template_ids ? q.in("id", template_ids) : q.eq("status", "ready");
    const { data: templates, error } = await q;
    if (error) throw error;
    if (!templates || templates.length === 0) {
      return jsonResponse({ error: "no templates eligible (status='ready')" }, 400);
    }

    const cost = (batch_mode === "sync" ? COST_SYNC : COST_BATCH) * templates.length;

    const { data: batchRow, error: batchErr } = await admin
      .from("sicai_generation_batches")
      .insert({
        label,
        batch_mode,
        request_count: templates.length,
        status: "queued",
        cost_estimate_usd: cost,
        created_by: userId,
      })
      .select("*").single();
    if (batchErr) throw batchErr;

    const jobs = templates.map((t, i) => ({
      batch_id: batchRow.id,
      template_id: t.id,
      custom_id: slugifyCustomId(i + 1, t.illustration_id),
      openai_request_json: buildOpenAIBody(t.prompt_full, batchRow.id),
      status: "queued",
    }));
    const { error: jobsErr } = await admin.from("sicai_generation_jobs").insert(jobs);
    if (jobsErr) throw jobsErr;

    return jsonResponse({
      batch_id: batchRow.id,
      request_count: templates.length,
      cost_estimate_usd: cost,
      batch_mode,
    });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
