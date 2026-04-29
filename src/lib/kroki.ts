import { palettes, type Palette } from "@/palettes";

export type ManifestTemplate = {
  id: string;
  name: string;
  category: string;
  description: string;
  file: string;
  slots: string[];
  best_for: string;
};

export type Manifest = { templates: ManifestTemplate[] };

export type Suggestion = {
  template_id: string;
  score: number;
  reasoning: string;
  slots: Record<string, string>;
};

export const API_KEY_STORAGE = "kroki_claude_api_key";

// Re-export pour compatibilité — la source unique est /src/lib/format.ts
export { formatScore, formatScorePct, normalizeScore } from "./format";
import { normalizeScore } from "./format";

export function applyPaletteVars(el: SVGElement, palette: Palette) {
  el.style.setProperty("--primary", palette.primary);
  el.style.setProperty("--accent", palette.accent);
  el.style.setProperty("--bg", palette.bg);
  el.style.setProperty("--text", palette.text);
}

function parsePctValue(raw: string | undefined, fallback = 25): number {
  if (!raw) return fallback;
  const n = parseFloat(String(raw).replace("%", "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function applyStackedBarPercentages(svg: SVGElement, slots: Record<string, string>) {
  const X0 = 40;
  const TOTAL_W = 510;
  const Y = 240;
  const H = 120;
  const pcts = [1, 2, 3, 4].map((i) => parsePctValue(slots[`segment_${i}_percent`]));
  const sum = pcts.reduce((a, b) => a + b, 0) || 1;
  const norm = pcts.map((p) => (p / sum) * 100);
  let cursor = X0;
  norm.forEach((pct, idx) => {
    const w = (pct / 100) * TOTAL_W;
    const seg = svg.querySelector(`[data-slot="seg_${idx + 1}"]`) as SVGRectElement | null;
    if (seg) {
      seg.setAttribute("x", String(cursor));
      seg.setAttribute("y", String(Y));
      seg.setAttribute("width", String(w));
      seg.setAttribute("height", String(H));
    }
    const labelFO = svg.querySelector(
      `foreignObject[data-slot-pos="segment_${idx + 1}_percent"]`
    ) as SVGForeignObjectElement | null;
    if (labelFO) {
      const lw = parseFloat(labelFO.getAttribute("width") || "82");
      const lh = parseFloat(labelFO.getAttribute("height") || "32");
      labelFO.setAttribute("x", String(cursor + w / 2 - lw / 2));
      labelFO.setAttribute("y", String(Y + H / 2 - lh / 2));
      labelFO.setAttribute("opacity", w < lw * 0.55 ? "0" : "1");
    }
    cursor += w;
  });
}

function applyDonutPercentages(svg: SVGElement, slots: Record<string, string>) {
  const pcts = [1, 2, 3, 4].map((i) => parsePctValue(slots[`percent_${i}`]));
  const sum = pcts.reduce((a, b) => a + b, 0) || 1;
  const norm = pcts.map((p) => (p / sum) * 100);
  const C = 2 * Math.PI * 130;
  let cumulative = 0;
  norm.forEach((pct, idx) => {
    const arc = svg.querySelector(`[data-slot="arc_${idx + 1}"]`) as SVGCircleElement | null;
    const len = (pct / 100) * C;
    if (arc) {
      arc.setAttribute("stroke-dasharray", `${len.toFixed(2)} ${(C - len).toFixed(2)}`);
      arc.setAttribute("stroke-dashoffset", `${(-(cumulative / 100) * C).toFixed(2)}`);
    }
    const midPct = cumulative + pct / 2;
    const angle = (midPct / 100) * 2 * Math.PI - Math.PI / 2;
    const labelR = 130;
    const cx = 260 + labelR * Math.cos(angle);
    const cy = 340 + labelR * Math.sin(angle);
    const labelFO = svg.querySelector(
      `foreignObject[data-slot-pos="percent_${idx + 1}"]`
    ) as SVGForeignObjectElement | null;
    if (labelFO) {
      const w = parseFloat(labelFO.getAttribute("width") || "80");
      const h = parseFloat(labelFO.getAttribute("height") || "34");
      labelFO.setAttribute("x", String(cx - w / 2));
      labelFO.setAttribute("y", String(cy - h / 2));
      labelFO.setAttribute("opacity", pct < 4 ? "0" : "1");
    }
    cumulative += pct;
  });
}

export function fillSlots(svg: SVGElement, slots: Record<string, string>) {
  Object.entries(slots).forEach(([k, v]) => {
    const el = svg.querySelector(`[data-slot="${k}"]`) as HTMLElement | SVGElement | null;
    if (!el) return;
    el.textContent = v;
    if (v && v.length > 35 && el instanceof HTMLElement) {
      el.style.fontSize = "11px";
    }
  });
  if (svg.getAttribute("data-template") === "donut_4_parts") {
    applyDonutPercentages(svg, slots);
  }
  if (svg.getAttribute("data-template") === "stacked_bar") {
    applyStackedBarPercentages(svg, slots);
  }
}

export async function loadSvg(file: string): Promise<SVGElement> {
  const res = await fetch(`/templates/${file}`);
  const txt = await res.text();
  const doc = new DOMParser().parseFromString(txt, "image/svg+xml");
  return doc.documentElement as unknown as SVGElement;
}

export function svgToString(svg: SVGElement): string {
  return new XMLSerializer().serializeToString(svg);
}

export function buildSystemPrompt(manifest: Manifest, text: string) {
  const compactIndex = manifest.templates.map((t) => ({
    id: t.id,
    category: t.category,
    best_for: t.best_for,
    slot_count: t.slots.length,
    slots: t.slots,
  }));
  return `Tu es un assistant qui sélectionne des templates SVG pour visualiser du texte.

BIBLIOTHÈQUE (index compact) :
${JSON.stringify(compactIndex)}

TEXTE DE L'UTILISATEUR :
${text}

MÉTHODE — suis ces étapes mentalement AVANT de répondre (ne les écris pas) :
1. Identifie la STRUCTURE dominante du texte parmi : séquentielle, comparative, hiérarchique, causale, temporelle, partitive, analytique (cadre business), métaphorique, mentale.
2. Choisis les 3 templates dont la "category" et le "best_for" correspondent LE MIEUX.
3. Classe-les par score décroissant.

CONTRAINTE STRICTE sur chaque valeur de slot :
- MAXIMUM 5 mots ET 35 caractères.
- Privilégie les formulations NOMINALES courtes.

FORMAT DE RÉPONSE — UNIQUEMENT un JSON strict :
{
  "suggestions": [
    { "template_id": "...", "score": 0.0, "reasoning": "...", "slots": { "title": "...", "...": "..." } }
  ]
}

CONTRAINTE STRICTE sur le score :
- Le score doit être un nombre décimal entre 0.0 et 1.0 (exemple : 0.95 pour 95% de pertinence).
- N'utilise JAMAIS un nombre supérieur à 1.

Renvoie EXACTEMENT 3 suggestions, classées par score décroissant. Remplis tous les slots listés.`;
}

export async function callClaude(
  apiKey: string,
  manifest: Manifest,
  text: string
): Promise<{ suggestions: Suggestion[]; latencyMs: number }> {
  const prompt = buildSystemPrompt(manifest, text);
  const t0 = performance.now();
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API ${res.status}: ${err}`);
  }
  const data = await res.json();
  const raw: string = data.content?.[0]?.text ?? "";
  const cleaned = raw.replace(/```json\s*|\s*```/g, "").trim();
  const parsed = JSON.parse(cleaned);
  const rawSuggestions: Suggestion[] = parsed.suggestions ?? [];
  if (rawSuggestions.length === 0) throw new Error("Aucune suggestion");
  // Normalisation à réception : score forcé en décimal 0-1.
  const suggestions = rawSuggestions.map((s) => ({ ...s, score: normalizeScore(s.score) }));
  return { suggestions, latencyMs: Math.round(performance.now() - t0) };
}

// Quality checks for the test suite.
export function checkSlotsLength(slots: Record<string, string>): {
  ok: boolean;
  offenders: string[];
} {
  const offenders = Object.entries(slots)
    .filter(([, v]) => typeof v === "string" && v.length > 35)
    .map(([k]) => k);
  return { ok: offenders.length === 0, offenders };
}

export function checkPaletteApplied(svg: SVGElement, palette: Palette): boolean {
  // Vérifie que les CSS variables sont définies sur la racine du SVG.
  const p = svg.style.getPropertyValue("--primary").trim();
  const a = svg.style.getPropertyValue("--accent").trim();
  return p === palette.primary && a === palette.accent;
}

export { palettes };
