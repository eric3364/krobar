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
};
