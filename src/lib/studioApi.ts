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

const USE_MOCKS = (import.meta.env.VITE_USE_STUDIO_MOCKS ?? "true") !== "false";

export type { MatchingType, UploadResponse } from "@/mocks/studio";

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export const studioApi = {
  async upload(file: File): Promise<UploadResponse> {
    if (USE_MOCKS) return mockUpload(file);
    const base64 = await fileToBase64(file);
    return adminFetch<UploadResponse>("/admin/studio/upload", {
      body: { filename: file.name, mime_type: file.type, content_base64: base64 },
    });
  },
  async matchingTypes(): Promise<MatchingType[]> {
    if (USE_MOCKS) return (await mockMatchingTypes()).matching_types;
    try {
      const r = await adminFetch<{ matching_types: MatchingType[] }>("/admin/studio/matching-types", { method: "GET" });
      return r.matching_types ?? MATCHING_TYPES_FALLBACK;
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
