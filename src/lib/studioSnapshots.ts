// Snapshot local d'un template produit via le Studio, pour permettre
// de le réouvrir et d'en modifier les paramètres ultérieurement.
//
// Limitation : le backend ne fournit pas (encore) d'endpoint pour
// récupérer les ancres / cardinalité / matching d'un template déployé.
// On conserve donc le payload complet en localStorage au moment du
// déploiement, ce qui permet à l'utilisateur de revenir dessus depuis
// le Studio ou la suite de tests sans repartir de zéro.

import type { Anchor } from "@/components/studio/StudioCanvas";
import type { UploadResponse } from "@/lib/studioApi";

export const STUDIO_TEMPLATE_SNAPSHOTS_STORAGE = "krobar-studio-template-snapshots";

export type StudioSnapshot = {
  template_id: string;
  tplId: string;
  tplName: string;
  tplCategory: string;
  tplDescription: string;
  tplMarkers: string[];
  tplTestText: string;
  anchors: Anchor[];
  cardinality: Array<{
    slotName: string;
    mode: "optional_groups" | "variants";
    min: number;
    max: number;
  }>;
  matchingIds: string[];
  otherChecked: boolean;
  otherText: string;
  upload: UploadResponse | null;
  saved_at: string;
};

export function listSnapshots(): StudioSnapshot[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STUDIO_TEMPLATE_SNAPSHOTS_STORAGE);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s) => s && typeof s.template_id === "string") : [];
  } catch {
    return [];
  }
}

export function loadSnapshot(templateId: string): StudioSnapshot | null {
  return listSnapshots().find((s) => s.template_id === templateId) ?? null;
}

export function saveSnapshot(snapshot: StudioSnapshot) {
  if (typeof window === "undefined") return;
  const all = listSnapshots().filter((s) => s.template_id !== snapshot.template_id);
  all.unshift(snapshot);
  // Plafonné à 50 entrées pour éviter de saturer le localStorage.
  localStorage.setItem(
    STUDIO_TEMPLATE_SNAPSHOTS_STORAGE,
    JSON.stringify(all.slice(0, 50)),
  );
}

export function deleteSnapshot(templateId: string) {
  if (typeof window === "undefined") return;
  const all = listSnapshots().filter((s) => s.template_id !== templateId);
  localStorage.setItem(STUDIO_TEMPLATE_SNAPSHOTS_STORAGE, JSON.stringify(all));
}

export function hasSnapshot(templateId: string): boolean {
  return listSnapshots().some((s) => s.template_id === templateId);
}
