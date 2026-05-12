import { supabase } from "@/integrations/supabase/client";
import { loadSnapshot } from "@/lib/studioSnapshots";

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
  /** True si le template a été créé via le Studio (famille Premium). */
  premium?: boolean;
};

export const STUDIO_RECENT_DEPLOYS_STORAGE = "krobar-studio-recent-deploys";

type ManifestEntry = {
  id: string;
  name?: string;
  description?: string;
  best_for?: string;
  family?: string;
  source?: string;
  premium?: boolean;
  tier?: string;
  created_via?: string;
  slots?: string[];
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

type RecentStudioDeploy = {
  template_id: string;
  name?: string;
  category?: string;
  test_text: string;
  deployed_at?: string;
};

function readRecentStudioDeploys(): RecentStudioDeploy[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STUDIO_RECENT_DEPLOYS_STORAGE);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentStudioDeploy[];
    return Array.isArray(parsed)
      ? parsed.filter(
          (item) =>
            !!item &&
            typeof item.template_id === "string" &&
            typeof item.test_text === "string" &&
            item.template_id.trim().length > 0 &&
            item.test_text.trim().length > 0,
        )
      : [];
  } catch {
    return [];
  }
}

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
  const backendTests = data?.tests;
  if (!Array.isArray(backendTests) || backendTests.length === 0) {
    throw new Error("Le backend a renvoyé un corpus vide");
  }

  const manifestById = new Map(manifest.templates.map((t) => [t.id, t]));
  const knownTestIds = new Set(backendTests.map((entry) => entry.template_id));
  const recentStudioTests: CanonicalEntry[] = readRecentStudioDeploys()
    .filter((entry) => !knownTestIds.has(entry.template_id))
    .map((entry) => {
      const tpl = manifestById.get(entry.template_id);
      const inferredSlots = tpl && "slots" in tpl && Array.isArray((tpl as ManifestEntry & { slots?: string[] }).slots)
        ? (tpl as ManifestEntry & { slots?: string[] }).slots
        : undefined;

      return {
        template_id: entry.template_id,
        text: entry.test_text,
        expected_slots: inferredSlots,
        expected_slot_count: inferredSlots?.length,
        category: entry.category || "Premium",
      };
    });

  const manifestPremiumTests: CanonicalEntry[] = manifest.templates
    .filter(
      (tpl) =>
        !knownTestIds.has(tpl.id) &&
        (tpl.premium === true || tpl.tier === "premium" || tpl.family === "premium" || tpl.created_via === "studio_v1"),
    )
    .map((tpl) => {
      // Préférence : le texte de test saisi dans le Studio (snapshot Supabase),
      // qui est le texte explicitement choisi par l'admin pour valider le
      // template — pas la description marketing.
      const snap = loadSnapshot(tpl.id);
      const studioTestText = snap?.tplTestText?.trim();
      return {
        template_id: tpl.id,
        // On laisse `text` vide ici pour signaler qu'il faudra synthétiser
        // un vrai texte de test à partir des markers/intents (ci-dessous).
        text: studioTestText && studioTestText.length > 0 ? studioTestText : "",
        expected_slots: tpl.slots,
        expected_slot_count: tpl.slots?.length,
        category: "Premium",
      };
    });

  const tests = [...backendTests, ...recentStudioTests, ...manifestPremiumTests];

  // Construit les TestCase en synthétisant un vrai texte de test pour les
  // Premium dépourvus de snapshot (sinon on retomberait sur la description
  // marketing du template, qui ne déclenche ni les marqueurs ni les intents).
  const built = await Promise.all(
    tests.map(async (entry, idx) => {
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

      const isUnknownToStaticManifest = !tpl && !isChoreme;
      const premium =
        !choreme &&
        (tpl?.premium === true ||
          tpl?.tier === "premium" ||
          tpl?.family === "premium" ||
          tpl?.created_via === "studio_v1" ||
          tpl?.source === "studio" ||
          (entry.category || "").toLowerCase() === "premium" ||
          isUnknownToStaticManifest);

      // Snapshot Studio (s'il existe) → texte saisi par l'admin = autorité.
      const snap = premium ? loadSnapshot(entry.template_id) : null;
      const studioTestText = snap?.tplTestText?.trim();

      let finalText = studioTestText && studioTestText.length > 0 ? studioTestText : entry.text;

      // Pour un Premium sans texte de test exploitable, on récupère les
      // paramètres Studio côté backend (markers + matching types) et on
      // synthétise une phrase qui contient les marqueurs et exprime les
      // intents. C'est ce texte qui sera réellement envoyé à /analyze.
      if (premium && (!finalText || !finalText.trim())) {
        const params = await fetchPremiumStudioParams(entry.template_id);
        finalText = synthesizePremiumTestText({
          name: tpl?.name,
          description: tpl?.description,
          best_for: tpl?.best_for,
          matching_types: snap?.matchingIds ? undefined : params.matching_types,
          textual_markers: (snap?.tplMarkers && snap.tplMarkers.length > 0)
            ? snap.tplMarkers
            : params.textual_markers,
        });
      }

      return {
        id: idx + 1,
        expected_template: entry.template_id,
        category: entry.category || (choreme ? "Chorème" : premium ? "Premium" : "Other"),
        text: finalText,
        expected_slots: entry.expected_slots,
        expected_slot_count:
          entry.expected_slot_count ?? entry.expected_slots?.length,
        choreme,
        premium,
      } as TestCase;
    }),
  );

  return built;
}
