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
    const upstream = await fetch(url, {
      method: endpoint === "analyze" || endpoint === "render" ? "POST" : "GET",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body:
        endpoint === "analyze" || endpoint === "render"
          ? JSON.stringify(payload ?? {})
          : undefined,
    });

    const text = await upstream.text();
    const data = text ? JSON.parse(text) : {};

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
