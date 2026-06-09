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
  ratio_label?: string;
};

export type Occupancy = {
  cols: number;
  rows: number;
  grid: number[][];
};

export type Viewbox = [number, number, number, number];

export type VectorizeResponse = {
  ok: boolean;
  svg: string;
  metrics: VectorizeMetrics;
  occupancy?: Occupancy;
  viewbox?: Viewbox;
};

export type ZoneRect = { x: number; y: number; w: number; h: number };
export type ZoneIcon = ZoneRect & { transparent?: boolean };
export type ZonePair = {
  n: number;
  side?: string;
  rect: ZoneRect | null;
  cells?: { r0: number; c0: number; bw: number; bh: number };
  icon: ZoneIcon | null;
  unplaced?: boolean;
};

export type PlaceZonesPayload = {
  occupancy: Occupancy;
  viewbox: Viewbox;
  cardinality_max: number;
};

export type HeaderZone = { role: string; rect: ZoneRect; optional?: boolean };
export type HeadersZones = { title: HeaderZone; subtitle: HeaderZone };

export type PlaceZonesResponse = {
  cardinality_max: number;
  viewbox: Viewbox;
  by_cardinality: Record<string, ZonePair[]>;
  headers?: HeadersZones;
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

  placeZones: (payload: PlaceZonesPayload) =>
    adminFetch<PlaceZonesResponse>("/admin/studio/place-zones", { body: payload }),

  matchingTypes: () =>
    adminFetch<MatchingTypesResponse>("/admin/studio/matching-types", { method: "GET" }),

  suggestMetadata: (payload: SuggestMetadataPayload) =>
    adminFetch<SuggestMetadataResponse>("/admin/studio/suggest-metadata", { body: payload }),

  exportTemplates: (payload: ExportPayload) =>
    adminFetch<ExportResponse>("/admin/studio/export-templates", { body: payload }),
};

export type MatchingType = { id: string; label: string };
export type MatchingGroup = { id: string; label: string; matching_types: MatchingType[] };
export type MatchingTypesResponse = { groups: MatchingGroup[] };

export type SuggestMetadataPayload = {
  cell: { family: string; cardinality: string; regime: string };
  incarnation: string;
};
export type SuggestMetadataResponse = {
  best_for: string;
  textual_markers: string[];
  matching_types: string[];
};

export type ExportZone = {
  n: number;
  rect: ZoneRect;
  icon: ZoneRect;
  mode: "cartouche" | "integre";
  trait_side: "left" | "right";
  backplate: boolean;
};

export type CompositionPayload = {
  cell: { index: string; family: string; cardinality: string; regime: string; incarnation: string };
  viewbox: [number, number, number, number];
  decor: { vectorized_svg: string; transform: string };
  gabarit: { font_size: number; box_w: number; box_h: number };
  metadata: {
    category: string;
    domain: string;
    best_for: string;
    textual_markers: string[];
    matching_types: string[];
  };
  zones_by_cardinality: Record<string, ExportZone[]>;
  headers?: {
    title: { rect: ZoneRect };
    subtitle: { rect: ZoneRect; disabled: boolean };
  };
};

export type ExportPayload = { composition: CompositionPayload };

export type ExportResponse = {
  ok: boolean;
  base_id: string;
  deployed: string[];
  skipped: string[];
  manifest_total: number;
  backup: string;
  cache_cleared: boolean;
  restart_required: boolean;
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
