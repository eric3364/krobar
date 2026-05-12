// Generate an SVG diagram from a matrix description using Lovable AI (text model).
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

function extractSvg(text: string): string | null {
  if (!text) return null;
  // Strip code fences
  const fenced = text.match(/```(?:svg|xml|html)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const m = candidate.match(/<svg[\s\S]*?<\/svg>/i);
  return m ? m[0] : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY missing" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { name, category, usage, comment, model } = await req.json();
    if (!name || typeof name !== "string") {
      return new Response(JSON.stringify({ error: "name required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sys = `Tu es un illustrateur de diagrammes business. Tu produis UNIQUEMENT un fichier SVG valide, sans aucun texte autour, sans markdown, sans explication.
Contraintes :
- Format <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1040 600"> avec font-family="Plus Jakarta Sans, system-ui, sans-serif".
- Design éditorial Krobar : épuré, monochrome neutre + 1 accent. Utilise les variables CSS AVEC FALLBACK OBLIGATOIRE : var(--bg, #ffffff), var(--text, #0f172a), var(--primary, #2563eb), var(--accent, #f59e0b). Ne JAMAIS écrire fill="var(--bg)" sans fallback (le SVG deviendrait noir hors contexte).
- Tous les libellés textuels doivent être placés dans des <foreignObject> avec un <div xmlns="http://www.w3.org/1999/xhtml" data-slot="..."> pour permettre l'édition ultérieure (titre = data-slot="title", autres slots nommés sémantiquement).
- En haut à gauche : étiquette catégorie. Titre principal centré ou gauche.
- Pas d'images bitmap, pas de <foreignObject> imbriqués.
- 1040x600, marges confortables.
- IMPÉRATIF : aucun cadran, case, zone, quadrant ou conteneur ne doit contenir d'exemple de contenu, de texte d'illustration, de phrases types, de bullet points pré-remplis, ni de placeholder descriptif. Seuls les libellés structurels du modèle sont autorisés (titre du modèle, nom de la catégorie, et noms canoniques des axes/quadrants/étapes — ex. "Forces", "Faiblesses", "Stars", "Cash Cows", "Étape 1"…). Les zones destinées à recevoir le contenu utilisateur doivent rester visuellement VIDES, avec suffisamment d'espace libre pour que l'utilisateur puisse les remplir lui-même par la suite.`;

    const user = `Crée le SVG de la matrice/modèle suivant :
- Nom : ${name}
- Catégorie : ${category ?? ""}
- Usage : ${usage ?? ""}
${comment ? `- Directives utilisateur : ${comment}` : ""}

Réponds avec le code SVG uniquement.`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: model || "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
      }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      return new Response(JSON.stringify({ error: `AI gateway ${resp.status}: ${t.slice(0, 500)}` }), {
        status: resp.status === 429 || resp.status === 402 ? resp.status : 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const text = data?.choices?.[0]?.message?.content ?? "";
    const svg = extractSvg(text);
    if (!svg) {
      return new Response(JSON.stringify({ error: "No <svg> in response", raw: text.slice(0, 1000) }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ svg }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
