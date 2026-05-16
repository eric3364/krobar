// Convention SVG-KR (SVG Krobar-Ready) v1.0
// Renvoyé par /api/admin/studio/upload quand le SVG porte les annotations natives.

export type SvgKrIconBehavior = "disabled" | "optional" | "forced";
export type SvgKrIconPosition = "before" | "top" | "after";
export type SvgKrCardinality = "unique" | "repeated";

export type SvgKrSlot = {
  key: string;
  cardinality: SvgKrCardinality;
  cardinality_ideal?: number;
  cardinality_min?: number;
  cardinality_max?: number;
  variants?: number[];
  instance_index?: number;
  bbox?: { x: number; y: number; width: number; height: number };
  placeholder?: string;
  icon: {
    behavior: SvgKrIconBehavior;
    default?: string;
    position?: SvgKrIconPosition;
    size?: number;
  };
};

export type SvgKrMetadata = {
  id?: string;
  name?: string;
  category?: string;
  tier?: string;
  description?: string;
  best_for?: string;
  markers?: string[];
  matching_types?: string[];
  test_text?: string;
  domain?: string;
  canonical_preset?: string;
};

export type SvgKrDecoration = {
  type: "text";
  class: string;
  content: string;
  data_index?: string;
};

export type SvgKrData = {
  version: string;
  metadata: SvgKrMetadata;
  slots: SvgKrSlot[];
  decorations: SvgKrDecoration[];
};

export function isSvgKrVersionSupported(version: string | undefined): boolean {
  if (!version) return false;
  return /^1\./.test(version);
}
