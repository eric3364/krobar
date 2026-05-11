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

// Le backend Studio reçoit aujourd'hui l'upload via JSON + base64.
// Au-delà d'environ 1 Mo de corps HTTP côté reverse proxy, Krobar renvoie 413.
// On garde une marge pour éviter le 502 côté edge function.
const REAL_UPLOAD_MAX_BODY_BYTES = 900_000;

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function estimateBase64JsonBodySize(file: File): number {
  const base64Bytes = Math.ceil(file.size / 3) * 4;
  const jsonOverhead = 256;
  return base64Bytes + jsonOverhead;
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

    if (estimateBase64JsonBodySize(file) > REAL_UPLOAD_MAX_BODY_BYTES) {
      throw new Error(
        "Ce fichier dépasse la limite d'upload actuelle du backend Studio en base64. Réduisez son poids ou exportez-le en SVG avant import.",
      );
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
