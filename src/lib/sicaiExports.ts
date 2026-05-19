import type { SicaiAnalysis, SicaiDocument, SicaiParagraph, SicaiSource } from "@/lib/sicaiApi";

const j = (v: unknown): string => {
  if (v == null) return "";
  if (typeof v === "string") return v;
  try { return JSON.stringify(v); } catch { return String(v); }
};

const csvEscape = (v: unknown): string => {
  const s = j(v);
  if (s === "") return "";
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

export type AnalysisExportContext = {
  documents: Map<string, SicaiDocument>;
  paragraphs: Map<string, SicaiParagraph>;
  sources?: Map<string, SicaiSource>;
};

const get = <T,>(v: unknown, k: string): T | undefined => {
  if (v && typeof v === "object") return (v as Record<string, unknown>)[k] as T | undefined;
  return undefined;
};

export function analysesToJSON(rows: SicaiAnalysis[], ctx: AnalysisExportContext): string {
  const enriched = rows.map((a) => {
    const doc = a.document_id ? ctx.documents.get(a.document_id) : null;
    const para = a.paragraph_id ? ctx.paragraphs.get(a.paragraph_id) : null;
    const src = doc?.source_id && ctx.sources ? ctx.sources.get(doc.source_id) : null;
    return {
      ...a,
      _document_title: doc?.title ?? null,
      _source_id: src?.source_id ?? null,
      _paragraph_index: para?.paragraph_index ?? null,
    };
  });
  return JSON.stringify(enriched, null, 2);
}

const CSV_HEADERS = [
  "source_id", "document_title", "paragraph_index",
  "analysis_level", "dominant_textual_function", "secondary_categories",
  "intensities", "classification_status",
  "cardinality_type", "number_of_elements",
  "temporality", "spatiality", "agency", "tension",
  "transformation_type",
  "iconic_affordance_primary", "abstraction_level",
  "graphic_family", "sicai_archetype_id", "image_prompt",
];

export function analysesToCSV(rows: SicaiAnalysis[], ctx: AnalysisExportContext): string {
  const lines = [CSV_HEADERS.join(",")];
  for (const a of rows) {
    const doc = a.document_id ? ctx.documents.get(a.document_id) : null;
    const para = a.paragraph_id ? ctx.paragraphs.get(a.paragraph_id) : null;
    const src = doc?.source_id && ctx.sources ? ctx.sources.get(doc.source_id) : null;
    const row = [
      src?.source_id ?? "",
      doc?.title ?? "",
      para?.paragraph_index ?? "",
      a.analysis_level ?? "",
      a.dominant_textual_function ?? "",
      a.secondary_categories,
      a.intensities,
      a.classification_status ?? "",
      get<string>(a.cardinality, "type") ?? get<string>(a.cardinality, "cardinality_type") ?? "",
      get<number>(a.cardinality, "number_of_elements") ?? get<number>(a.cardinality, "count") ?? "",
      a.temporality ?? "",
      a.spatiality ?? "",
      a.agency ?? "",
      a.tension ?? "",
      a.transformation ?? "",
      get<string>(a.iconic_affordance, "primary") ?? "",
      a.abstraction_level ?? "",
      a.graphic_family ?? "",
      a.sicai_archetype_id ?? "",
      a.image_prompt ?? "",
    ];
    lines.push(row.map(csvEscape).join(","));
  }
  return lines.join("\n");
}

export function analysesToMarkdown(rows: SicaiAnalysis[], ctx: AnalysisExportContext): string {
  // group by document
  const byDoc = new Map<string, SicaiAnalysis[]>();
  for (const a of rows) {
    const k = a.document_id ?? "_orphans";
    if (!byDoc.has(k)) byDoc.set(k, []);
    byDoc.get(k)!.push(a);
  }
  const out: string[] = ["# Export analyses SICAI\n"];
  for (const [docId, list] of byDoc) {
    const doc = docId !== "_orphans" ? ctx.documents.get(docId) : null;
    out.push(`## ${doc?.title ?? "(document inconnu)"}`);
    const globals = list.filter((a) => a.analysis_level === "document");
    const paras = list.filter((a) => a.analysis_level !== "document");
    if (globals.length) {
      out.push("\n### Analyse globale\n");
      for (const a of globals) out.push(renderAnalysisMd(a));
    }
    if (paras.length) {
      out.push("\n### Analyses par paragraphe\n");
      paras
        .sort((a, b) => {
          const ai = ctx.paragraphs.get(a.paragraph_id ?? "")?.paragraph_index ?? 0;
          const bi = ctx.paragraphs.get(b.paragraph_id ?? "")?.paragraph_index ?? 0;
          return ai - bi;
        })
        .forEach((a) => {
          const p = ctx.paragraphs.get(a.paragraph_id ?? "");
          out.push(`\n#### Paragraphe ${p?.paragraph_index ?? "?"}\n`);
          out.push(renderAnalysisMd(a));
        });
    }
    out.push("\n---\n");
  }
  return out.join("\n");
}

function renderAnalysisMd(a: SicaiAnalysis): string {
  const lines: string[] = [];
  lines.push(`- **Fonction dominante** : ${a.dominant_textual_function ?? "—"}`);
  lines.push(`- **Statut** : ${a.classification_status ?? "—"}`);
  lines.push(`- **Cardinalité** : ${j(a.cardinality) || "—"}`);
  lines.push(`- **Intensités** : ${j(a.intensities) || "—"}`);
  lines.push(`- **Tension / transformation** : ${a.tension ?? "—"} / ${a.transformation ?? "—"}`);
  lines.push(`- **Famille graphique** : ${a.graphic_family ?? "—"}  ·  **Archétype** : ${a.sicai_archetype_id ?? "—"}`);
  if (a.visual_brief && Object.keys(a.visual_brief as Record<string, unknown>).length) {
    lines.push(`\n**Brief visuel** :\n\n\`\`\`json\n${JSON.stringify(a.visual_brief, null, 2)}\n\`\`\``);
  }
  if (a.image_prompt) {
    lines.push(`\n**Prompt image** :\n\n> ${a.image_prompt.replace(/\n/g, "\n> ")}`);
  }
  return lines.join("\n");
}

function renderCharacteristics(a: SicaiAnalysis): string {
  const card = a.cardinality as Record<string, unknown> | null;
  const cardType = get<string>(card, "type") ?? get<string>(card, "cardinality_type") ?? "—";
  const cardBase = get<string>(card, "base_cardinality_for_archetype") ?? "—";
  const lines: string[] = [];
  lines.push(`- **Fonction dominante** : ${a.dominant_textual_function ?? "—"}`);
  lines.push(`- **Famille graphique** : ${a.graphic_family ?? "—"}`);
  lines.push(`- **Archétype SICAI** : ${a.sicai_archetype_id ?? "—"}`);
  lines.push(`- **Classification** : ${a.classification_status ?? "—"}`);
  lines.push(`- **Intensités sémantiques** : ${j(a.intensities) || "—"}`);
  lines.push(`- **Cardinalité (type)** : ${cardType}`);
  lines.push(`- **Cardinalité de base** : ${cardBase}`);
  lines.push(`- **Temporalité** : ${a.temporality ?? "—"}`);
  lines.push(`- **Spatialité** : ${a.spatiality ?? "—"}`);
  lines.push(`- **Agency** : ${a.agency ?? "—"}`);
  lines.push(`- **Tension** : ${a.tension ?? "—"}`);
  lines.push(`- **Transformation** : ${a.transformation ?? "—"}`);
  lines.push(`- **Niveau d'abstraction** : ${a.abstraction_level ?? "—"}`);
  return lines.join("\n");
}

export function analysesToFullReport(rows: SicaiAnalysis[], ctx: AnalysisExportContext): string {
  // Group analyses by document
  const byDoc = new Map<string, SicaiAnalysis[]>();
  for (const a of rows) {
    const k = a.document_id ?? "_orphans";
    if (!byDoc.has(k)) byDoc.set(k, []);
    byDoc.get(k)!.push(a);
  }

  const out: string[] = [];
  out.push(`# Rapport global SICAI`);
  out.push(`\n_Généré le ${new Date().toLocaleString()} — ${rows.length} analyse(s), ${byDoc.size} document(s)._\n`);

  for (const [docId, list] of byDoc) {
    const doc = docId !== "_orphans" ? ctx.documents.get(docId) : null;
    const src = doc?.source_id && ctx.sources ? ctx.sources.get(doc.source_id) : null;

    out.push(`\n---\n`);
    out.push(`## ${doc?.title ?? "(document inconnu)"}`);
    if (src) out.push(`\n_Source : ${src.source_id}${src.source_name ? ` — ${src.source_name}` : ""}_`);
    if (doc?.url) out.push(`\n_URL : ${doc.url}_`);

    // Full document text
    if (doc?.raw_text) {
      out.push(`\n### Texte intégral\n`);
      out.push(doc.raw_text);
    }

    // Global analyses
    const globals = list.filter((a) => a.analysis_level === "document");
    if (globals.length) {
      out.push(`\n### Analyse globale — caractéristiques\n`);
      for (const a of globals) out.push(renderCharacteristics(a));
    }

    // Paragraph analyses
    const paras = list
      .filter((a) => a.analysis_level !== "document")
      .sort((a, b) => {
        const ai = ctx.paragraphs.get(a.paragraph_id ?? "")?.paragraph_index ?? 0;
        const bi = ctx.paragraphs.get(b.paragraph_id ?? "")?.paragraph_index ?? 0;
        return ai - bi;
      });

    if (paras.length) {
      out.push(`\n### Analyses par paragraphe\n`);
      for (const a of paras) {
        const p = ctx.paragraphs.get(a.paragraph_id ?? "");
        out.push(`\n#### Paragraphe ${p?.paragraph_index ?? "?"}\n`);
        if (p?.paragraph_text) {
          out.push(`> ${p.paragraph_text.replace(/\n/g, "\n> ")}\n`);
        }
        out.push(renderCharacteristics(a));
      }
    }
  }

  return out.join("\n");
}

/**
 * Catalogue de référence paragraphe-par-paragraphe, conçu pour le matching
 * d'illustrations à partir d'un catalogue externe.
 * Chaque entrée = une "carte" exploitable : texte + ID + toutes les caractéristiques
 * sémantiques/visuelles + signaux de matching (motifs, brief, prompt).
 */
export function analysesToParagraphCatalog(rows: SicaiAnalysis[], ctx: AnalysisExportContext): string {
  // Garde uniquement les analyses paragraphe avec un paragraph_id valide
  const paraRows = rows
    .filter((a) => a.analysis_level !== "document" && a.paragraph_id)
    .sort((a, b) => {
      const da = a.document_id ?? "";
      const db = b.document_id ?? "";
      if (da !== db) {
        const ta = ctx.documents.get(da)?.title ?? "";
        const tb = ctx.documents.get(db)?.title ?? "";
        return ta.localeCompare(tb);
      }
      const ai = ctx.paragraphs.get(a.paragraph_id ?? "")?.paragraph_index ?? 0;
      const bi = ctx.paragraphs.get(b.paragraph_id ?? "")?.paragraph_index ?? 0;
      return ai - bi;
    });

  const out: string[] = [];
  out.push(`# Catalogue SICAI — paragraphes (matching illustrations)`);
  out.push(`\n_Généré le ${new Date().toLocaleString()} — ${paraRows.length} paragraphe(s) analysé(s)._`);
  out.push(`\nChaque entrée est une fiche autonome : identifiant stable, texte intégral du paragraphe et caractéristiques SICAI complètes utilisables pour matcher une illustration depuis un catalogue externe.\n`);

  for (const a of paraRows) {
    const doc = a.document_id ? ctx.documents.get(a.document_id) : null;
    const src = doc?.source_id && ctx.sources ? ctx.sources.get(doc.source_id) : null;
    const p = ctx.paragraphs.get(a.paragraph_id ?? "");
    const card = a.cardinality as Record<string, unknown> | null;
    const aff = a.iconic_affordance as Record<string, unknown> | null;

    const pIndex = p?.paragraph_index;
    const pIndexStr = typeof pIndex === "number" ? `P${String(pIndex).padStart(3, "0")}` : "P???";
    const matchKey = `${src?.source_id ?? "DOC"}-${(doc?.id ?? "").slice(0, 8)}-${pIndexStr}`;
    const computedWordCount = p?.word_count ?? (p?.paragraph_text ? p.paragraph_text.trim().split(/\s+/).filter(Boolean).length : null);

    out.push(`\n---\n`);
    out.push(`## ${matchKey}`);
    out.push(`\n- **Document** : ${doc?.title ?? "—"}`);
    if (src) out.push(`- **Source** : ${src.source_id}${src.source_name ? ` — ${src.source_name}` : ""}`);
    if (doc?.url) out.push(`- **URL** : ${doc.url}`);
    out.push(`- **Paragraphe** : #${typeof pIndex === "number" ? pIndex : "?"} · ${computedWordCount ?? "?"} mots`);
    out.push(`- **IDs techniques** : analysis=\`${a.id}\` · paragraph=\`${a.paragraph_id}\` · document=\`${a.document_id}\``);

    out.push(`\n### Texte\n`);
    if (p?.paragraph_text && p.paragraph_text.trim()) {
      out.push(`> ${p.paragraph_text.replace(/\n/g, "\n> ")}`);
    } else {
      out.push(`_(texte indisponible — paragraph_text absent en base)_`);
    }

    out.push(`\n### Caractéristiques SICAI\n`);
    out.push(renderCharacteristics(a));

    out.push(`\n### Signaux de matching\n`);
    out.push(`- **Famille graphique** : ${a.graphic_family ?? "—"}`);
    out.push(`- **Archétype** : ${a.sicai_archetype_id ?? "—"}`);
    out.push(`- **Cardinalité type** : ${get<string>(card, "type") ?? get<string>(card, "cardinality_type") ?? "—"}`);
    out.push(`- **Nombre d'éléments** : ${get<number>(card, "number_of_elements") ?? get<number>(card, "count") ?? "—"}`);
    out.push(`- **Affordance iconique primaire** : ${get<string>(aff, "primary") ?? "—"}`);
    const motifs = get<unknown[]>(aff, "motifs") ?? get<unknown[]>(a.visual_brief, "visual_motifs");
    if (motifs && Array.isArray(motifs) && motifs.length) {
      out.push(`- **Motifs visuels** : ${motifs.map((m) => j(m)).join(", ")}`);
    }
    if (a.visual_brief && Object.keys(a.visual_brief as Record<string, unknown>).length) {
      out.push(`\n**Brief visuel (JSON)**\n\n\`\`\`json\n${JSON.stringify(a.visual_brief, null, 2)}\n\`\`\``);
    }
    if (a.image_prompt) {
      out.push(`\n**Prompt image**\n\n> ${a.image_prompt.replace(/\n/g, "\n> ")}`);
    }
  }

  return out.join("\n");
}

/**
 * Variante CSV du catalogue paragraphe : une ligne = un paragraphe analysé,
 * avec texte + toutes les caractéristiques. Idéal pour brancher un moteur
 * de matching ou un tableur.
 */
export function paragraphCatalogToCSV(rows: SicaiAnalysis[], ctx: AnalysisExportContext): string {
  const headers = [
    "match_key", "source_id", "document_title", "document_url",
    "paragraph_index", "paragraph_word_count", "text_available",
    "paragraph_excerpt", "paragraph_text",
    "dominant_textual_function", "secondary_categories",
    "graphic_family", "sicai_archetype_id", "classification_status",
    "intensities",
    "cardinality_type", "base_cardinality_for_archetype", "number_of_elements",
    "temporality", "spatiality", "agency", "tension", "transformation",
    "iconic_affordance_primary", "visual_motifs",
    "abstraction_level", "image_prompt",
    "analysis_id", "paragraph_id", "document_id",
  ];
  const lines = [headers.join(",")];

  const paraRows = rows.filter((a) => a.analysis_level !== "document" && a.paragraph_id);
  for (const a of paraRows) {
    const doc = a.document_id ? ctx.documents.get(a.document_id) : null;
    const src = doc?.source_id && ctx.sources ? ctx.sources.get(doc.source_id) : null;
    const p = ctx.paragraphs.get(a.paragraph_id ?? "");
    const card = a.cardinality as Record<string, unknown> | null;
    const aff = a.iconic_affordance as Record<string, unknown> | null;
    const motifs = get<unknown[]>(aff, "motifs") ?? get<unknown[]>(a.visual_brief, "visual_motifs");
    const pIndex = p?.paragraph_index;
    const pIndexStr = typeof pIndex === "number" ? `P${String(pIndex).padStart(3, "0")}` : "P???";
    const matchKey = `${src?.source_id ?? "DOC"}-${(doc?.id ?? "").slice(0, 8)}-${pIndexStr}`;
    const text = p?.paragraph_text ?? "";
    const textAvailable = !!(text && text.trim());
    const wordCount = p?.word_count ?? (textAvailable ? text.trim().split(/\s+/).filter(Boolean).length : "");
    const excerpt = textAvailable ? text.slice(0, 300) : "";

    lines.push([
      matchKey,
      src?.source_id ?? "",
      doc?.title ?? "",
      doc?.url ?? "",
      pIndex ?? "",
      wordCount,
      textAvailable ? "true" : "false",
      excerpt,
      text,
      a.dominant_textual_function ?? "",
      a.secondary_categories,
      a.graphic_family ?? "",
      a.sicai_archetype_id ?? "",
      a.classification_status ?? "",
      a.intensities,
      get<string>(card, "type") ?? get<string>(card, "cardinality_type") ?? "",
      get<string>(card, "base_cardinality_for_archetype") ?? "",
      get<number>(card, "number_of_elements") ?? get<number>(card, "count") ?? "",
      a.temporality ?? "",
      a.spatiality ?? "",
      a.agency ?? "",
      a.tension ?? "",
      a.transformation ?? "",
      get<string>(aff, "primary") ?? "",
      motifs && Array.isArray(motifs) ? motifs.map((m) => j(m)).join(" | ") : "",
      a.abstraction_level ?? "",
      a.image_prompt ?? "",
      a.id,
      a.paragraph_id ?? "",
      a.document_id ?? "",
    ].map(csvEscape).join(","));
  }
  return lines.join("\n");
}

export function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 500);
}
