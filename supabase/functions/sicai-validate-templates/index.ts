// Validate imported SICAI templates against business rules.
// Marks each as 'ready' if all checks pass, else 'invalid' with detailed validation_errors.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const FAMILIES = new Set([
  "NARRATIVE_SCENIQUE",
  "DESCRIPTIVE_AMBIANCE",
  "EXPLICATIVE_SCHEMATIQUE",
  "PROCEDURALE_SEQUENTIELLE",
  "OPPOSITION_TRANSFORMATION",
  "CONCEPTUELLE_SYSTEMIQUE",
]);
const CARDS = new Set(["UNITAIRE", "BINAIRE", "TERNAIRE", "MULTIPLE"]);
const REGIMES = new Set(["CONCRET", "SEMI_METAPHORIQUE", "ABSTRAIT_SYSTEMIQUE"]);
const CARD_COUNTS: Record<string, { v: number; a: number }> = {
  UNITAIRE: { v: 1, a: 1 },
  BINAIRE: { v: 2, a: 2 },
  TERNAIRE: { v: 3, a: 3 },
  MULTIPLE: { v: 5, a: 5 },
};

function validate(t: Record<string, any>): string[] {
  const errs: string[] = [];
  if (!FAMILIES.has(t.family_code)) errs.push(`family_code invalide: ${t.family_code}`);
  if (!CARDS.has(t.cardinality_code)) errs.push(`cardinality_code invalide: ${t.cardinality_code}`);
  if (!REGIMES.has(t.regime_code)) errs.push(`regime_code invalide: ${t.regime_code}`);

  const exp = CARD_COUNTS[t.cardinality_code];
  if (exp) {
    if (t.title_placeholder_count !== 1) errs.push(`title_placeholder_count attendu 1, reçu ${t.title_placeholder_count}`);
    if (t.verbatim_placeholder_count !== exp.v) errs.push(`verbatim_placeholder_count attendu ${exp.v}, reçu ${t.verbatim_placeholder_count}`);
    if (t.visual_anchor_count !== exp.a) errs.push(`visual_anchor_count attendu ${exp.a}, reçu ${t.visual_anchor_count}`);
  }
  if (t.visual_anchor_count !== t.verbatim_placeholder_count) {
    errs.push("visual_anchor_count != verbatim_placeholder_count");
  }
  for (const f of ["prompt_full", "negative_rules", "svg_constraint_summary", "regime_differentiation_rule"]) {
    if (!t[f] || String(t[f]).trim() === "") errs.push(`champ vide: ${f}`);
  }
  const cs = String(t.color_standard ?? "").toLowerCase();
  if (!/noir et blanc|n&b|b&w|monochrom|niveaux de gris/.test(cs)) {
    errs.push("color_standard ne mentionne pas noir et blanc / monochrome");
  }
  return errs;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData?.user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: roleRow } = await admin.from("user_roles")
    .select("role").eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
  if (!roleRow) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const ids: string[] | undefined = body?.template_ids;

    let query = admin.from("sicai_templates").select("*");
    if (Array.isArray(ids) && ids.length > 0) query = query.in("id", ids);
    else query = query.in("status", ["imported", "invalid"]);

    const { data: templates, error } = await query;
    if (error) throw error;

    // Uniqueness check across whole table
    const { data: dupRows } = await admin.from("sicai_templates").select("illustration_id, file_name_target");
    const seenIll = new Map<string, number>();
    const seenFile = new Map<string, number>();
    for (const r of dupRows ?? []) {
      seenIll.set(r.illustration_id, (seenIll.get(r.illustration_id) ?? 0) + 1);
      seenFile.set(r.file_name_target, (seenFile.get(r.file_name_target) ?? 0) + 1);
    }

    const templates_invalid: { id: string; illustration_id: string; errors: string[] }[] = [];
    let valid = 0;

    for (const t of templates ?? []) {
      const errs = validate(t);
      if ((seenIll.get(t.illustration_id) ?? 0) > 1) errs.push("illustration_id non unique");
      if ((seenFile.get(t.file_name_target) ?? 0) > 1) errs.push("file_name_target non unique");

      if (errs.length === 0) {
        await admin.from("sicai_templates").update({ status: "ready", validation_errors: null }).eq("id", t.id);
        valid++;
      } else {
        await admin.from("sicai_templates").update({ status: "invalid", validation_errors: errs }).eq("id", t.id);
        templates_invalid.push({ id: t.id, illustration_id: t.illustration_id, errors: errs });
      }
    }

    return new Response(JSON.stringify({
      total: templates?.length ?? 0,
      valid,
      invalid: templates_invalid.length,
      templates_invalid,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
