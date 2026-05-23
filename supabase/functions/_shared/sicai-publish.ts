// Shared helper: UPSERT a job's assets into sicai_archetypes for a given theme.
// Used by sicai-approve-job, sicai-postprocess-batch (auto-publish on QC pass),
// sicai-republish-orphans (catch-up).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type PublishResult =
  | { ok: true; archetype_id: string; created: boolean }
  | { ok: false; reason: string };

/**
 * UPSERTs a sicai_archetypes row for (archetype_id, theme_id).
 * - If a row already exists for that pair → UPDATE asset paths + theme_code.
 * - Else if a row exists for (archetype_id, neutre) → INSERT a new themed row
 *   copying the structural fields (graphic_family / cardinality / regime / …)
 *   from the neutre row.
 * - Else → fail with explicit reason.
 *
 * The unique constraint (archetype_id, theme_id) guarantees idempotency.
 */
export async function publishArchetypeFromJob(
  admin: SupabaseClient,
  params: {
    job_id: string;
    illustration_id: string | null | undefined;
    theme_id: string | null | undefined;
    theme_code: string | null | undefined;
    svg_storage_path?: string | null;
    thumbnail_storage_path?: string | null;
  },
): Promise<PublishResult> {
  const { job_id, illustration_id, theme_id, theme_code } = params;
  if (!illustration_id) return { ok: false, reason: "missing illustration_id on template" };
  if (!theme_id) return { ok: false, reason: "missing theme_id on batch" };

  let svgPath = params.svg_storage_path ?? null;
  let thumbPath = params.thumbnail_storage_path ?? null;
  if (svgPath === null || thumbPath === null) {
    const { data: assets } = await admin.from("sicai_assets")
      .select("asset_kind, storage_path").eq("job_id", job_id);
    for (const a of assets ?? []) {
      if (a.asset_kind === "svg_final" && !svgPath) svgPath = a.storage_path;
      if (a.asset_kind === "thumbnail" && !thumbPath) thumbPath = a.storage_path;
    }
  }

  // Look up existing row for (archetype_id, theme_id)
  const { data: existing, error: selErr } = await admin.from("sicai_archetypes")
    .select("id")
    .eq("archetype_id", illustration_id).eq("theme_id", theme_id)
    .maybeSingle();
  if (selErr) return { ok: false, reason: `lookup failed: ${selErr.message}` };

  const patch: Record<string, unknown> = {
    svg_storage_path: svgPath,
    thumbnail_storage_path: thumbPath,
    is_published: true,
    published_at: new Date().toISOString(),
    source_job_id: job_id,
    theme_code: theme_code ?? null,
  };

  if (existing) {
    const { error: upErr } = await admin.from("sicai_archetypes")
      .update(patch).eq("id", existing.id);
    if (upErr) return { ok: false, reason: `update failed: ${upErr.message}` };
    return { ok: true, archetype_id: existing.id, created: false };
  }

  // No row for this theme → try to clone from neutre
  const { data: neutreRow, error: nErr } = await admin.from("sicai_archetypes")
    .select("archetype_id, cardinality, graphic_family, representation_regime, description, best_for, avoid_for, composition_principle, visual_motifs, possible_tones")
    .eq("archetype_id", illustration_id).eq("theme_code", "neutre")
    .maybeSingle();
  if (nErr) return { ok: false, reason: `neutre lookup failed: ${nErr.message}` };
  if (!neutreRow) {
    return { ok: false, reason: `no sicai_archetypes row for archetype_id=${illustration_id} (neither theme=${theme_code} nor neutre)` };
  }

  const insertRow = {
    archetype_id: neutreRow.archetype_id,
    cardinality: neutreRow.cardinality,
    graphic_family: neutreRow.graphic_family,
    representation_regime: neutreRow.representation_regime,
    description: neutreRow.description,
    best_for: neutreRow.best_for,
    avoid_for: neutreRow.avoid_for,
    composition_principle: neutreRow.composition_principle,
    visual_motifs: neutreRow.visual_motifs,
    possible_tones: neutreRow.possible_tones,
    theme_id,
    theme_code: theme_code ?? null,
    ...patch,
  };
  const { data: inserted, error: insErr } = await admin.from("sicai_archetypes")
    .insert(insertRow).select("id").single();
  if (insErr) return { ok: false, reason: `insert failed: ${insErr.message}` };
  return { ok: true, archetype_id: inserted.id, created: true };
}
