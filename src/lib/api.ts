// Client API côté frontend.
// Les appels passent par une fonction backend du projet pour éviter les
// problèmes CORS/réseau entre le navigateur et krobar.online.

import { supabase } from "@/integrations/supabase/client";

type KrobarEndpoint = "analyze" | "render" | "templates" | "health";

export type ApiSuggestion = {
  template_id: string;
  score: number;
  reasoning: string;
  slots: Record<string, string>;
};

export type AnalyzeResponse = {
  suggestions: ApiSuggestion[];
  latency_ms?: number;
};

export type RenderResponse = {
  svg: string;
  template_id?: string;
};

export type TemplateMetadata = {
  id: string;
  name: string;
  category: string;
  description: string;
  file: string;
  slots: string[];
  best_for: string;
  priority?: number;
};

export type TemplatesResponse = {
  templates: TemplateMetadata[];
  total_count?: number;
  version?: string;
};

export type HealthResponse = {
  status: string;
  version?: string;
  templates_count?: number;
  claude_configured?: boolean;
  timestamp?: string;
};

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

export async function analyzeText(text: string, detail_level: string = "auto"): Promise<AnalyzeResponse> {
  return invokeKrobar<AnalyzeResponse>("analyze", { text, detail_level });
}

export async function renderTemplate(
  template_id: string,
  slots: Record<string, string>,
  palette: Record<string, string>,
): Promise<RenderResponse> {
  return invokeKrobar<RenderResponse>("render", { template_id, slots, palette });
}

export async function getTemplates(): Promise<TemplatesResponse> {
  return invokeKrobar<TemplatesResponse>("templates");
}

export async function checkHealth(): Promise<HealthResponse> {
  return invokeKrobar<HealthResponse>("health");
}
