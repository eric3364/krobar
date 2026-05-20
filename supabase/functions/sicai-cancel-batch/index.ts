// Cancel a SICAI batch: cancels OpenAI batch if applicable, marks local batch + jobs as cancelled.
import { requireAdmin, jsonResponse, corsHeaders } from "../_shared/sicai.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method not allowed" }, 405);

  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;
  const { admin } = auth;

  try {
    const { batch_id } = await req.json();
    if (!batch_id) return jsonResponse({ error: "batch_id required" }, 400);

    const { data: batch, error } = await admin
      .from("sicai_generation_batches").select("*").eq("id", batch_id).single();
    if (error || !batch) return jsonResponse({ error: "batch not found" }, 404);

    if (["done", "cancelled", "failed"].includes(batch.status)) {
      return jsonResponse({ error: `batch already ${batch.status}` }, 400);
    }

    // Try to cancel on OpenAI side if a remote batch exists
    let openaiCancel: any = null;
    if (batch.openai_batch_id && OPENAI_API_KEY) {
      try {
        const r = await fetch(
          `https://api.openai.com/v1/batches/${batch.openai_batch_id}/cancel`,
          { method: "POST", headers: { "Authorization": `Bearer ${OPENAI_API_KEY}` } },
        );
        openaiCancel = { status: r.status, ok: r.ok };
        if (!r.ok) openaiCancel.body = (await r.text()).slice(0, 500);
      } catch (e: any) {
        openaiCancel = { error: e?.message ?? String(e) };
      }
    }

    await admin.from("sicai_generation_batches")
      .update({ status: "cancelled" }).eq("id", batch_id);

    await admin.from("sicai_generation_jobs")
      .update({ status: "qc_failed", error_code: "cancelled", error_message: "batch cancelled by admin" })
      .eq("batch_id", batch_id)
      .in("status", ["queued", "generating"]);

    return jsonResponse({ batch_id, status: "cancelled", openai_cancel: openaiCancel });
  } catch (e) {
    const msg = e instanceof Error ? e.message
      : (e && typeof e === "object") ? JSON.stringify(e)
      : String(e);
    console.error("sicai-cancel-batch error:", msg, e);
    return jsonResponse({ error: msg }, 500);
  }
});
