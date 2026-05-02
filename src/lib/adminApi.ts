import { useAdminToken } from "@/contexts/AdminTokenContext";

const API = "https://krobar.online/api";

type ErrorBody = { detail?: string; error?: string; message?: string };

async function handleResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: T & ErrorBody;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      res.status === 503
        ? "Backend non configuré"
        : `Réponse inattendue du serveur (${res.status})`
    );
  }

  if (!res.ok) {
    if (res.status === 401) throw new Error("Token invalide");
    if (res.status === 503) throw new Error("Backend non configuré");
    const msg =
      (data as ErrorBody).detail ||
      (data as ErrorBody).error ||
      (data as ErrorBody).message ||
      `Erreur serveur (${res.status})`;
    throw new Error(msg);
  }

  return data;
}

export async function adminFetch<T>(
  endpoint: string,
  token: string,
  options?: { method?: string; body?: unknown }
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);

  try {
    const res = await fetch(`${API}${endpoint}`, {
      method: options?.method ?? "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Admin-Token": token,
      },
      signal: controller.signal,
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });
    return await handleResponse<T>(res);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Le serveur n'a pas répondu dans les 2 minutes.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export function useAdminApi() {
  const { token } = useAdminToken();

  return {
    createDraft: (svg_content: string, hint?: string) =>
      adminFetch<{
        draft_id: string;
        metadata: { id: string; name: string; category: string; description: string; best_for: string };
        slots: string[];
        slot_count: number;
        test_text: string;
      }>("/admin/template/create", token, { body: { svg_content, hint } }),

    validateDraft: (draft_id: string, max_iterations: number) =>
      adminFetch<{
        draft_id: string;
        success: boolean;
        attempts: { attempt: number; position_in_top3: number; fill_ratio: number; top1_suggested: string }[];
        final_metadata: Record<string, unknown>;
        next_step?: string;
      }>("/admin/template/validate", token, { body: { draft_id, max_iterations } }),

    deployDraft: (draft_id: string) =>
      adminFetch<{
        deployed: boolean;
        template_id: string;
        total_templates: number;
        manifest_backup: string;
      }>("/admin/template/deploy", token, { body: { draft_id } }),

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
      }>("/admin/template/drafts", token, { method: "GET" }),
  };
}
