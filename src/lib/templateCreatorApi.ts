// API client pour l'atelier de création de templates.
// Bascule mocks ↔ backend réel via VITE_USE_TEMPLATE_CREATOR_MOCKS.
// Tant que le backend n'expose pas /api/admin/template/{generate,preview,refine},
// les mocks sont activés par défaut.

import { adminFetch } from "@/lib/adminApi";
import {
  mockDeploy,
  mockGenerate,
  mockPreview,
  mockRefine,
  mockValidate,
  type GeneratePayload,
  type GenerateResponse,
} from "@/mocks/template-creator";

const USE_MOCKS = (import.meta.env.VITE_USE_TEMPLATE_CREATOR_MOCKS ?? "true") !== "false";

export type { GeneratePayload, GenerateResponse, SlotRole } from "@/mocks/template-creator";

export const templateCreatorApi = {
  generate(payload: GeneratePayload): Promise<GenerateResponse> {
    if (USE_MOCKS) return mockGenerate(payload);
    return adminFetch<GenerateResponse>("/admin/template/generate", { body: payload });
  },

  preview(args: { draft_id: string; sample_text: string; palette: Record<string, string>; force_cardinality?: number }) {
    if (USE_MOCKS) return mockPreview(args);
    return adminFetch<{ rendered_svg: string; detected_cardinality: number; filled_slots: Record<string, string> }>(
      "/admin/template/preview",
      { body: args },
    );
  },

  refine(args: { draft_id: string; feedback: string; payload: GeneratePayload }) {
    if (USE_MOCKS) return mockRefine(args);
    return adminFetch<GenerateResponse>("/admin/template/refine", {
      body: { draft_id: args.draft_id, feedback: args.feedback },
    });
  },

  validate(draft_id: string) {
    if (USE_MOCKS) return mockValidate(draft_id);
    return adminFetch<{ valid: boolean; issues: { severity: "error" | "warning"; field: string; message: string }[] }>(
      "/admin/template/validate",
      { body: { draft_id } },
    );
  },

  deploy(draft_id: string) {
    if (USE_MOCKS) return mockDeploy(draft_id);
    return adminFetch<{ deployed: boolean; template_id: string; manifest_url: string }>(
      "/admin/template/deploy",
      { body: { draft_id } },
    );
  },

  isMockMode: () => USE_MOCKS,
};
