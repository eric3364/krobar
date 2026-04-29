export type Palette = {
  primary: string;
  accent: string;
  bg: string;
  text: string;
};

export const palettes: Record<string, Palette> = {
  "next-u-corporate": { primary: "#1a365d", accent: "#3182ce", bg: "#ffffff", text: "#1a202c" },
  "escen-vibrant": { primary: "#e53e3e", accent: "#fbb030", bg: "#fffaf0", text: "#2d3748" },
  "atlas-soft": { primary: "#2d7d6e", accent: "#a8d5ba", bg: "#f7fafc", text: "#1a202c" },
  "magnum-premium": { primary: "#1a1a2e", accent: "#c9a961", bg: "#f5f5f0", text: "#1a1a2e" },
};

export const paletteLabels: Record<keyof typeof palettes, string> = {
  "next-u-corporate": "Next-U Corporate",
  "escen-vibrant": "ESCEN Vibrant",
  "atlas-soft": "Atlas Soft",
  "magnum-premium": "Magnum Premium",
};
