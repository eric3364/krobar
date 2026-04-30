// Mock backend pour tester l'édition SVG en place dans la preview Lovable
// sans avoir à déployer le backend FastAPI.
//
// Activation : si VITE_USE_MOCK_API=true, ou en fallback automatique
// quand l'API réelle renvoie 404 (cf. src/lib/api.ts).

import type { Suggestion } from "@/lib/kroki";

export type AnalyzeResponse = {
  suggestions: Suggestion[];
  latency_ms: number;
};

const MOCK_DELAY_MS = 350;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Détecte si le mock doit être utilisé.
 * - Forcé via VITE_USE_MOCK_API=true
 * - Sinon, le caller (api.ts) bascule en mock si le backend renvoie 404
 */
export function isMockForced(): boolean {
  return (import.meta.env.VITE_USE_MOCK_API as string | undefined) === "true";
}

/**
 * Réponse factice pour POST /api/analyze.
 * Renvoie 3 suggestions sur des templates RÉELS présents dans /public/templates/
 * et déjà déclarés dans manifest.json :
 *   - comparison_2_columns (riche en data-slot textuels)
 *   - process_3_steps (simple, idéal pour tester l'édition)
 *   - iceberg (métaphore, layout vertical)
 *
 * NB: la spec mentionnait "venn_2_circles" mais ce template n'existe pas
 * encore dans le projet — on le remplace par comparison_2_columns qui sert
 * la même intention de comparaison binaire.
 */
export async function mockAnalyze(
  text: string,
  _detail_level: string = "auto",
): Promise<AnalyzeResponse> {
  await delay(MOCK_DELAY_MS);

  // On essaie d'extraire un titre depuis la première ligne non vide,
  // pour que les slots reflètent vaguement le texte saisi.
  const firstLine =
    text
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length > 0) ?? "Sujet d'analyse";
  const title =
    firstLine.length > 60 ? firstLine.slice(0, 57) + "…" : firstLine;

  const suggestions: Suggestion[] = [
    {
      template_id: "comparison_2_columns",
      score: 0.92,
      reasoning:
        "[MOCK] Le texte oppose deux approches distinctes avec leurs avantages respectifs — une comparaison à deux colonnes met en évidence les contrastes.",
      slots: {
        title,
        left_label: "Approche A",
        left_item_1: "Premier avantage clé",
        left_item_2: "Deuxième caractéristique",
        left_item_3: "Troisième bénéfice",
        right_label: "Approche B",
        right_item_1: "Premier avantage opposé",
        right_item_2: "Deuxième caractéristique",
        right_item_3: "Troisième bénéfice",
      },
    },
    {
      template_id: "process_3_steps",
      score: 0.78,
      reasoning:
        "[MOCK] Le texte peut se résumer en trois étapes séquentielles, du diagnostic à la mise en œuvre.",
      slots: {
        title,
        category_label: "Démarche",
        step_1: "Analyser",
        step_1_description: "Comprendre le contexte et les enjeux initiaux.",
        step_2: "Concevoir",
        step_2_description: "Définir une stratégie adaptée aux objectifs.",
        step_3: "Déployer",
        step_3_description: "Mettre en œuvre et mesurer les résultats.",
      },
    },
    {
      template_id: "iceberg",
      score: 0.64,
      reasoning:
        "[MOCK] Le texte distingue ce qui est visible (résultats) de ce qui est sous-jacent (causes profondes).",
      slots: {
        title,
        visible_label: "Visible",
        visible_item: "Symptômes et résultats observables",
        level_1: "Comportements et pratiques",
        level_2: "Croyances et valeurs partagées",
        level_3: "Causes structurelles profondes",
      },
    },
  ];

  return {
    suggestions,
    latency_ms: MOCK_DELAY_MS,
  };
}

/**
 * Mock pour POST /api/render. Le frontend gère déjà le rendu localement
 * via loadSvg() + fillSlots(), donc cette route n'est pas réellement
 * utilisée par l'UI actuelle, mais on l'expose pour cohérence.
 */
export async function mockRender(
  template_id: string,
  slots: Record<string, string>,
): Promise<{ svg: string; template_id: string }> {
  await delay(MOCK_DELAY_MS);
  // Renvoie un SVG minimal contenant des data-slot pour vérifier l'édition.
  const slotEntries = Object.entries(slots);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" data-template="${template_id}">
  <rect width="600" height="400" fill="hsl(var(--bg, 0 0% 100%))" />
  ${slotEntries
    .map(
      ([k, v], i) =>
        `<text data-slot="${k}" x="40" y="${60 + i * 36}" font-family="sans-serif" font-size="18" fill="hsl(var(--text, 0 0% 10%))">${v}</text>`,
    )
    .join("\n  ")}
</svg>`;
  return { svg, template_id };
}
