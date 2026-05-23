// Catch-up: re-publish all 'approved' jobs of a batch that have no published
// archetype row for that batch's theme. Idempotent — uses the shared publish
// helper with (archetype_id, theme_id) composite key.
import { jsonResponse, requireAdmin, corsHeaders } from "../_shared/sicai.ts";
import { publishArchetypeFromJob } from "../_shared/sicai-publish.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const gate = await requireAdmin(req);
    if (gate instanceof Response) return gate;
    const { admin } = gate;
    const { batch_id } = await req.json();
    if (!batch_id) return jsonResponse({ error: "batch_id required" }, 400);

    // Load batch (need theme + is_dry_run)
    const { data: batch, error: bErr } = await admin
      .from("sicai_generation_batches")
      .select("id, theme_id, theme_code, is_dry_run").eq("id", batch_id).maybeSingle();
    if (bErr || !batch) return jsonResponse({ error: "batch not found" }, 404);
    if (batch.is_dry_run) {
      return jsonResponse({ checked: 0, orphans_found: 0, republished: 0, failed: 0, skipped_reason: "dry-run batch" });
    }
    if (!batch.theme_id) return jsonResponse({ error: "batch has no theme_id" }, 400);

    const { data: jobs, error: jErr } = await admin.from("sicai_generation_jobs")
      .select("id, template_id, sicai_templates(illustration_id)")
      .eq("batch_id", batch_id).eq("status", "approved");
    if (jErr) return jsonResponse({ error: jErr.message }, 500);

    const illustrationIds = (jobs ?? [])
      .map((j: any) => j.sicai_templates?.illustration_id)
      .filter(Boolean);

    // Already published for THIS theme?
    const { data: alreadyPub } = await admin.from("sicai_archetypes")
      .select("archetype_id")
      .in("archetype_id", illustrationIds)
      .eq("theme_id", batch.theme_id)
      .eq("is_published", true);
    const publishedSet = new Set((alreadyPub ?? []).map((r: any) => r.archetype_id));

    const orphans = (jobs ?? []).filter((j: any) => {
      const ill = j.sicai_templates?.illustration_id;
      return ill && !publishedSet.has(ill);
    });

    const results: any[] = [];
    for (const j of orphans as any[]) {
      const ill = j.sicai_templates?.illustration_id;
      const pub = await publishArchetypeFromJob(admin, {
        job_id: j.id,
        illustration_id: ill,
        theme_id: batch.theme_id,
        theme_code: batch.theme_code,
      });
      results.push({ job_id: j.id, illustration_id: ill, ...pub });
      if (pub.ok) {
        await admin.from("sicai_templates")
          .update({ status: "published" }).eq("id", j.template_id);
      }
    }

    const succeeded = results.filter((r) => r.ok).length;
    const failed = results.length - succeeded;
    return jsonResponse({
      checked: jobs?.length ?? 0,
      orphans_found: orphans.length,
      republished: succeeded,
      failed,
      theme_code: batch.theme_code,
      results,
    });
  } catch (e) {
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});
