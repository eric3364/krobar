import { supabase } from "@/integrations/supabase/client";

export type ChoremeFamily = "A" | "B" | "C";

export type ChoremeMeta = {
  code: string; // e.g. "A4"
  family: ChoremeFamily;
  triplet?: string;
  dominant_processes?: string[];
  matching_expressions?: string[];
};

export type TestCase = {
  id: number;
  expected_template: string;
  category: string;
  text: string;
  expected_slots?: string[];
  expected_slot_count?: number;
  /** Présent si le template est un chorème (enrichi depuis le manifest). */
  choreme?: ChoremeMeta;
};

type ManifestEntry = {
  id: string;
  choreme?: {
    code?: string;
    family?: ChoremeFamily;
    triplet?: string;
    dominant_processes?: string[];
    matching_expressions?: string[];
  };
};

type CanonicalEntry = {
  template_id: string;
  text: string;
  expected_slots?: string[];
  expected_slot_count?: number;
  category?: string;
};

type CanonicalResponse = { count?: number; tests: CanonicalEntry[] };

/**
 * Charge le corpus canonique de tests depuis le backend Krobar (79 textes
 * de référence — 1 par template). Les chorèmes sont enrichis avec les
 * métadonnées du manifest pour préserver les badges/famille de l'UI.
 */
export async function fetchCanonicalTestSuite(
  manifest: { templates: ManifestEntry[] },
): Promise<TestCase[]> {
  const resp = await supabase.functions.invoke("krobar-proxy", {
    body: { endpoint: "test-texts" },
  });
  if (resp.error) {
    const ctx = (resp.error as unknown as { context?: Response }).context;
    let detail = resp.error.message;
    if (ctx instanceof Response) {
      try {
        const body = (await ctx.clone().json()) as { error?: string };
        if (body?.error) detail = body.error;
      } catch {
        /* ignore */
      }
    }
    throw new Error(detail || "Échec du chargement du corpus");
  }
  const data = resp.data as CanonicalResponse | null;
  const tests = data?.tests;
  if (!Array.isArray(tests) || tests.length === 0) {
    throw new Error("Le backend a renvoyé un corpus vide");
  }

  const manifestById = new Map(manifest.templates.map((t) => [t.id, t]));

  return tests.map((entry, idx) => {
    const tpl = manifestById.get(entry.template_id);
    const isChoreme = entry.template_id.startsWith("choreme_") || !!tpl?.choreme;
    const choreme: ChoremeMeta | undefined =
      isChoreme && tpl?.choreme?.code && tpl.choreme.family
        ? {
            code: tpl.choreme.code,
            family: tpl.choreme.family,
            triplet: tpl.choreme.triplet,
            dominant_processes: tpl.choreme.dominant_processes,
            matching_expressions: tpl.choreme.matching_expressions,
          }
        : undefined;

    return {
      id: idx + 1,
      expected_template: entry.template_id,
      category: entry.category || (choreme ? "Chorème" : "Other"),
      text: entry.text,
      expected_slots: entry.expected_slots,
      expected_slot_count:
        entry.expected_slot_count ?? entry.expected_slots?.length,
      choreme,
    };
  });
}
