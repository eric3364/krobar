// API client for Studio V2 pipeline endpoints.
import { adminFetch } from "@/lib/adminApi";

export type SicaiPlausibility = "P" | "R" | "X";
export type SicaiCardinality =
  | "UNITAIRE" | "BINAIRE" | "TERNAIRE" | "QUATERNAIRE" | "QUINAIRE" | "SENAIRE";
export type SicaiRegime = "CONCRET" | "SEMI_METAPHORIQUE" | "ABSTRAIT";
export type SicaiFamily = "CONCEPT" | "DESCR" | "EXPLI" | "NARRA" | "OPPO" | "PROCED";

export type CoverageCell = {
  index: string;                 // ex "CO-1-C"
  sicai_code: string;
  family: SicaiFamily | string;
  cardinality: SicaiCardinality | string;
  regime: SicaiRegime | string;
  plausibility: SicaiPlausibility;
  covered: boolean;
  incarnations: number;
  by_registre: {
    domains: string[];
    etat: number | string[];
    conflit: number | string[];
    sport: string[];
  };
};

export type CoverageSummary = {
  figurative_cells_total: number;
  figurative_cells_touched: number;
  figurative_cells_untouched: number;
  total_incarnations: number;
};

export type CoverageResponse = {
  summary: CoverageSummary;
  cells: CoverageCell[];
  frozen_counters_historical?: Record<string, unknown>;
};

export type Moteur = "midjourney" | "gpt-image-2";

export type CharteStyle = {
  label: string;
  description?: string;
};

export type CharteEngine = {
  style_default: string;
  styles: Record<string, CharteStyle>;
};

export type CharteResponse = {
  moteurs: Record<string, CharteEngine>;
};

export type GeneratePromptPayload = {
  index: string;
  registre: "domain" | "etat" | "conflit" | "sport";
  selecteur: string | null;
  moteur: Moteur;
  style?: string;
};

export type GeneratePromptResponse = {
  ok: boolean;
  prompt: string;
  moteur: Moteur;
  style?: string;
  charte_version: string;
  incarnation_source: string;
  meta: {
    registre: string;
    discipline?: string;
    index: string;
    cote: string;
  };
};

export type VectorizeMetrics = {
  ink_density_pct: number;
  verdict: "clean" | "acceptable" | "charcoal_suspect";
  shadow_blobs_removed: number;
  cropped_size: [number, number];
};

export type VectorizeResponse = {
  ok: boolean;
  svg: string;
  metrics: VectorizeMetrics;
};

export const MAX_VECTORIZE_BYTES = 5 * 1024 * 1024;

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export const studioV2Api = {
  coverage: () =>
    adminFetch<CoverageResponse>("/admin/studio/sicai-coverage", { method: "GET" }),

  charte: () =>
    adminFetch<CharteResponse>("/admin/studio/charte", { method: "GET" }),

  generatePrompt: (payload: GeneratePromptPayload) =>
    adminFetch<GeneratePromptResponse>("/admin/studio/generate-prompt", { body: payload }),

  async vectorize(file: File): Promise<VectorizeResponse> {
    if (file.size > MAX_VECTORIZE_BYTES) {
      throw new Error(
        `Fichier trop volumineux (${(file.size / 1024 / 1024).toFixed(2)} Mo). Limite : 5 Mo.`
      );
    }
    const content_base64 = await fileToBase64(file);
    return adminFetch<VectorizeResponse>("/admin/studio/vectorize", {
      body: { filename: file.name, content_base64 },
    });
  },
};

export const CARDINALITY_TO_N: Record<string, number> = {
  UNITAIRE: 1, BINAIRE: 2, TERNAIRE: 3,
  QUATERNAIRE: 4, QUINAIRE: 5, SENAIRE: 6,
};

export const FAMILY_LABEL: Record<string, string> = {
  CONCEPT: "Concept",
  DESCR: "Description",
  EXPLI: "Explication",
  NARRA: "Narration",
  OPPO: "Opposition",
  PROCED: "Procédure",
};

export const FAMILY_ORDER: string[] = [
  "CONCEPT", "DESCR", "EXPLI", "NARRA", "OPPO", "PROCED",
];

export const CARDINALITY_ORDER: string[] = [
  "UNITAIRE", "BINAIRE", "TERNAIRE", "QUATERNAIRE", "QUINAIRE", "SENAIRE",
];

export const REGIME_ORDER: string[] = ["CONCRET", "SEMI_METAPHORIQUE"];

export function byRegistreSummary(c: CoverageCell): {
  domains: string[];
  sport: string[];
  hasEtat: boolean;
  hasConflit: boolean;
} {
  const etat = c.by_registre?.etat;
  const conflit = c.by_registre?.conflit;
  return {
    domains: c.by_registre?.domains ?? [],
    sport: c.by_registre?.sport ?? [],
    hasEtat: Array.isArray(etat) ? etat.length > 0 : Number(etat) > 0,
    hasConflit: Array.isArray(conflit) ? conflit.length > 0 : Number(conflit) > 0,
  };
}
