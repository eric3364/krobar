// Poll every SICAI batch currently running. Intended for an external scheduler (cron).
import { adminClient, jsonResponse, corsHeaders } from "../_shared/sicai.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!OPENAI_API_KEY) return jsonResponse({ error: "OPENAI_API_KEY missing" }, 500);

  const admin = adminClient();
  try {
    const { data: batches, error } = await admin
      .from("sicai_generation_batches")
      .select("id").eq("status", "running").limit(10);
    if (error) throw error;

    const results: any[] = [];
    for (const b of batches ?? []) {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/sicai-poll-openai-batch`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SERVICE_ROLE}`,
            "x-internal-cron": "1",
          },
          body: JSON.stringify({ batch_id: b.id }),
        });
        const json = await res.json().catch(() => ({}));
        results.push({ batch_id: b.id, ...json });
      } catch (e: any) {
        results.push({ batch_id: b.id, error: e?.message ?? String(e) });
      }
    }
    return jsonResponse({ polled: results.length, results });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
