// Fetch URL and extract readable text for SICAI document import
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { request as httpsRequest } from "node:https";
import { Buffer } from "node:buffer";

const REQUEST_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; KrobarSICAI/1.0)",
  "Accept": "text/html,application/xhtml+xml",
  "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function stripHtml(html: string): string {
  // Remove scripts/styles
  let s = html.replace(/<script[\s\S]*?<\/script>/gi, " ")
              .replace(/<style[\s\S]*?<\/style>/gi, " ")
              .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
              .replace(/<!--[\s\S]*?-->/g, " ");
  // Prefer <article> or <main> body if present
  const article = s.match(/<article[\s\S]*?<\/article>/i)?.[0]
    ?? s.match(/<main[\s\S]*?<\/main>/i)?.[0];
  if (article) s = article;
  // Convert block tags to newlines
  s = s.replace(/<\/(p|div|section|article|li|h[1-6]|br)>/gi, "\n")
       .replace(/<br\s*\/?>/gi, "\n");
  // Strip remaining tags
  s = s.replace(/<[^>]+>/g, " ");
  // Decode common entities
  s = s.replace(/&nbsp;/g, " ")
       .replace(/&amp;/g, "&")
       .replace(/&lt;/g, "<")
       .replace(/&gt;/g, ">")
       .replace(/&quot;/g, '"')
       .replace(/&#39;/g, "'")
       .replace(/&rsquo;/g, "'")
       .replace(/&lsquo;/g, "'")
       .replace(/&ldquo;/g, '"')
       .replace(/&rdquo;/g, '"')
       .replace(/&mdash;/g, "—")
       .replace(/&ndash;/g, "–")
       .replace(/&hellip;/g, "…");
  // Normalize whitespace
  s = s.replace(/[ \t]+/g, " ")
       .replace(/\n\s*\n\s*\n+/g, "\n\n")
       .split("\n").map((l) => l.trim()).join("\n").trim();
  return s;
}

function extractTitle(html: string): string | null {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  if (og) return og[1];
  const t = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return t ? t[1].trim() : null;
}

function normalizeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isLikelyHttp2Error(message: string): boolean {
  return /http2 error|stream error|sendrequest|unexpected internal error encountered/i.test(message);
}

function isLikelyBlockedPage(status: number, html: string): boolean {
  if (status === 401 || status === 403 || status === 429) return true;
  return /access denied|forbidden|captcha|verify you are human|bot detection|request unsuccessful|errors\.edgesuite\.net/i.test(html);
}

async function fetchWithNative(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(url, {
      headers: REQUEST_HEADERS,
      redirect: "follow",
      signal: controller.signal,
    });
    const html = await res.text();
    return { status: res.status, html };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithHttpsFallback(url: string, redirectCount = 0): Promise<{ status: number; html: string }> {
  if (redirectCount > 5) {
    throw new Error("Trop de redirections lors de la récupération de l'URL");
  }

  return await new Promise((resolve, reject) => {
    const req = httpsRequest(url, {
      method: "GET",
      headers: {
        ...REQUEST_HEADERS,
        "Accept-Encoding": "identity",
      },
    }, (res) => {
      const status = res.statusCode ?? 0;
      const location = res.headers.location;

      if ([301, 302, 303, 307, 308].includes(status) && typeof location === "string") {
        res.resume();
        const nextUrl = new URL(location, url).toString();
        fetchWithHttpsFallback(nextUrl, redirectCount + 1).then(resolve).catch(reject);
        return;
      }

      const chunks: Buffer[] = [];
      res.on("data", (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      res.on("end", () => {
        resolve({
          status,
          html: Buffer.concat(chunks).toString("utf8"),
        });
      });
      res.on("error", reject);
    });

    req.setTimeout(30000, () => {
      req.destroy(new Error("Timeout lors de la récupération de l'URL"));
    });
    req.on("error", reject);
    req.end();
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => null);
    const url = body?.url;
    if (!url || typeof url !== "string") {
      return jsonResponse({ error: "url requis" }, 400);
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return jsonResponse({ error: "URL invalide" }, 400);
    }

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return jsonResponse({ error: "Seules les URL http(s) sont acceptées" }, 400);
    }

    let status = 0;
    let html = "";

    try {
      const nativeResult = await fetchWithNative(parsedUrl.toString());
      status = nativeResult.status;
      html = nativeResult.html;
    } catch (error) {
      const message = normalizeError(error);

      if (!isLikelyHttp2Error(message)) {
        return jsonResponse({
          error: `Impossible de récupérer cette URL automatiquement: ${message}`,
        });
      }

      try {
        const fallbackResult = await fetchWithHttpsFallback(parsedUrl.toString());
        status = fallbackResult.status;
        html = fallbackResult.html;
      } catch (fallbackError) {
        return jsonResponse({
          error: `Impossible de récupérer cette URL automatiquement: ${normalizeError(fallbackError)}`,
          technical_error: message,
        });
      }
    }

    if (!html.trim()) {
      return jsonResponse({ error: "La source n'a renvoyé aucun contenu exploitable" });
    }

    if (status >= 400) {
      if (isLikelyBlockedPage(status, html)) {
        return jsonResponse({
          error: "Le site source bloque l'extraction automatique depuis le backend (anti-bot / accès refusé). Ouvrez l'article puis collez le texte manuellement dans SICAI.",
          blocked: true,
          source_status: status,
        });
      }

      return jsonResponse({
        error: `Le site source a répondu HTTP ${status}.`,
        source_status: status,
      });
    }

    const text = stripHtml(html);
    if (!text || text.split(/\s+/).filter(Boolean).length < 30) {
      if (isLikelyBlockedPage(status, html)) {
        return jsonResponse({
          error: "Le site source bloque l'extraction automatique depuis le backend (anti-bot / accès refusé). Ouvrez l'article puis collez le texte manuellement dans SICAI.",
          blocked: true,
          source_status: status,
        });
      }

      return jsonResponse({ error: "Aucun texte exploitable n'a pu être extrait depuis cette URL." });
    }

    const title = extractTitle(html);
    return jsonResponse({ text, title, word_count: text.split(/\s+/).filter(Boolean).length });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : "Erreur inconnue" }, 500);
  }
});
