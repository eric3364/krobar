const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const KROBAR_API_BASE = "https://krobar.online/api";

type Endpoint = "analyze" | "render" | "templates" | "health";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const { endpoint, payload } = await req.json() as {
      endpoint?: Endpoint;
      payload?: Record<string, unknown>;
    };

    if (!endpoint || !["analyze", "render", "templates", "health"].includes(endpoint)) {
      return jsonResponse({ error: "Invalid endpoint" }, 400);
    }

    const url = `${KROBAR_API_BASE}/${endpoint}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 55000);

    let upstream: Response;
    try {
      upstream = await fetch(url, {
        method: endpoint === "analyze" || endpoint === "render" ? "POST" : "GET",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        signal: controller.signal,
        body:
          endpoint === "analyze" || endpoint === "render"
            ? JSON.stringify(payload ?? {})
            : undefined,
      });
    } catch (fetchErr) {
      clearTimeout(timer);
      const msg = fetchErr instanceof DOMException && fetchErr.name === "AbortError"
        ? "Le backend Krobar n'a pas répondu dans les 55 secondes."
        : `Impossible de joindre le backend Krobar: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`;
      return jsonResponse({ error: msg }, 504);
    }
    clearTimeout(timer);

    const text = await upstream.text();
    let data: Record<string, unknown>;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      return jsonResponse(
        { error: `Réponse non-JSON du backend Krobar (${upstream.status}). Début: ${text.slice(0, 120)}` },
        502,
      );
    }

    if (!upstream.ok) {
      const message =
        (typeof data?.detail === "string" && data.detail) ||
        (typeof data?.error === "string" && data.error) ||
        `Erreur Krobar (${upstream.status})`;
      return jsonResponse({ error: message, status: upstream.status }, upstream.status);
    }

    return jsonResponse(data, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected failure";
    return jsonResponse({ error: message }, 500);
  }
});
