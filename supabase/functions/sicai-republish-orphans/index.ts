// Catch-up: re-publish all 'approved' jobs of a batch that have no published
// archetype row. Idempotent — uses the shared publish helper.
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

    // All approved jobs in batch + their illustration_id.
    const { data: jobs, error: jErr } = await admin.from("sicai_generation_jobs")
      .select("id, template_id, sicai_templates(illustration_id)")
      .eq("batch_id", batch_id).eq("status", "approved");
    if (jErr) return jsonResponse({ error: jErr.message }, 500);

    const illustrationIds = (jobs ?? [])
      .map((j: any) => j.sicai_templates?.illustration_id)
      .filter(Boolean);

    // Which of those are already published?
    const { data: alreadyPub } = await admin.from("sicai_archetypes")
      .select("archetype_id").in("archetype_id", illustrationIds)
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
        job_id: j.id, illustration_id: ill,
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
      results,
    });
  } catch (e) {
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});
