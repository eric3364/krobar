// Snapshot d'un template produit via le Studio, pour permettre
// de le réouvrir et d'en modifier les paramètres ultérieurement.
//
// Stockage principal : table Supabase `template_studio_params` (admin only).
// Fallback : localStorage, utilisé tant que l'hydratation depuis Supabase
// n'a pas eu lieu et pour migrer en douceur les entrées historiques.
//
// La majorité de l'API reste synchrone (lecture depuis un cache en mémoire)
// pour ne pas perturber les composants existants. `saveSnapshot` et
// `deleteSnapshot` deviennent asynchrones car elles écrivent en base.

import type { Anchor } from "@/components/studio/StudioCanvas";
import type { UploadResponse } from "@/lib/studioApi";
import type { DecorativeIcon, IconSlotSpec } from "@/types/template";
import { supabase } from "@/integrations/supabase/client";

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
  paletteMapping?: Record<string, string | null>;
  detectedColors?: Array<{ hex_value: string; occurrences: number; is_neutral: boolean }>;
  decorative_icons?: DecorativeIcon[];
  icon_slots?: Record<string, IconSlotSpec>;
  saved_at: string;
};

// ─── Cache en mémoire ────────────────────────────────────────────────────
let cache: StudioSnapshot[] = readLocal();
let hydrated = false;
let hydratePromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) {
    try { fn(); } catch { /* ignore */ }
  }
}

export function subscribeSnapshots(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function readLocal(): StudioSnapshot[] {
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

function writeLocal(snapshots: StudioSnapshot[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      STUDIO_TEMPLATE_SNAPSHOTS_STORAGE,
      JSON.stringify(snapshots.slice(0, 100)),
    );
  } catch {
    /* ignore quota errors */
  }
}

// ─── Hydratation depuis Supabase ─────────────────────────────────────────
export function hydrateSnapshots(): Promise<void> {
  if (hydrated) return Promise.resolve();
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    try {
      const { data, error } = await supabase
        .from("template_studio_params")
        .select("template_id, params, updated_at")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      const remote: StudioSnapshot[] = (data ?? [])
        .map((row: any) => {
          const p = row.params ?? {};
          return { ...p, template_id: row.template_id } as StudioSnapshot;
        })
        .filter((s) => s && typeof s.template_id === "string");

      // Migration douce : remonte vers Supabase les entrées présentes
      // uniquement en localStorage (snapshots créés avant la migration).
      const remoteIds = new Set(remote.map((s) => s.template_id));
      const local = readLocal();
      const toUpload = local.filter((s) => !remoteIds.has(s.template_id));
      if (toUpload.length > 0) {
        const { data: userData } = await supabase.auth.getUser();
        const uid = userData.user?.id ?? null;
        const rows = toUpload.map((s) => ({
          template_id: s.template_id,
          params: s,
          created_by: uid,
        }));
        const { error: upErr } = await supabase
          .from("template_studio_params")
          .upsert(rows, { onConflict: "template_id" });
        if (!upErr) {
          for (const s of toUpload) remote.push(s);
        }
      }

      cache = remote;
      writeLocal(cache);
      hydrated = true;
      notify();
    } catch {
      // En cas d'échec, on continue avec le cache localStorage existant.
      hydrated = true;
    } finally {
      hydratePromise = null;
    }
  })();
  return hydratePromise;
}

// ─── API synchrone (lit le cache) ────────────────────────────────────────
export function listSnapshots(): StudioSnapshot[] {
  return [...cache];
}

export function loadSnapshot(templateId: string): StudioSnapshot | null {
  return cache.find((s) => s.template_id === templateId) ?? null;
}

export function hasSnapshot(templateId: string): boolean {
  return cache.some((s) => s.template_id === templateId);
}

export function listSnapshotIds(): string[] {
  return cache.map((s) => s.template_id);
}

export function isHydrated(): boolean {
  return hydrated;
}

// ─── Mutations (asynchrones, écrivent en base + cache) ───────────────────
export async function saveSnapshot(snapshot: StudioSnapshot): Promise<void> {
  // MAJ optimiste du cache
  cache = [snapshot, ...cache.filter((s) => s.template_id !== snapshot.template_id)];
  writeLocal(cache);
  notify();
  try {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id ?? null;
    const { error } = await supabase
      .from("template_studio_params")
      .upsert(
        { template_id: snapshot.template_id, params: snapshot, created_by: uid },
        { onConflict: "template_id" },
      );
    if (error) throw error;
  } catch (err) {
    // Le cache local conserve la valeur ; on logue silencieusement.
    console.warn("[studioSnapshots] saveSnapshot remote failed:", err);
    throw err;
  }
}

export async function deleteSnapshot(templateId: string): Promise<void> {
  cache = cache.filter((s) => s.template_id !== templateId);
  writeLocal(cache);
  notify();
  try {
    const { error } = await supabase
      .from("template_studio_params")
      .delete()
      .eq("template_id", templateId);
    if (error) throw error;
  } catch (err) {
    console.warn("[studioSnapshots] deleteSnapshot remote failed:", err);
    throw err;
  }
}
