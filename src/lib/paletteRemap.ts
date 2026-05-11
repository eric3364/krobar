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
