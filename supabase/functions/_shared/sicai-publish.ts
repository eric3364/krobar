// Shared helper: UPSERT a job's assets into sicai_archetypes.
// Used by sicai-approve-job, sicai-postprocess-batch (auto-publish on QC pass),
// and sicai-republish-orphans (catch-up button).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type PublishResult =
  | { ok: true; archetype_id: string; created: boolean }
  | { ok: false; reason: string };

/**
 * UPSERTs a sicai_archetypes row from a successful job.
 * - Looks up assets for the job (svg_final + thumbnail) if not provided.
 * - Requires the template's illustration_id (= archetype_id key).
 * - Idempotent: safe to call multiple times for the same job.
 */
export async function publishArchetypeFromJob(
  admin: SupabaseClient,
  params: {
    job_id: string;
    illustration_id: string | null | undefined;
    // Optional pre-fetched paths to avoid an extra query.
    svg_storage_path?: string | null;
    thumbnail_storage_path?: string | null;
  },
): Promise<PublishResult> {
  const { job_id, illustration_id } = params;
  if (!illustration_id) {
    return { ok: false, reason: "missing illustration_id on template" };
  }

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

  // Check existing row (we keep the existing id rather than relying on upsert
  // to preserve it — and we need to know whether the row pre-exists).
  const { data: existing, error: selErr } = await admin.from("sicai_archetypes")
    .select("id").eq("archetype_id", illustration_id).maybeSingle();
  if (selErr) return { ok: false, reason: `lookup failed: ${selErr.message}` };

  const patch = {
    svg_storage_path: svgPath,
    thumbnail_storage_path: thumbPath,
    is_published: true,
    published_at: new Date().toISOString(),
    source_job_id: job_id,
  };

  if (existing) {
    const { error: upErr } = await admin.from("sicai_archetypes")
      .update(patch).eq("id", existing.id);
    if (upErr) return { ok: false, reason: `update failed: ${upErr.message}` };
    return { ok: true, archetype_id: existing.id, created: false };
  }

  // No existing row — insert (requires graphic_family / cardinality /
  // representation_regime which we don't reliably have here, so this is a
  // best-effort branch). In practice all 79 archetypes are seeded upfront.
  return { ok: false, reason: `no sicai_archetypes row for archetype_id=${illustration_id}` };
}
