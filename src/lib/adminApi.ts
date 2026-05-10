import { supabase } from "@/integrations/supabase/client";
import { FunctionsHttpError } from "@supabase/supabase-js";

type ErrorBody = { detail?: string; error?: string; message?: string; status?: number; code?: string };

async function readAdminInvokeError(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    const payload = await error.context.json().catch(() => null) as ErrorBody | null;
    const msg = payload?.error || payload?.detail || payload?.message;
    if (typeof msg === "string" && msg.trim()) return msg;
  }

  if (error instanceof Error && error.message) return error.message;
  return "Erreur de communication avec le proxy";
}

export async function adminFetch<T>(
  path: string,
  options?: { method?: string; body?: unknown }
): Promise<T> {
  const method = options?.method ?? "POST";

  const { data, error } = await supabase.functions.invoke("krobar-proxy", {
    body: {
      path,
      method,
      payload: options?.body ?? {},
    },
  });

  if (error) {
    throw new Error(await readAdminInvokeError(error));
  }

  const result = data as T & ErrorBody;

  if ((result as any)?.error) {
    const msg = (result as any).error;
    if ((result as any)?.code === "invalid_admin_token") {
      throw new Error("Le token administrateur Krobar configuré côté backend est invalide ou expiré.");
    }
    throw new Error(msg);
  }

  return result;
}

export function useAdminApi() {
  return {
    createDraft: (svg_content: string, hint?: string) =>
      adminFetch<{
        draft_id: string;
        metadata: { id: string; name: string; category: string; description: string; best_for: string };
        slots: string[];
        slot_count: number;
        test_text: string;
      }>("/admin/template/create", { body: { svg_content, hint } }),

    validateDraft: (draft_id: string, max_iterations: number) =>
      adminFetch<{
        draft_id: string;
        success: boolean;
        attempts: { attempt: number; position_in_top3: number; fill_ratio: number; top1_suggested: string }[];
        final_metadata: Record<string, unknown>;
        next_step?: string;
      }>("/admin/template/validate", { body: { draft_id, max_iterations } }),

    deployDraft: (draft_id: string) =>
      adminFetch<{
        deployed: boolean;
        template_id: string;
        total_templates: number;
        manifest_backup: string;
      }>("/admin/template/deploy", { body: { draft_id } }),

    listDrafts: () =>
      adminFetch<{
        count: number;
        drafts: {
          draft_id: string;
          status: string;
          created_at: string;
          deployed_at: string | null;
          metadata: Record<string, string>;
        }[];
      }>("/admin/template/drafts", { method: "GET" }),
  };
}
