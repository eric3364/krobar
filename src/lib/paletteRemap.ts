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

export function autoMapDetectedColors(colors: DetectedColor[]): Record<string, string | null> {
  const mapping: Record<string, string | null> = {};
  const nonNeutral = colors.filter((c) => !c.is_neutral);
  const neutral = colors.filter((c) => c.is_neutral);
  const order: PaletteRole[] = ["primary", "accent", "secondary", "neutral", "surface", "background", "text"];
  let i = 0;
  for (const c of nonNeutral) {
    mapping[c.hex_value] = order[i] ?? null;
    i++;
  }
  for (const c of neutral) {
    // blanc → background, noir → text, gris → neutral
    if (c.hex_value === "#ffffff") mapping[c.hex_value] = "background";
    else if (c.hex_value === "#000000") mapping[c.hex_value] = "text";
    else mapping[c.hex_value] = "neutral";
  }
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
