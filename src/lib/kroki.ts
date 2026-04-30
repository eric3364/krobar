import { palettes, type Palette } from "@/palettes";
import { analyzeText } from "@/lib/api";

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

// Re-export pour compatibilité — la source unique est /src/lib/format.ts
export { formatScore, formatScorePct, normalizeScore } from "./format";
import { normalizeScore } from "./format";

export function applyPaletteVars(el: SVGElement, palette: Palette) {
  const c = palette.colors;
  el.style.setProperty("--primary", c.primary);
  el.style.setProperty("--accent", c.accent);
  el.style.setProperty("--bg", c.bg);
  el.style.setProperty("--text", c.text);
  el.style.setProperty("--muted", c.muted);
  el.style.setProperty("--surface", c.surface);
  el.style.setProperty("--border", c.border);
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

function wrapTextIntoTspans(
  el: SVGElement,
  text: string,
  x: number,
  maxChars: number,
  maxLines: number,
  dy: number,
) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const cand = cur ? cur + " " + w : w;
    if (cand.length <= maxChars) {
      cur = cand;
    } else {
      if (cur) lines.push(cur);
      cur = w;
      if (lines.length >= maxLines) break;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length > maxLines) lines.length = maxLines;
  // Detect overflow: more words remain than fit
  const joined = lines.join(" ");
  if (joined.length < text.replace(/\s+/g, " ").trim().length && lines.length > 0) {
    const last = lines[lines.length - 1];
    lines[lines.length - 1] = (last.length > maxChars - 3 ? last.slice(0, maxChars - 3) : last) + "…";
  }
  // Clear existing children, then write tspans
  while (el.firstChild) el.removeChild(el.firstChild);
  const SVG_NS = "http://www.w3.org/2000/svg";
  lines.forEach((line, i) => {
    const tspan = document.createElementNS(SVG_NS, "tspan");
    tspan.setAttribute("x", String(x));
    tspan.setAttribute("dy", i === 0 ? "0" : String(dy));
    tspan.textContent = line;
    el.appendChild(tspan);
  });
}

export function fillSlots(svg: SVGElement, slots: Record<string, string>) {
  Object.entries(slots).forEach(([k, v]) => {
    const el = svg.querySelector(`[data-slot="${k}"]`) as HTMLElement | SVGElement | null;
    if (!el) return;
    // SVG <text> with wrap metadata → multi-line tspans
    if (el instanceof SVGElement && el.hasAttribute("data-wrap-max")) {
      const x = parseFloat(el.getAttribute("data-wrap-x") || "0");
      const maxChars = parseInt(el.getAttribute("data-wrap-max") || "22", 10);
      const maxLines = parseInt(el.getAttribute("data-wrap-lines") || "3", 10);
      const dy = parseFloat(el.getAttribute("data-wrap-dy") || "18");
      wrapTextIntoTspans(el, v ?? "", x, maxChars, maxLines, dy);
      return;
    }
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

/**
 * Charge le SVG d'un template depuis /templates/ (servi en statique par nginx).
 * Le backend FastAPI ne sert PAS le SVG : il ne fait que la sélection IA.
 */
export async function loadSvg(file: string): Promise<SVGElement> {
  const res = await fetch(`/templates/${file}`);
  const txt = await res.text();
  const doc = new DOMParser().parseFromString(txt, "image/svg+xml");
  return doc.documentElement as unknown as SVGElement;
}

export function svgToString(svg: SVGElement): string {
  return new XMLSerializer().serializeToString(svg);
}

/**
 * Appelle le backend FastAPI pour analyser le texte.
 * Le backend gère le prompt système et la communication avec Claude.
 */
export async function callBackend(
  text: string,
): Promise<{ suggestions: Suggestion[]; latencyMs: number }> {
  const t0 = performance.now();
  const data = await analyzeText(text);
  const rawSuggestions: Suggestion[] = data.suggestions ?? [];
  if (rawSuggestions.length === 0) throw new Error("Aucune suggestion");
  const suggestions = rawSuggestions.map((s) => ({ ...s, score: normalizeScore(s.score) }));
  const latencyMs =
    typeof data.latency_ms === "number" ? data.latency_ms : Math.round(performance.now() - t0);
  return { suggestions, latencyMs };
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
  const p = svg.style.getPropertyValue("--primary").trim();
  const a = svg.style.getPropertyValue("--accent").trim();
  return p === palette.colors.primary && a === palette.colors.accent;
}

export { palettes };
