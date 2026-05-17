// API client pour la Bibliothèque Premium (Chantier C).
// Tous les endpoints transitent par l'edge function krobar-proxy avec le token admin.

import { adminFetch } from "@/lib/adminApi";

export type LibraryTemplate = {
  id: string;
  name: string;
  category: string;
  description: string;
  preview_count: number;
  last_preview_at: string | null;
  last_validated_at: string | null;
  validated_count: number;
};

export type LibraryPreviewSummary = {
  id: number;
  template_id: string;
  test_text: string;
  latency_ms: number;
  cost_usd: number;
  analyst_model: string | null;
  writer_model: string | null;
  created_at: string;
  validated_at: string | null;
  validation_note: string | null;
  svg_size: number;
};

export type LibraryPreviewFull = Omit<LibraryPreviewSummary, "svg_size"> & {
  rendered_svg: string;
};

export const libraryApi = {
  listTemplates() {
    return adminFetch<{ templates: LibraryTemplate[] }>("/admin/library/templates", { method: "GET" });
  },
  listPreviews(templateId: string) {
    return adminFetch<{ template_id: string; previews: LibraryPreviewSummary[] }>(
      `/admin/library/previews/${encodeURIComponent(templateId)}`,
      { method: "GET" },
    );
  },
  getPreview(previewId: number) {
    return adminFetch<LibraryPreviewFull>(`/admin/library/preview/${previewId}`, { method: "GET" });
  },
  validate(previewId: number, note?: string) {
    return adminFetch<{ preview_id: number; validated: boolean }>(
      `/admin/library/preview/${previewId}/validate`,
      { method: "POST", body: { note: note ?? null } },
    );
  },
  unvalidate(previewId: number) {
    return adminFetch<{ preview_id: number; validated: boolean }>(
      `/admin/library/preview/${previewId}/validate`,
      { method: "DELETE" },
    );
  },
  deletePreview(previewId: number) {
    return adminFetch<{ preview_id: number; deleted: boolean }>(
      `/admin/library/preview/${previewId}`,
      { method: "DELETE" },
    );
  },
};
