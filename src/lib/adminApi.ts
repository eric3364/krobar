import { supabase } from "@/integrations/supabase/client";

type ErrorBody = { detail?: string; error?: string; message?: string };

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
    throw new Error(error.message || "Erreur de communication avec le proxy");
  }

  const result = data as T & ErrorBody;

  if ((result as any)?.error) {
    const msg = (result as any).error;
    if (msg.includes?.("401") || msg.includes?.("Token")) throw new Error("Token invalide");
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
