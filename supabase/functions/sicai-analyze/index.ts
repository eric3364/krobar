// Supabase Edge Function: sicai-analyze
// Calls OpenAI to produce a strict-JSON SICAI analysis and stores it
// in `sicai_analyses`.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `Tu es un expert en sémantique, narratologie, analyse littéraire, analyse de discours, direction artistique et conception d'infographies.

Tu dois analyser le texte fourni selon la méthode SICAI :
Sémantique — Intensité — Cardinalité — Affordance Iconique.

Ton objectif est de produire une carte d'identité SICAI complète permettant de déterminer quelle illustration serait la plus signifiante pour représenter le texte.

Tu dois répondre uniquement en JSON strict valide.
N'ajoute aucun commentaire hors JSON.
N'utilise pas de Markdown.

Tu dois évaluer les dimensions suivantes avec des scores de 0 à 100 : narration, description, explication, argumentation, emotion, conceptualisation, procedure, opposition, transformation, synthese.

Règles de classification :
- exclusive : une dimension dépasse toutes les autres d'au moins 25 points.
- dominante_avec_nuance : une dimension domine avec un écart compris entre 10 et 25 points.
- hybride_stable : deux ou trois dimensions fortes sont proches et supérieures à 60.
- ambigue : aucune dimension ne domine clairement ou les scores sont dispersés.

Tu dois identifier la cardinalité : unitaire, binaire, ternaire, multiple, sequentielle, causale, cyclique, hierarchique, reseau.

Tu dois identifier : temporality, spatiality, agency, tension, transformation_type, iconic_affordance, abstraction_level, graphic_family, sicai_archetype_id, visual_brief, image_prompt.

Les familles graphiques autorisées sont : NARRATIVE_SCENIQUE, DESCRIPTIVE_AMBIANCE, EXPLICATIVE_SCHEMATIQUE, PROCEDURALE_SEQUENTIELLE, OPPOSITION_TRANSFORMATION, CONCEPTUELLE_SYSTEMIQUE.

Les cardinalités de base pour l'archétype sont : UNITAIRE, BINAIRE, TERNAIRE, MULTIPLE.

Les régimes de représentation sont : CONCRET, SEMI_METAPHORIQUE, ABSTRAIT_SYSTEMIQUE.

Le champ sicai_archetype_id doit obligatoirement suivre ce format : [FAMILLE]_[CARDINALITE]_[REGIME].

Le JSON attendu doit respecter exactement cette structure :

