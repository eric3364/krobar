import { supabase } from "@/integrations/supabase/client";

export type SicaiSource = {
  id: string;
  source_id: string;
  title: string;
  source_type: string | null;
  source_name: string | null;
  url: string | null;
  language: string | null;
  expected_sicai_profile: string | null;
  analysis_interest: string | null;
  content_status: string | null;
  created_at: string;
  updated_at: string;
};

export type SicaiDocument = {
  id: string;
  source_id: string | null;
  title: string;
  raw_text: string | null;
  summary: string | null;
  language: string | null;
  document_status: string | null;
  word_count: number | null;
  paragraph_count: number | null;
  source_type: string | null;
  url: string | null;
  internal_notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export function countWords(text: string): number {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/u).length;
}

export const sicaiApi = {
  async listSources(): Promise<SicaiSource[]> {
    const { data, error } = await supabase
      .from("sicai_sources")
      .select("*")
      .order("source_id", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as SicaiSource[];
  },
  async getSource(id: string): Promise<SicaiSource | null> {
    const { data, error } = await supabase
      .from("sicai_sources")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as SicaiSource) ?? null;
  },

  async createDocument(input: {
    title: string;
    raw_text: string;
    source_id?: string | null;
    source_type?: string | null;
    url?: string | null;
    language?: string | null;
    summary?: string | null;
    internal_notes?: string | null;
  }): Promise<SicaiDocument> {
    const { data: userData } = await supabase.auth.getUser();
    const created_by = userData.user?.id ?? null;

    const payload = {
      title: input.title.trim(),
      raw_text: input.raw_text,
      source_id: input.source_id || null,
      source_type: input.source_type || null,
      url: input.url || null,
      language: input.language || "fr",
      summary: input.summary || null,
      internal_notes: input.internal_notes || null,
      word_count: countWords(input.raw_text),
      paragraph_count: 0,
      document_status: "draft",
      created_by,
    };

    const { data, error } = await supabase
      .from("sicai_documents")
      .insert(payload)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as SicaiDocument;
  },

  async getDocument(id: string): Promise<SicaiDocument | null> {
    const { data, error } = await supabase
      .from("sicai_documents")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as SicaiDocument) ?? null;
  },

  async listParagraphs(documentId: string): Promise<SicaiParagraph[]> {
    const { data, error } = await supabase
      .from("sicai_paragraphs")
      .select("*")
      .eq("document_id", documentId)
      .order("paragraph_index", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as SicaiParagraph[];
  },

  async deleteParagraphs(documentId: string): Promise<void> {
    const { error } = await supabase
      .from("sicai_paragraphs")
      .delete()
      .eq("document_id", documentId);
    if (error) throw new Error(error.message);
  },

  async segmentDocument(documentId: string, raw_text: string): Promise<SicaiParagraph[]> {
    const chunks = splitParagraphs(raw_text);
    await this.deleteParagraphs(documentId);

    if (chunks.length === 0) {
      await supabase
        .from("sicai_documents")
        .update({ paragraph_count: 0, document_status: "segmented" })
        .eq("id", documentId);
      return [];
    }

    const rows = chunks.map((text, i) => {
      const list = detectList(text);
      return {
        document_id: documentId,
        paragraph_index: i + 1,
        paragraph_text: text,
        word_count: countWords(text),
        has_list: list.has_list,
        detected_items_count: list.items_count,
      };
    });

    const { data, error } = await supabase
      .from("sicai_paragraphs")
      .insert(rows)
      .select();
    if (error) throw new Error(error.message);

    const { error: e2 } = await supabase
      .from("sicai_documents")
      .update({ paragraph_count: rows.length, document_status: "segmented" })
      .eq("id", documentId);
    if (e2) throw new Error(e2.message);

    return ((data ?? []) as SicaiParagraph[]).sort(
      (a, b) => a.paragraph_index - b.paragraph_index,
    );
  },
};

export type SicaiParagraph = {
  id: string;
  document_id: string;
  paragraph_index: number;
  paragraph_text: string;
  word_count: number | null;
  has_list: boolean | null;
  detected_items_count: number | null;
  created_at: string;
};

// ---------- Segmentation helpers ----------

export function splitParagraphs(text: string): string[] {
  if (!text) return [];
  const normalised = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return normalised
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

const ORDINAL_MARKERS = [
  "d'abord", "d\u2019abord",
  "ensuite", "puis", "enfin",
  "premièrement", "deuxièmement", "troisièmement",
];

export function detectList(text: string): { has_list: boolean; items_count: number } {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  let bulletItems = 0;
  for (const l of lines) {
    if (/^[-•]\s+/.test(l)) bulletItems += 1;
    else if (/^\d+[.)]\s+/.test(l)) bulletItems += 1;
  }

  const lower = text.toLowerCase();
  let markerItems = 0;
  for (const m of ORDINAL_MARKERS) {
    const escaped = m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(
      `(^|[^a-zàâäéèêëîïôöùûüç])${escaped}([^a-zàâäéèêëîïôöùûüç]|$)`,
      "g",
    );
    const matches = lower.match(re);
    if (matches) markerItems += matches.length;
  }

  const items_count = bulletItems + markerItems;
  return { has_list: items_count > 0, items_count };
}
