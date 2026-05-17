// Utilitaires pour appliquer un mapping couleur → rôle Krobar à un SVG,
// uniquement pour la prévisualisation côté frontend dans le Studio.
// Le vrai remapping (en var(--xxx)) est fait côté backend au déploiement.

import type { Palette } from "@/palettes";

export const PALETTE_ROLES = [
  "primary",
  "secondary",
  "accent",
  "neutral",
  "background",
  "surface",
  "text",
] as const;
export type PaletteRole = (typeof PALETTE_ROLES)[number];

export function roleColor(palette: Palette, role: string | null | undefined): string | null {
  switch (role) {
    case "primary": return palette.colors.primary;
    case "secondary": return palette.colors.border;
    case "accent": return palette.colors.accent;
    case "neutral": return palette.colors.muted;
    case "background": return palette.colors.bg;
    case "surface": return palette.colors.surface;
    case "text": return palette.colors.text;
    default: return null;
  }
}

function escapeRx(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─── Détection client-side des couleurs présentes dans un SVG ──────────
// Sert de fallback si le backend /admin/studio/analyze-palette n'est pas
// disponible ou renvoie une liste vide.

const NEUTRAL_HEXES = new Set([
  "#000000", "#ffffff", "#fff", "#000",
]);

function normalizeHex(hex: string): string | null {
  let h = hex.trim().toLowerCase();
  if (!h.startsWith("#")) h = "#" + h;
  if (/^#[0-9a-f]{3}$/.test(h)) {
    h = "#" + h.slice(1).split("").map((c) => c + c).join("");
  }
  if (!/^#[0-9a-f]{6}$/.test(h)) return null;
  return h;
}

function isNeutral(hex: string): boolean {
  if (NEUTRAL_HEXES.has(hex)) return true;
  // gris purs (R=G=B)
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return r === g && g === b;
}

export type DetectedColor = { hex_value: string; occurrences: number; is_neutral: boolean };

export function detectColorsInSvg(svg: string): DetectedColor[] {
  const counts = new Map<string, number>();
  // Capture #abc, #aabbcc dans fill="...", stroke="...", style="...:#xxx", etc.
  const re = /#[0-9a-fA-F]{3,6}\b/g;
  const matches = svg.match(re) ?? [];
  for (const m of matches) {
    const norm = normalizeHex(m);
    if (!norm) continue;
    counts.set(norm, (counts.get(norm) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([hex_value, occurrences]) => ({ hex_value, occurrences, is_neutral: isNeutral(hex_value) }))
    .sort((a, b) => b.occurrences - a.occurrences);
}

// Détection du fond du SVG. Heuristiques par ordre de priorité :
//  1. `<rect class="krobar-background">` (annotation explicite SVG-KR).
//  2. Premier `<rect>` avec width="100%" height="100%".
//  3. Premier `<rect>` couvrant l'intégralité du viewBox (x=0,y=0, w=W, h=H).
// Retourne le hex du `fill` détecté, normalisé, ou null.
export function detectBackgroundHex(svg: string, viewBoxW?: number, viewBoxH?: number): string | null {
  const rectRx = /<rect\b[^>]*>/gi;
  const fillRx = /fill\s*=\s*"([^"]+)"/i;
  const widthRx = /\swidth\s*=\s*"([^"]+)"/i;
  const heightRx = /\sheight\s*=\s*"([^"]+)"/i;
  const xRx = /\sx\s*=\s*"([^"]+)"/i;
  const yRx = /\sy\s*=\s*"([^"]+)"/i;
  const classRx = /\sclass\s*=\s*"([^"]*)"/i;

  const candidates: { score: number; hex: string }[] = [];
  for (const tag of svg.match(rectRx) ?? []) {
    const fillM = tag.match(fillRx);
    if (!fillM) continue;
    const hex = normalizeHex(fillM[1]);
    if (!hex) continue;
    const cls = tag.match(classRx)?.[1] ?? "";
    const w = tag.match(widthRx)?.[1] ?? "";
    const h = tag.match(heightRx)?.[1] ?? "";
    const x = parseFloat(tag.match(xRx)?.[1] ?? "0");
    const y = parseFloat(tag.match(yRx)?.[1] ?? "0");

    if (/\bkrobar-background\b/.test(cls)) {
      return hex;
    }
    if (w === "100%" && h === "100%") candidates.push({ score: 90, hex });
    else if (viewBoxW && viewBoxH && x === 0 && y === 0 && parseFloat(w) === viewBoxW && parseFloat(h) === viewBoxH) {
      candidates.push({ score: 80, hex });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.hex ?? null;
}

// Auto-mapping intelligent (Fix 17 mai 2026) :
//  - dominante (la plus utilisée, non-neutre) → primary
//  - secondaire (occ > 1, non-dominante, non-neutre) → accent
//  - tertiaire et + (occ > 1) → secondary puis surface
//  - isolée (1 occ, non-neutre) → null (« garder telle quelle »)
//  - fond détecté (param backgroundHex) → background
//  - autres neutres : blanc / très clair → neutral, noir → text, gris → neutral
export function autoMapDetectedColors(
  colors: DetectedColor[],
  backgroundHex?: string | null,
): Record<string, string | null> {
  const mapping: Record<string, string | null> = {};
  const bg = backgroundHex ? normalizeHex(backgroundHex) : null;

  const nonNeutralMulti = colors.filter((c) => !c.is_neutral && c.occurrences > 1 && c.hex_value !== bg);
  const nonNeutralIsolated = colors.filter((c) => !c.is_neutral && c.occurrences === 1 && c.hex_value !== bg);
  const neutral = colors.filter((c) => c.is_neutral && c.hex_value !== bg);

  const fallbackOrder: PaletteRole[] = ["primary", "accent", "secondary", "surface"];
  nonNeutralMulti.forEach((c, i) => {
    mapping[c.hex_value] = fallbackOrder[i] ?? null;
  });
  // Les couleurs isolées restent « garder telle quelle » par défaut.
  for (const c of nonNeutralIsolated) mapping[c.hex_value] = null;

  for (const c of neutral) {
    if (c.hex_value === "#000000") mapping[c.hex_value] = "text";
    else mapping[c.hex_value] = "neutral";
  }

  if (bg) mapping[bg] = "background";
  return mapping;
}

// Remplace dans le SVG les occurrences de chaque hex (insensible à la casse)
// par la couleur du rôle assigné dans la palette active.
export function applyPaletteToSvg(
  svg: string,
  mapping: Record<string, string | null>,
  palette: Palette,
): string {
  let out = svg;
  for (const [hex, role] of Object.entries(mapping)) {
    if (!role) continue;
    const c = roleColor(palette, role);
    if (!c) continue;
    const re = new RegExp(escapeRx(hex), "gi");
    out = out.replace(re, c);
  }
  return out;
}
