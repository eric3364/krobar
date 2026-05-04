const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-token",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const KROBAR_API_BASE = "https://krobar.online/api";

const PUBLIC_ENDPOINTS = ["analyze", "render", "templates", "health", "test-texts"];

/**
 * Fix duplicate style="" attributes on the opening <svg> tag.
 * Some backend templates already carry style="--primary:..." and the renderer
 * appends a second style="..." with the user palette → invalid XML.
 * This keeps only the LAST style attribute (the palette override).
 */
function fixDuplicateSvgStyle(svg: string): string {
  // Match the opening <svg ...> tag
  const svgTagRe = /^(<svg\b)((?:[^>]*?)>)/i;
  const m = svg.match(svgTagRe);
  if (!m) return svg;

  const prefix = m[1]; // "<svg"
  const attrsAndClose = m[2]; // ' style="..." style="..." viewBox="...">'

  // Find all style="..." occurrences
  const styleRe = /\s+style\s*=\s*"[^"]*"/g;
  const matches = [...attrsAndClose.matchAll(styleRe)];
  if (matches.length <= 1) return svg; // no duplication

  // Keep only the last style attribute, remove earlier ones
  const lastStyle = matches[matches.length - 1][0];
  // Remove ALL style attrs, then re-insert the last one right after <svg
  const cleaned = attrsAndClose.replace(styleRe, "");
  const fixed = `${prefix}${lastStyle}${cleaned}`;
  return svg.replace(m[0], fixed);
}

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

  try {
    const body = req.method !== "GET" ? await req.json() : {} as Record<string, unknown>;
    const { endpoint, payload, path, method: reqMethod, admin_token } = body as {
      endpoint?: string;
      payload?: Record<string, unknown>;
      path?: string;
      method?: string;
      admin_token?: string;
    };

    // Admin path mode: path like "/admin/template/create"
    if (path) {
      const url = `${KROBAR_API_BASE}${path}`;
      const httpMethod = (reqMethod ?? "POST").toUpperCase();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 150000);

      const storedToken = Deno.env.get("KROBAR_ADMIN_TOKEN");
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json",
      };
      if (storedToken) {
        headers["X-Admin-Token"] = storedToken;
      }

      let upstream: Response;
      try {
        upstream = await fetch(url, {
          method: httpMethod,
          headers,
          signal: controller.signal,
          body: httpMethod !== "GET" ? JSON.stringify(payload ?? {}) : undefined,
        });
      } catch (fetchErr) {
        clearTimeout(timer);
        const msg = fetchErr instanceof DOMException && fetchErr.name === "AbortError"
          ? "Le backend Krobar n'a pas répondu à temps."
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
          { error: `Réponse non-JSON du backend (${upstream.status}). Début: ${text.slice(0, 120)}` },
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
    }

    // Legacy public endpoint mode
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    if (!endpoint || !PUBLIC_ENDPOINTS.includes(endpoint)) {
      return jsonResponse({ error: "Invalid endpoint" }, 400);
    }

    const url = `${KROBAR_API_BASE}/${endpoint}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 150000);

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
        ? "Le backend Krobar n'a pas répondu à temps."
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

    // Fix duplicate style attributes on <svg> for render responses
    if (endpoint === "render" && typeof data.svg === "string") {
      data.svg = fixDuplicateSvgStyle(data.svg);
    }

    return jsonResponse(data, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected failure";
    return jsonResponse({ error: message }, 500);
  }
});
