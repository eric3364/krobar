const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-token",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const KROBAR_API_BASE = "https://krobar.online/api";

const PUBLIC_ENDPOINTS = ["analyze", "render", "render-matrice", "templates", "health", "test-texts"];

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

function adminErrorResponse(message: string, status: number, code?: string) {
  return jsonResponse({ error: message, status, code }, 200);
}

function previewText(text: string, max = 120) {
  return text.slice(0, max);
}

function isLikelyHtmlResponse(text: string, contentType: string | null) {
  const lowered = (contentType ?? "").toLowerCase();
  return (
    lowered.includes("text/html") ||
    lowered.includes("text/plain") ||
    /^\s*<!doctype html/i.test(text) ||
    /^\s*<html[\s>]/i.test(text)
  );
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

    // Public Lucide endpoints — no admin token needed.
    // /lucide/catalog → JSON, /lucide/icon/<name> → raw SVG (we wrap into {svg}).
    if (path && path.startsWith("/lucide/")) {
      const url = `${KROBAR_API_BASE}${path}`;
      const httpMethod = (reqMethod ?? "GET").toUpperCase();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);
      let upstream: Response;
      try {
        upstream = await fetch(url, {
          method: httpMethod,
          headers: {
            Accept: path.startsWith("/lucide/icon/")
              ? "image/svg+xml,*/*"
              : "application/json",
          },
          signal: controller.signal,
        });
      } catch (fetchErr) {
        clearTimeout(timer);
        const msg = fetchErr instanceof DOMException && fetchErr.name === "AbortError"
          ? "Le backend Krobar n'a pas répondu à temps."
          : `Impossible de joindre le backend Krobar: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`;
        return jsonResponse({ error: msg }, 504);
      }
      clearTimeout(timer);

      if (!upstream.ok) {
        return jsonResponse(
          { error: `Erreur Krobar Lucide (${upstream.status})`, status: upstream.status },
          upstream.status === 404 ? 404 : 200,
        );
      }

      if (path.startsWith("/lucide/icon/")) {
        const svg = await upstream.text();
        return jsonResponse({ svg }, 200);
      }

      const text = await upstream.text();
      try {
        return jsonResponse(JSON.parse(text), 200);
      } catch {
        return jsonResponse({ error: "Réponse Lucide non-JSON" }, 502);
      }
    }

    // Admin path mode: path like "/admin/template/create"
    if (path) {
      const url = `${KROBAR_API_BASE}${path}`;
      const httpMethod = (reqMethod ?? "POST").toUpperCase();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 150000);

      const storedToken = Deno.env.get("KROBAR_ADMIN_TOKEN");
      if (!storedToken) {
        console.error("Missing KROBAR_ADMIN_TOKEN for admin proxy request", { path });
        return adminErrorResponse("Configuration admin Krobar manquante", 500, "missing_admin_token");
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json",
      };
      headers["X-Admin-Token"] = storedToken;

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
        if (upstream.status === 413) {
          return adminErrorResponse(
            "Le fichier envoyé au Studio est trop volumineux pour l'upload actuel via le proxy. Réduisez son poids ou exportez-le en SVG.",
            413,
            "payload_too_large",
          );
        }

        const contentType = upstream.headers.get("content-type");
        const fallbackable = upstream.status >= 500 || isLikelyHtmlResponse(text, contentType);
        const message = upstream.status >= 502 && upstream.status <= 504
          ? `Le backend Krobar est temporairement indisponible (${upstream.status}). Réessayez dans quelques secondes.`
          : `Réponse non-JSON du backend (${upstream.status}). Début: ${previewText(text)}`;
        console.error("Krobar admin non-JSON response", {
          path,
          status: upstream.status,
          contentType,
          fallbackable,
          preview: previewText(text),
        });
        return jsonResponse(
          {
            error: message,
            status: upstream.status,
            code: "upstream_non_json",
            fallback: fallbackable,
            retryable: upstream.status >= 500,
          },
          200,
        );
      }

      if (!upstream.ok) {
        if (upstream.status === 401) {
          console.error("Invalid Krobar admin token", { path, hasStoredToken: Boolean(storedToken) });
          return adminErrorResponse(
            "Le token administrateur Krobar configuré côté backend est invalide ou expiré.",
            401,
            "invalid_admin_token",
          );
        }

        let detailMessage: string | undefined;
        if (Array.isArray(data?.detail)) {
          detailMessage = (data.detail as unknown[])
            .map((d) => {
              if (d && typeof d === "object") {
                const obj = d as Record<string, unknown>;
                const loc = Array.isArray(obj.loc) ? obj.loc.join(".") : "";
                const msg = typeof obj.msg === "string" ? obj.msg : JSON.stringify(obj);
                return loc ? `${loc}: ${msg}` : msg;
              }
              return String(d);
            })
            .join(" | ");
        }
        const message =
          detailMessage ||
          (typeof data?.detail === "string" && data.detail) ||
          (typeof data?.error === "string" && data.error) ||
          `Erreur Krobar (${upstream.status})`;
        console.error("Krobar admin error", { path, status: upstream.status, body: text.slice(0, 1500) });
        return adminErrorResponse(message, upstream.status);
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
        method: endpoint === "analyze" || endpoint === "render" || endpoint === "render-matrice" ? "POST" : "GET",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        signal: controller.signal,
        body:
          endpoint === "analyze" || endpoint === "render" || endpoint === "render-matrice"
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
    const contentType = upstream.headers.get("content-type");
    let data: Record<string, unknown>;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      const message = `Réponse non-JSON du backend Krobar (${upstream.status}). Début: ${previewText(text)}`;
      const fallbackable = upstream.status >= 500 || isLikelyHtmlResponse(text, contentType);

      console.error("Krobar public endpoint returned non-JSON response", {
        endpoint,
        status: upstream.status,
        contentType,
        fallbackable,
        preview: previewText(text),
      });

      return jsonResponse(
        {
          error: message,
          status: upstream.status,
          fallback: fallbackable,
          retryable: upstream.status >= 500,
        },
        fallbackable ? 200 : 502,
      );
    }

    if (!upstream.ok) {
      const message =
        (typeof data?.detail === "string" && data.detail) ||
        (typeof data?.error === "string" && data.error) ||
        `Erreur Krobar (${upstream.status})`;
      const fallbackable = upstream.status >= 500;
      return jsonResponse(
        {
          error: message,
          status: upstream.status,
          fallback: fallbackable,
          retryable: fallbackable,
        },
        fallbackable ? 200 : upstream.status,
      );
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
