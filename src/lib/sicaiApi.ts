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
};
