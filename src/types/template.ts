export type IconSlotSpec = {
  size: number;
  default_icon: string | null;
};

export type DecorativeIcon = {
  name: string;
  x: number;
  y: number;
  size: number;
  stroke: string;
  stroke_width: number;
  z_order: number;
};

export type Template = {
  id: string;
  name: string;
  category: string;
  tier: "standard" | "premium";
  slots: string[];
  icon_slots?: Record<string, IconSlotSpec>;
  decorative_icons?: DecorativeIcon[];
  viewBox?: string;
};
