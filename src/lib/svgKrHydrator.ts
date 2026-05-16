// Convertit un objet SvgKrData en bundle d'états prêts à injecter dans le wizard
// Studio (AdminStudioPage). Pur, sans dépendance React.

import type { Anchor } from "@/components/studio/StudioCanvas";
import type { IconSlotSpec } from "@/types/template";
import type { SvgKrData, SvgKrSlot, SvgKrIconPosition } from "@/types/svgKr";

const STUDIO_CATEGORIES = new Set([
  "process", "comparison", "hierarchy", "matrix", "network", "timeline", "concept",
]);

export type SvgKrHydrationResult = {
  anchors: Anchor[];
  iconSlots: Record<string, IconSlotSpec>;
  cardinality: Array<{
    slotName: string;
    mode: "optional_groups" | "variants";
    min: number;
    max: number;
  }>;
  metadata: {
    tplId: string | null;
    tplName: string | null;
    tplCategory: string | null;
    tplDescription: string | null;
    tplTestText: string | null;
    tplMarkers: string[];
    canonicalPreset: string | null;
  };
  matchingTypeIds: string[];
  warnings: string[];
};

function randomId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function iconPositionToOffset(
  pos: SvgKrIconPosition | undefined,
  bboxW: number,
  bboxH: number,
  size: number,
): { x: number; y: number } {
  switch (pos) {
    case "before":
      return { x: -size - 8, y: Math.max(0, (bboxH - size) / 2) };
    case "top":
      return { x: Math.max(0, (bboxW - size) / 2), y: -size - 8 };
    case "after":
      return { x: bboxW + 8, y: Math.max(0, (bboxH - size) / 2) };
    default:
      return { x: 0, y: 0 };
  }
}

function buildAnchor(slot: SvgKrSlot, imageW: number, imageH: number, warnings: string[]): Anchor | null {
  if (!slot.bbox) return null;
  const { x, y, width, height } = slot.bbox;
  if (width <= 0 || height <= 0) return null;

  if (x < 0 || y < 0 || x + width > imageW || y + height > imageH) {
    warnings.push(`Bbox du slot « ${slot.key} » hors limites de l'image — à ajuster.`);
  }

  return {
    id: randomId("anch"),
    slotName: slot.key,
    bbox: {
      x: Math.max(0, Math.round(x)),
      y: Math.max(0, Math.round(y)),
      w: Math.max(1, Math.round(width)),
      h: Math.max(1, Math.round(height)),
    },
  };
}

export function hydrateFromSvgKr(
  data: SvgKrData,
  imageWidth: number,
  imageHeight: number,
): SvgKrHydrationResult {
  const warnings: string[] = [];
  const anchors: Anchor[] = [];
  const iconSlots: Record<string, IconSlotSpec> = {};
  const seenIconKeys = new Set<string>();

  // Regroupement par key pour cardinalité
  const byKey = new Map<string, SvgKrSlot[]>();
  for (const slot of data.slots ?? []) {
    const arr = byKey.get(slot.key) ?? [];
    arr.push(slot);
    byKey.set(slot.key, arr);
  }

  // Ancres : 1 par instance
  for (const [, instances] of byKey) {
    const sorted = [...instances].sort(
      (a, b) => (a.instance_index ?? 0) - (b.instance_index ?? 0),
    );
    for (const slot of sorted) {
      const a = buildAnchor(slot, imageWidth, imageHeight, warnings);
      if (a) anchors.push(a);
    }
  }

  // Icônes : 1 entrée par key (depuis la première instance non disabled)
  for (const [key, instances] of byKey) {
    if (seenIconKeys.has(key)) continue;
    const first = instances.find((s) => s.icon && s.icon.behavior !== "disabled");
    if (!first || !first.icon) continue;
    const size = Math.max(16, Math.min(256, first.icon.size ?? 48));
    const bbox = first.bbox ?? { x: 0, y: 0, width: 0, height: 0 };
    const off = iconPositionToOffset(first.icon.position, bbox.width, bbox.height, size);
    iconSlots[key] = {
      size,
      default_icon: first.icon.default ?? null,
      position_x: Math.round(off.x),
      position_y: Math.round(off.y),
    };
    seenIconKeys.add(key);
  }

  // Cardinalité : 1 entrée par key repeated
  const cardinality: SvgKrHydrationResult["cardinality"] = [];
  for (const [key, instances] of byKey) {
    const isRepeated =
      instances.some((s) => s.cardinality === "repeated") || instances.length >= 2;
    if (!isRepeated) continue;
    const first = instances[0];
    const variants = first.variants ?? [];
    const hasVariants = variants.length >= 2;
    const max = first.cardinality_max ?? (hasVariants ? Math.max(...variants) : instances.length);
    const min = first.cardinality_min ?? (hasVariants ? Math.min(...variants) : Math.max(2, instances.length - 1));
    cardinality.push({
      slotName: key,
      mode: hasVariants ? "variants" : "optional_groups",
      min: Math.max(1, Math.min(min, max)),
      max: Math.max(min, max),
    });
  }

  // Métadonnées
  const md = data.metadata ?? {};
  const category = md.category && STUDIO_CATEGORIES.has(md.category) ? md.category : null;
  if (md.category && !category) {
    warnings.push(`Catégorie « ${md.category} » inconnue — sélection à confirmer.`);
  }

  return {
    anchors,
    iconSlots,
    cardinality,
    metadata: {
      tplId: md.id ?? null,
      tplName: md.name ?? null,
      tplCategory: category,
      tplDescription: md.description ?? md.best_for ?? null,
      tplTestText: md.test_text ?? null,
      tplMarkers: Array.isArray(md.markers) ? md.markers : [],
      canonicalPreset: md.canonical_preset ?? null,
    },
    matchingTypeIds: Array.isArray(md.matching_types) ? md.matching_types : [],
    warnings,
  };
}