{
  "dominant_textual_function": "",
  "secondary_categories": [],
  "intensities": {
    "narration": 0,
    "description": 0,
    "explication": 0,
    "argumentation": 0,
    "emotion": 0,
    "conceptualisation": 0,
    "procedure": 0,
    "opposition": 0,
    "transformation": 0,
    "synthese": 0
  },
  "classification_status": "",
  "cardinality": {
    "type": "",
    "base_cardinality_for_archetype": "",
    "number_of_elements": 0,
    "evidence": []
  },
  "temporality": "",
  "spatiality": "",
  "agency": "",
  "tension": "",
  "transformation_type": "",
  "iconic_affordance": { "primary": "", "secondary": [] },
  "abstraction_level": "",
  "graphic_family": "",
  "sicai_archetype_id": "",
  "visual_brief": {
    "summary": "",
    "composition": "",
    "visual_elements": [],
    "elements_to_avoid": [],
    "tone": "",
    "style": ""
  },
  "image_prompt": "",
  "confidence": { "score": 0, "comment": "" }
}`;

const REQUIRED_FIELDS = [
  "dominant_textual_function",
  "secondary_categories",
  "intensities",
  "classification_status",
  "cardinality",
  "iconic_affordance",
  "graphic_family",
  "sicai_archetype_id",
  "visual_brief",
  "image_prompt",
  "confidence",
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function tryParseJson(raw: string): unknown | null {
  try { return JSON.parse(raw); } catch { /* noop */ }
  // try to extract first JSON object
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch { return null; }
  }
  return null;
}

function validateAnalysis(obj: unknown): { ok: true } | { ok: false; missing: string[] } {
  if (!obj || typeof obj !== "object") return { ok: false, missing: ["<root>"] };
  const o = obj as Record<string, unknown>;
  const missing = REQUIRED_FIELDS.filter((f) => !(f in o));
  return missing.length ? { ok: false, missing } : { ok: true };
}

async function callOpenAI(apiKey: string, model: string, text: string): Promise<{ raw: string; parsed: unknown | null }> {
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Texte à analyser :\n${text}` },
      ],
    }),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`OpenAI ${resp.status}: ${errText.slice(0, 500)}`);
  }
  const data = await resp.json();
  const raw: string = data?.choices?.[0]?.message?.content ?? "";
  return { raw, parsed: tryParseJson(raw) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

  if (!OPENAI_API_KEY) {
    return json(
      { error: "Clé OpenAI absente côté serveur. Configurez OPENAI_API_KEY dans les secrets Supabase." },
      500,
    );
  }

  // --- Auth: must be admin ---
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: hasRole, error: roleErr } = await admin.rpc("has_role", {
    _user_id: userData.user.id,
    _role: "admin",
  });
  if (roleErr) return json({ error: roleErr.message }, 500);
  if (!hasRole) return json({ error: "Admin role required" }, 403);

  // --- Input validation ---
  let body: {
    document_id?: string;
    analysis_level?: "global" | "paragraph";
    paragraph_id?: string | null;
    text_to_analyze?: string;
  };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

  const { document_id, analysis_level, paragraph_id = null, text_to_analyze } = body;
  if (!document_id) return json({ error: "document_id is required" }, 400);
  if (analysis_level !== "global" && analysis_level !== "paragraph") {
    return json({ error: "analysis_level must be 'global' or 'paragraph'" }, 400);
  }
  if (analysis_level === "paragraph" && !paragraph_id) {
    return json({ error: "paragraph_id is required for paragraph-level analysis" }, 400);
  }
  if (!text_to_analyze || !text_to_analyze.trim()) {
    return json({ error: "text_to_analyze must not be empty" }, 400);
  }

  // --- Optional override model from sicai_settings ---
  let model = "gpt-4o-mini";
  const { data: settingRow } = await admin
    .from("sicai_settings")
    .select("setting_value")
    .eq("setting_key", "openai_model")
    .maybeSingle();
  const settingVal = (settingRow?.setting_value as { model?: string } | null)?.model;
  if (settingVal && typeof settingVal === "string") model = settingVal;

  // --- Call OpenAI ---
  let raw = "";
  let parsed: unknown | null = null;
  try {
    const first = await callOpenAI(OPENAI_API_KEY, model, text_to_analyze);
    raw = first.raw;
    parsed = first.parsed;

    let check = validateAnalysis(parsed);
    if (!check.ok) {
      // single repair retry
      const repairPrompt =
        `Le JSON suivant est invalide ou incomplet. Champs manquants : ${check.missing.join(", ")}.\n` +
        `Régénère un JSON SICAI strict, complet et valide à partir du texte ci-dessous.\n\n` +
        `Texte :\n${text_to_analyze}`;
      const retry = await callOpenAI(OPENAI_API_KEY, model, repairPrompt);
      raw = retry.raw;
      parsed = retry.parsed;
      check = validateAnalysis(parsed);
      if (!check.ok) {
        return json({
          error: "Réponse IA invalide après réparation",
          missing_fields: check.missing,
          raw_preview: raw.slice(0, 1000),
        }, 422);
      }
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "OpenAI call failed" }, 502);
  }

  const a = parsed as Record<string, unknown>;

  // --- Persist ---
  const row = {
    document_id,
    paragraph_id,
    analysis_level,
    classification_status: (a.classification_status as string) ?? null,
    dominant_textual_function: (a.dominant_textual_function as string) ?? null,
    secondary_categories: a.secondary_categories ?? [],
    intensities: a.intensities ?? {},
    cardinality: a.cardinality ?? {},
    temporality: (a.temporality as string) ?? null,
    spatiality: (a.spatiality as string) ?? null,
    agency: (a.agency as string) ?? null,
    tension: (a.tension as string) ?? null,
    transformation: (a.transformation_type as string) ?? null,
    iconic_affordance: a.iconic_affordance ?? {},
    abstraction_level: (a.abstraction_level as string) ?? null,
    graphic_family: (a.graphic_family as string) ?? null,
    sicai_archetype_id: (a.sicai_archetype_id as string) ?? null,
    visual_brief: a.visual_brief ?? {},
    image_prompt: (a.image_prompt as string) ?? null,
    ai_model: model,
    ai_raw_response: parsed,
  };

  const { data: inserted, error: insErr } = await admin
    .from("sicai_analyses")
    .insert(row)
    .select()
    .single();
  if (insErr) return json({ error: insErr.message }, 500);

  // Bump document status if global
  if (analysis_level === "global") {
    await admin
      .from("sicai_documents")
      .update({ document_status: "analyzed" })
      .eq("id", document_id);
  }

  return json({ analysis: inserted });
});
