// Client API côté frontend.
// Les appels passent par une fonction backend du projet pour éviter les
// problèmes CORS/réseau entre le navigateur et krobar.online.

import { supabase } from "@/integrations/supabase/client";

type KrobarEndpoint = "analyze" | "render" | "render-matrice" | "templates" | "health";

type ProxyErrorBody = {
  detail?: string;
  error?: string;
  message?: string;
  status?: number;
  fallback?: boolean;
  retryable?: boolean;
};

export type ApiSuggestion = {
  template_id: string;
  score: number;
  reasoning: string;
  slots: Record<string, string>;
  // P4 — icônes Lucide proposées par l'IconResolver (présent uniquement si
  // lucide_enabled=true ET source="multi_agents"). Optionnel partout ailleurs.
  icons?: Record<string, import("@/types/analyze").SlotIcon>;
  icons_ranker_mode?: "algo_only" | "algo_plus_llm";
};

export type MatriceSuggestion = {
  id: string;
  name: string;
  score: number;
  level: "A" | "B";
  confidence?: string;
  reason?: string;
};

export type AnalyzeResponse = {
  suggestions: ApiSuggestion[];
  source?: string;
  latency_ms?: number;
  matrice_suggestions?: MatriceSuggestion[];
  matrice_level?: "A" | "B";
};

export type RenderResponse = {
  svg: string;
  template_id?: string;
  // Phase 6 — icônes dynamiques (slot-icon) résolues côté backend.
  icons?: Record<string, import("@/types/analyze").SlotIcon>;
};

export type RenderMatriceResponse = {
  svg: string;
  matrice_id: string;
  name: string;
  archetype: string;
  title: string;
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
  family?: string;
  source?: string;
  premium?: boolean;
  tier?: string;
  created_via?: string;
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

  const proxyPayload = (data ?? null) as ProxyErrorBody | null;
  if (proxyPayload?.error) {
    const base = proxyPayload.error || proxyPayload.detail || proxyPayload.message || "Le backend Krobar est actuellement inaccessible.";
    const retryHint = proxyPayload.retryable ? " Réessaie dans quelques instants." : "";
    throw new Error(`${base}${retryHint}`);
  }

  return data as T;
}

export async function analyzeText(
  text: string,
  detail_level: string = "auto",
  force_template_id?: string,
): Promise<AnalyzeResponse> {
  const payload: Record<string, unknown> = { text, detail_level };
  if (force_template_id) payload.force_template_id = force_template_id;
  return invokeKrobar<AnalyzeResponse>("analyze", payload);
}

export async function renderTemplate(
  template_id: string,
  slots: Record<string, string>,
  palette: Record<string, string>,
  icons?: Record<string, { default: string }>,
): Promise<RenderResponse> {
  const payload: Record<string, unknown> = { template_id, slots, palette };
  if (icons && Object.keys(icons).length > 0) payload.icons = icons;
  return invokeKrobar<RenderResponse>("render", payload);
}

export async function renderMatrice(
  matrice_id: string,
  text: string,
  palette: Record<string, string>,
): Promise<RenderMatriceResponse> {
  return invokeKrobar<RenderMatriceResponse>("render-matrice", { matrice_id, text, palette });
}


export async function getTemplates(): Promise<TemplatesResponse> {
  return invokeKrobar<TemplatesResponse>("templates");
}

export async function checkHealth(): Promise<HealthResponse> {
  return invokeKrobar<HealthResponse>("health");
}
