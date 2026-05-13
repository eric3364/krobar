export type SlotIcon = {
  default: string | null;
  alternatives: string[];
};

export type AnalyzeResponse = {
  template_id: string;
  slots: Record<string, string>;
  icons?: Record<string, SlotIcon>;
  svg: string;
};
