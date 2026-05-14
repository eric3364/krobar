// Catalogue Lucide & rendu SVG : implémentation client-side basée sur le
// paquet `lucide-react` (pas d'appel réseau). Le backend krobar.online n'expose
// pas encore /lucide/catalog ni /lucide/icon/{name}, donc on les simule
// localement en gardant le même contrat de type que la spec.

import * as LucideReact from "lucide-react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { LucideCatalog, LucideIconMetadata } from "@/types/lucide";

type AnyComp = React.ComponentType<Record<string, unknown>>;

const EXCLUDED = new Set([
  "Icon",
  "createLucideIcon",
  "LucideProvider",
  "default",
  "icons",
  "dynamicIconImports",
]);

function pascalToKebab(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}

function kebabToPascal(name: string): string {
  return name
    .split("-")
    .filter(Boolean)
    .map((s) => s[0].toUpperCase() + s.slice(1))
    .join("");
}

// Catégorisation simple par mots-clés présents dans le nom.
const CATEGORY_RULES: { cat: string; tokens: string[] }[] = [
  { cat: "Arrows", tokens: ["arrow", "chevron", "move", "corner"] },
  { cat: "Charts", tokens: ["chart", "trending", "activity", "pie", "bar-"] },
  { cat: "Communication", tokens: ["mail", "message", "phone", "send", "chat", "bell"] },
  { cat: "Files", tokens: ["file", "folder", "clipboard", "archive", "save"] },
  { cat: "Media", tokens: ["play", "pause", "music", "video", "camera", "image", "film", "mic"] },
  { cat: "Devices", tokens: ["laptop", "phone", "monitor", "tablet", "tv", "watch", "printer"] },
  { cat: "Weather", tokens: ["sun", "moon", "cloud", "rain", "snow", "wind", "storm"] },
  { cat: "Nature", tokens: ["tree", "leaf", "flower", "mountain", "sprout", "flame"] },
  { cat: "Shapes", tokens: ["circle", "square", "triangle", "hexagon", "diamond", "shapes"] },
  { cat: "Money", tokens: ["dollar", "euro", "coin", "wallet", "credit", "banknote", "gem"] },
  { cat: "People", tokens: ["user", "users", "person", "baby", "smile"] },
  { cat: "Brands", tokens: ["github", "twitter", "facebook", "linkedin", "youtube", "instagram", "apple", "chrome", "figma", "slack"] },
  { cat: "Navigation", tokens: ["map", "navigation", "compass", "pin", "globe", "route"] },
  { cat: "UI", tokens: ["menu", "settings", "search", "filter", "edit", "trash", "plus", "minus", "x", "check"] },
];

function categorize(kebabName: string): string[] {
  const cats: string[] = [];
  for (const rule of CATEGORY_RULES) {
    if (rule.tokens.some((t) => kebabName.includes(t))) cats.push(rule.cat);
  }
  if (cats.length === 0) cats.push("Other");
  return cats;
}

let _catalog: LucideCatalog | null = null;
const _svgCache = new Map<string, string>();

function buildCatalog(): LucideCatalog {
  if (_catalog) return _catalog;
  const keys = Object.keys(LucideReact).filter(
    (k) => /^[A-Z]/.test(k) && !k.endsWith("Icon") && !EXCLUDED.has(k),
  );
  const icons: Record<string, LucideIconMetadata> = {};
  for (const pascal of keys) {
    const kebab = pascalToKebab(pascal);
    const tokens = kebab.split("-").filter(Boolean);
    icons[kebab] = {
      name: kebab,
      tags: tokens,
      categories: categorize(kebab),
      aliases: [],
    };
  }
  _catalog = { version: "client-lucide-react", icons };
  return _catalog;
}

export function getLucideCatalog(): Promise<LucideCatalog> {
  return Promise.resolve(buildCatalog());
}

export async function getLucideIconSvg(name: string): Promise<string> {
  const hit = _svgCache.get(name);
  if (hit) return hit;
  const pascal = kebabToPascal(name);
  const Comp = (LucideReact as unknown as Record<string, AnyComp>)[pascal];
  if (!Comp) throw new Error(`Icône Lucide inconnue : ${name}`);
  const svg = renderToStaticMarkup(createElement(Comp));
  _svgCache.set(name, svg);
  return svg;
}
