// Client API côté frontend.
// Les appels passent par une fonction backend du projet pour éviter les
// problèmes CORS/réseau entre le navigateur et krobar.online.

import { supabase } from "@/integrations/supabase/client";
import { isMockForced, mockAnalyze, mockRender } from "./mockBackend";

type KrobarEndpoint = "analyze" | "render" | "templates" | "health";

async function readInvokeError(error: unknown): Promise<string> {
  if (error && typeof error === "object" && "context" in error) {
    const response = (error as { context?: Response }).context;
    if (response instanceof Response) {
      const payload = await response.json().catch(() => null);
      const msg = payload?.error || payload?.detail || payload?.message;
      if (typeof msg === "string" && msg.trim()) return msg;
    }
  }

  if (error instanceof Error && error.message) return error.message;
  return "Le backend Krobar est actuellement inaccessible.";
}

async function invokeKrobar<T>(endpoint: KrobarEndpoint, payload?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("krobar-proxy", {
    body: { endpoint, payload },
  });

  if (error) {
    throw new Error(await readInvokeError(error));
  }

  return data as T;
}

export async function analyzeText(text: string, detail_level: string = "auto") {
  if (isMockForced()) {
    return mockAnalyze(text, detail_level);
  }
  return invokeKrobar("analyze", { text, detail_level });
}

export async function renderTemplate(
  template_id: string,
  slots: Record<string, string>,
  palette: Record<string, string>,
) {
  if (isMockForced()) {
    return mockRender(template_id, slots);
  }
  return invokeKrobar("render", { template_id, slots, palette });
}

export async function getTemplates() {
  return invokeKrobar("templates");
}

export async function checkHealth() {
  return invokeKrobar("health");
}
