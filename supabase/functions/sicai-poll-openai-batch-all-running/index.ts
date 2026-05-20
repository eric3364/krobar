// Poll every SICAI batch currently running. Intended for an external scheduler (cron).
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { adminClient, jsonResponse } from "../_shared/sicai.ts";
import { pollBatch } from "../sicai-poll-openai-batch/index.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

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
        const r = await pollBatch(admin, b.id);
        results.push(r);
      } catch (e: any) {
        results.push({ batch_id: b.id, error: e?.message ?? String(e) });
      }
    }
    return jsonResponse({ polled: results.length, results });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
