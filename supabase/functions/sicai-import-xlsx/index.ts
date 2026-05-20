// Import the 72 SICAI templates from an .xlsx file.
// Expects multipart/form-data with a "file" field (the .xlsx),
// parses the "Nomenclature V3" sheet, materializes prompt_full,
// computes checksum, upserts rows in sicai_templates.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as XLSX from "npm:xlsx@0.18.5";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ELLIPSIS_FIELDS = [
  "composition_distinctive_rule",
  "regime_differentiation_rule",
  "editorial_style_rule",
  "visual_hierarchy_rule",
  "composition_refinement_rule",
  "svg_technical_constraints",
  "negative_rules",
];

const COLUMN_ALIASES: Record<string, string> = {
  v4_editorial_style_rule: "editorial_style_rule",
  v4_visual_hierarchy_rule: "visual_hierarchy_rule",
  v4_composition_refinement_rule: "composition_refinement_rule",
  v4_svg_technical_constraints: "svg_technical_constraints",
  representation_regime_code: "regime_code",
  representation_regime_label: "regime_label",
};

function norm(k: string) {
  const key = k.trim();
  return COLUMN_ALIASES[key] ?? key;
}

function asInt(v: unknown, d = 0): number {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : d;
}

function asStr(v: unknown): string {
  return v == null ? "" : String(v);
}

function buildPromptFull(row: Record<string, unknown>): string {
  return `[Bloc 1 — Style Editorial Premium B&W]
${asStr(row.editorial_style_rule)}

[Bloc 2 — Archétype SICAI]
Archétype SICAI : ${asStr(row.illustration_id)}.
Famille : ${asStr(row.family_label)}. Cardinalité : ${asStr(row.cardinality_label)}. Régime : ${asStr(row.regime_label)}.
${asStr(row.composition_distinctive_rule)}

[Bloc 3 — Cardinalité et placeholders]
${asStr(row.placeholder_rule)}
${asStr(row.anchor_to_placeholder_rule)}
Tailles minimales placeholders selon cardinalité :
  - UNITAIRE 360×140 px
  - BINAIRE 320×124 px
  - TERNAIRE 280×112 px
  - MULTIPLE 240×100 px

[Bloc 4 — Différenciation de régime]
${asStr(row.regime_differentiation_rule)}
${asStr(row.composition_refinement_rule)}
${asStr(row.visual_hierarchy_rule)}

[Bloc 5 — Contraintes SVG et règles négatives]
${asStr(row.svg_technical_constraints)}
${asStr(row.negative_rules)}`;
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function parseTags(v: unknown): string[] | null {
  if (v == null || v === "") return null;
  if (Array.isArray(v)) return v.map(String);
  return String(v).split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Auth: require admin
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
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return new Response(JSON.stringify({ error: "missing file" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const buf = new Uint8Array(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: "array" });
    const sheetName = wb.SheetNames.includes("Nomenclature V3")
      ? "Nomenclature V3"
      : wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    const rawRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    const warnings: { row: number; field: string; issue: string }[] = [];
    const errors: { row: number; issue: string }[] = [];
    const upserts: Record<string, unknown>[] = [];

    rawRows.forEach((rawRow, i) => {
      const row: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rawRow)) row[norm(k)] = v;

      const rowIndex = i + 2; // header is row 1
      const illustration_id = asStr(row.illustration_id).trim();
      if (!illustration_id) {
        errors.push({ row: rowIndex, issue: "illustration_id manquant" });
        return;
      }

      for (const f of ELLIPSIS_FIELDS) {
        const s = asStr(row[f]);
        if (s.includes("...") || s.includes("…")) {
          warnings.push({ row: rowIndex, field: f, issue: "ellipse_detected" });
        }
      }

      const prompt_full = buildPromptFull(row);
      upserts.push({
        illustration_id,
        file_name_target: asStr(row.file_name_target).trim() || `${illustration_id}.svg`,
        family_code: asStr(row.family_code).trim(),
        family_label: asStr(row.family_label) || null,
        cardinality_code: asStr(row.cardinality_code).trim(),
        cardinality_label: asStr(row.cardinality_label) || null,
        regime_code: asStr(row.regime_code).trim(),
        regime_label: asStr(row.regime_label) || null,
        title_placeholder_count: asInt(row.title_placeholder_count, 1),
        verbatim_placeholder_count: asInt(row.verbatim_placeholder_count, 0),
        visual_anchor_count: asInt(row.visual_anchor_count, 0),
        placeholder_rule: asStr(row.placeholder_rule) || null,
        anchor_to_placeholder_rule: asStr(row.anchor_to_placeholder_rule) || null,
        color_standard: asStr(row.color_standard) || null,
        svg_constraint_summary: asStr(row.svg_constraint_summary) || null,
        composition_distinctive_rule: asStr(row.composition_distinctive_rule) || null,
        regime_differentiation_rule: asStr(row.regime_differentiation_rule) || null,
        matching_tags: parseTags(row.matching_tags),
        micro_brief: asStr(row.micro_brief) || null,
        prompt_short: asStr(row.prompt_short) || null,
        prompt_full,
        negative_rules: asStr(row.negative_rules) || null,
        editorial_style_rule: asStr(row.editorial_style_rule) || null,
        visual_hierarchy_rule: asStr(row.visual_hierarchy_rule) || null,
        composition_refinement_rule: asStr(row.composition_refinement_rule) || null,
        svg_technical_constraints: asStr(row.svg_technical_constraints) || null,
        source_row_index: rowIndex,
        status: "imported",
        validation_errors: null,
      });
    });

    // Compute checksums in parallel
    for (const r of upserts) {
      r.prompt_checksum = await sha256(r.prompt_full as string);
    }

    let imported = 0;
    if (upserts.length > 0) {
      const { error: upErr, count } = await admin
        .from("sicai_templates")
        .upsert(upserts, { onConflict: "illustration_id", count: "exact" });
      if (upErr) throw upErr;
      imported = count ?? upserts.length;
    }

    return new Response(JSON.stringify({
      imported,
      valid_structure: upserts.length,
      warnings,
      errors,
      source_file_name: file.name,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
