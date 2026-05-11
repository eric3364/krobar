// API client pour Krobar Studio. Bascule mocks ↔ backend via VITE_USE_STUDIO_MOCKS.

import { adminFetch } from "@/lib/adminApi";
import {
  MATCHING_TYPES_FALLBACK,
  mockDeploy,
  mockMatchingTypes,
  mockSaveDraft,
  mockUpload,
  type MatchingType,
  type UploadResponse,
} from "@/mocks/studio";

// Défaut : backend réel (krobar-proxy → /api/admin/studio/*).
// Pour repasser en mocks localement : VITE_USE_STUDIO_MOCKS=true
const USE_MOCKS = (import.meta.env.VITE_USE_STUDIO_MOCKS ?? "false") === "true";

export type { MatchingType, UploadResponse } from "@/mocks/studio";

export const MAX_STUDIO_FILE_SIZE_BYTES = 3 * 1024 * 1024;

export function validateStudioUploadFile(file: File): { ok: true } | { ok: false; error: string } {
  if (file.size <= MAX_STUDIO_FILE_SIZE_BYTES) {
    return { ok: true };
  }

  const sizeMb = (file.size / 1024 / 1024).toFixed(2);
  return {
    ok: false,
    error:
      `Fichier trop volumineux (${sizeMb} Mo). La limite est de 3 Mo en raison du transport via Supabase Edge Functions.\n\n` +
      "Pistes pour réduire :\n" +
      "• Simplifie ton SVG dans Illustrator (Object > Path > Simplify)\n" +
      "• Exporte en SVG plutôt qu'EPS si possible\n" +
      "• Aplatis les calques inutiles\n" +
      "• Supprime la preview TIFF intégrée dans les EPS (l'augmentation peut être 5-10×)",
  };
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

// Backend renvoie { groups: [{ label, matching_types: [{id,label,primary_intent,suggested_markers}] }] }
type BackendMatchingTypesResponse = {
  groups?: Array<{
    label: string;
    matching_types: Array<{
      id: string;
      label: string;
      primary_intent: MatchingType["primary_intent"];
      suggested_markers?: string[];
      textual_markers?: string[];
    }>;
  }>;
  matching_types?: MatchingType[];
};

function flattenMatchingTypes(r: BackendMatchingTypesResponse): MatchingType[] {
  if (Array.isArray(r.groups)) {
    const out: MatchingType[] = [];
    for (const g of r.groups) {
      for (const t of g.matching_types ?? []) {
        out.push({
          id: t.id,
          label: t.label,
          category: g.label,
          primary_intent: t.primary_intent,
          textual_markers: t.textual_markers ?? t.suggested_markers ?? [],
        });
      }
    }
    return out;
  }
  return r.matching_types ?? [];
}

export const studioApi = {
  async upload(file: File): Promise<UploadResponse> {
    if (USE_MOCKS) return mockUpload(file);

    const validation = validateStudioUploadFile(file);
    if (validation.ok === false) {
      throw new Error(validation.error);
    }

    const base64 = await fileToBase64(file);
    return adminFetch<UploadResponse>("/admin/studio/upload", {
      body: { filename: file.name, content_base64: base64 },
    });
  },
  async matchingTypes(): Promise<MatchingType[]> {
    if (USE_MOCKS) return (await mockMatchingTypes()).matching_types;
    try {
      const r = await adminFetch<BackendMatchingTypesResponse>("/admin/studio/matching-types", { method: "GET" });
      const flat = flattenMatchingTypes(r);
      return flat.length > 0 ? flat : MATCHING_TYPES_FALLBACK;
    } catch {
      return MATCHING_TYPES_FALLBACK;
    }
  },
  saveDraft(payload: unknown) {
    if (USE_MOCKS) return mockSaveDraft(payload);
    return adminFetch<{ draft_id: string }>("/admin/studio/save-draft", { body: payload });
  },
  deploy(payload: unknown) {
    if (USE_MOCKS) return mockDeploy(payload);
    return adminFetch<{ deployed: boolean; template_id: string }>("/admin/studio/deploy", { body: payload });
  },
  isMockMode: () => USE_MOCKS,
};
