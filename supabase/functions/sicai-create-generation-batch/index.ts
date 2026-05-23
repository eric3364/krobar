// Create a SICAI generation batch + queue all jobs with pre-computed OpenAI payloads.
// Phase A: applique le thème (Bloc 0.5 + cell briefs) au prompt à la volée,
// stocke le prompt résolu dans jobs.openai_request_json. Le prompt canonique
// (sicai_templates.prompt_full) reste inchangé.
import {
  requireAdmin, jsonResponse, buildOpenAIBody, slugifyCustomId,
  COST_SYNC, COST_BATCH, corsHeaders, resolveThemedPrompt, sha256,
  type ThemeRow,
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
    const is_dry_run: boolean = body.is_dry_run === true;

    // Resolve theme (defaults to 'neutre')
    let theme: ThemeRow | null = null;
    if (body.theme_id) {
      const { data, error } = await admin.from("sicai_themes")
        .select("id, code, label_fr, description, visual_lexicon, constraints, cell_briefs, prompt_bloc_addition")
        .eq("id", body.theme_id).maybeSingle();
      if (error) throw error;
      if (!data) return jsonResponse({ error: `theme_id ${body.theme_id} not found` }, 400);
      theme = data as ThemeRow;
    } else {
      const { data, error } = await admin.from("sicai_themes")
        .select("id, code, label_fr, description, visual_lexicon, constraints, cell_briefs, prompt_bloc_addition")
        .eq("code", "neutre").maybeSingle();
      if (error) throw error;
      if (!data) return jsonResponse({ error: "default theme 'neutre' missing" }, 500);
      theme = data as ThemeRow;
    }

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
        theme_id: theme.id,
        theme_code: theme.code,
        is_dry_run,
      })
      .select("*").single();
    if (batchErr) throw batchErr;

    // Resolve theme-applied prompt for each template, compute checksum.
    const jobs = await Promise.all(templates.map(async (t, i) => {
      const resolvedPrompt = resolveThemedPrompt(t.prompt_full, t.illustration_id, theme);
      return {
        batch_id: batchRow.id,
        template_id: t.id,
        custom_id: slugifyCustomId(i + 1, t.illustration_id, batchRow.id),
        openai_request_json: buildOpenAIBody(resolvedPrompt, batchRow.id),
        status: "queued",
      };
    }));
    const { error: jobsErr } = await admin.from("sicai_generation_jobs").insert(jobs);
    if (jobsErr) throw jobsErr;

    return jsonResponse({
      batch_id: batchRow.id,
      request_count: templates.length,
      cost_estimate_usd: cost,
      batch_mode,
      theme_id: theme.id,
      theme_code: theme.code,
      is_dry_run,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message
      : (e && typeof e === "object") ? JSON.stringify(e)
      : String(e);
    console.error("sicai-create-generation-batch error:", msg, e);
    return jsonResponse({ error: msg }, 500);
  }
});
