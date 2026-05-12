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
- Design éditorial Krobar : STRICTEMENT NOIR & BLANC, aucune couleur. Palette autorisée UNIQUEMENT : blanc (#ffffff) pour les fonds, noir (#0f172a ou #000000) pour le texte et les contours, et des gris neutres (#f1f5f9, #e2e8f0, #cbd5e1, #94a3b8, #64748b) pour les fonds légers, séparateurs et nuances. AUCUNE couleur (pas de bleu, rouge, vert, jaune, orange, violet, etc.), aucun gradient coloré, aucun accent chromatique. N'utilise PAS les variables CSS var(--primary), var(--accent) : uniquement des valeurs hex en niveaux de gris. Tout doit rester monochromatique noir/blanc/gris.
- Tous les libellés textuels doivent être placés dans des <foreignObject> avec un <div xmlns="http://www.w3.org/1999/xhtml" data-slot="..."> pour permettre l'édition ultérieure (titre = data-slot="title", autres slots nommés sémantiquement).
- IMPÉRATIF — AUCUNE ÉTIQUETTE DE CATÉGORIE : ne JAMAIS afficher la catégorie (ex. "Stratégie d'entreprise", "Marketing", etc.) sur le rendu. Seul le NOM de la matrice doit apparaître comme titre principal (centré ou aligné à gauche en haut). Aucun sous-titre, aucun tag, aucune mention de famille ou de catégorie.
- Pas d'images bitmap, pas de <foreignObject> imbriqués.
- 1040x600, marges confortables.
- IMPÉRATIF — TITRES OBLIGATOIRES, CONTENU INTERDIT : chaque cadran, case, axe, quadrant, étape ou zone DOIT impérativement porter son libellé canonique (ex. "Forces"/"Faiblesses"/"Opportunités"/"Menaces" pour un SWOT, "Plan"/"Do"/"Check"/"Act" pour un PDCA, "Menace des Nouveaux Entrants"/"Pouvoir des Fournisseurs"… pour Porter). Ces titres guident l'utilisateur. AUCUN exemple de contenu, texte d'illustration, phrase type, bullet point ou placeholder descriptif n'est autorisé.
- IMPÉRATIF — TITRES À L'EXTÉRIEUR DES ZONES DE SAISIE : les libellés canoniques DOIVENT être placés À L'EXTÉRIEUR du rectangle/forme correspondant (au-dessus, en-dessous ou à côté), JAMAIS À L'INTÉRIEUR. L'intérieur de chaque rectangle doit rester intégralement vide pour que l'utilisateur y saisisse ses propres notes. Seul le libellé central d'un schéma à hub (ex. "Intensité Concurrentielle" au centre des 5 forces de Porter) peut figurer dans la forme centrale.
- IMPÉRATIF — ESPACE DE SAISIE GÉNÉREUX : chaque rectangle/zone de saisie doit être dimensionné largement (hauteur ≈ 110-150 px, largeur ≈ 200-260 px) pour accueillir 4 à 6 lignes manuscrites. Préférer peu de zones spacieuses à un maillage dense. Espacement entre zones ≥ 32 px (en plus de la place nécessaire au titre extérieur). Intérieur visuellement vide, contour ou fond très léger uniquement.
- IMPÉRATIF — ICÔNES EN ANGLE, JAMAIS AU CENTRE : si une icône symbolique illustre un cadran (étoile, point d'interrogation, vache, croix pour BCG ; ampoule ; etc.), elle DOIT être placée dans un ANGLE de la zone (typiquement coin supérieur gauche ou supérieur droit), en petit format (≈ 24-32 px), accompagnée du libellé canonique attenant (à côté ou juste en dessous). Aucune icône, pictogramme ou symbole ne doit occuper le centre du cadran ni en dépasser un quart de la surface : le centre et le bas de la zone restent intégralement vides pour la saisie utilisateur.`;

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
