// Admin-only export of the normalized matrices catalogue + trigger_lexicon for the Krobar Matcher backend.
// Read-only: never writes to matrices.json nor to matrice_trigger_lexicon.
import { createClient } from "npm:@supabase/supabase-js@2";
import yaml from "npm:js-yaml@4.1.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Matrice = {
  id: string;
  name: string;
  category: string;
  usage: string;
  components?: string[];
  components_status?: "verified" | "to_verify";
};

type LexiconRow = { matrice_id: string; lexicon_yaml: string | null };

function isNonEmptyObject(v: unknown): boolean {
  return !!v && typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length > 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const matrices = body?.matrices as Matrice[] | undefined;
    if (!Array.isArray(matrices) || matrices.length === 0) {
      return new Response(JSON.stringify({ error: "matrices array required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch all lexicons (admin RLS already enforced).
    const { data: lexRows, error: lexErr } = await supabase
      .from("matrice_trigger_lexicon")
      .select("matrice_id, lexicon_yaml");
    if (lexErr) throw new Error(`lexicon fetch: ${lexErr.message}`);

    const lexMap = new Map<string, string>();
    for (const r of (lexRows ?? []) as LexiconRow[]) {
      lexMap.set(r.matrice_id, r.lexicon_yaml ?? "");
    }

    const matrixIds = new Set(matrices.map((m) => m.id));
    const lexiconIds = new Set(lexMap.keys());

    // Build export entries, sorted by id ascending.
    const sorted = [...matrices].sort((a, b) => a.id.localeCompare(b.id));
    const entries: unknown[] = [];
    const parseErrors: { id: string; error: string }[] = [];
    const schemaIncomplete: string[] = [];
    let readyTrue = 0;
    let readyFalse = 0;

    for (const m of sorted) {
      const yamlText = lexMap.get(m.id) ?? "";
      let lex: Record<string, unknown> = {};
      if (yamlText.trim()) {
        try {
          const parsed = yaml.load(yamlText);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            lex = parsed as Record<string, unknown>;
          }
        } catch (e) {
          parseErrors.push({ id: m.id, error: (e as Error).message });
        }
      }

      const structural = (lex.structural ?? {}) as Record<string, unknown>;
      const lemmaVariants = structural.lemma_variants;
      const lemmaOk = isNonEmptyObject(lemmaVariants);

      const isReady =
        m.components_status === "verified" ||
        (m.components_status === "to_verify" && lemmaOk);

      if (isReady) readyTrue++; else readyFalse++;

      // Schema check (informational): the 4 expected top-level sections.
      const requiredSections = ["nominal", "structural", "discriminators", "confidence_default"];
      const missing = requiredSections.filter((k) => !(k in lex));
      if (missing.length > 0 && isReady) schemaIncomplete.push(`${m.id}: missing ${missing.join(",")}`);

      entries.push({
        id: m.id,
        name: m.name,
        category: m.category,
        usage: m.usage,
        components: m.components ?? [],
        components_status: m.components_status ?? null,
        trigger_lexicon: lex,
        is_matcher_ready: isReady,
      });
    }

    // Cross-integrity audit.
    const inMatricesOnly = [...matrixIds].filter((id) => !lexiconIds.has(id));
    const inLexiconOnly = [...lexiconIds].filter((id) => !matrixIds.has(id));

    const audit = {
      total_entries: entries.length,
      expected_total: 312,
      cardinality_ok: entries.length === 312,
      matrices_without_lexicon: inMatricesOnly,
      lexicons_without_matrice: inLexiconOnly,
      cross_integrity_ok: inMatricesOnly.length === 0 && inLexiconOnly.length === 0,
      yaml_parse_errors: parseErrors,
      schema_incomplete_ready_entries: schemaIncomplete,
      flag_counts: { is_matcher_ready_true: readyTrue, is_matcher_ready_false: readyFalse },
      ready_ratio_in_expected_range: readyTrue >= 150 && readyTrue <= 230,
    };

    const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 15); // YYYYMMDD-HHMMSS-ish
    const stamp = `${ts.slice(0, 8)}-${ts.slice(8, 14)}`;
    const filename = `matrices-export-${stamp}.json`;

    return new Response(JSON.stringify({ filename, audit, entries }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
