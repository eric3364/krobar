// Fetch URL and extract readable text for SICAI document import
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "url requis" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; KrobarSICAI/1.0)",
        "Accept": "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    if (!res.ok) {
      return new Response(JSON.stringify({ error: `HTTP ${res.status}` }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const html = await res.text();
    const text = stripHtml(html);
    const title = extractTitle(html);
    return new Response(JSON.stringify({ text, title, word_count: text.split(/\s+/).filter(Boolean).length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erreur inconnue" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
