export type Palette = {
  primary: string;
  accent: string;
  bg: string;
  text: string;
};

export const palettes: Record<string, Palette> = {
  "ocean": { primary: "#1a365d", accent: "#3182ce", bg: "#ffffff", text: "#1a202c" },
  "crepuscule": { primary: "#e53e3e", accent: "#fbb030", bg: "#fffaf0", text: "#2d3748" },
  "foret": { primary: "#2d7d6e", accent: "#a8d5ba", bg: "#f7fafc", text: "#1a202c" },
  "encre": { primary: "#1a1a2e", accent: "#c9a961", bg: "#f5f5f0", text: "#1a1a2e" },
};

export const paletteLabels: Record<keyof typeof palettes, string> = {
  "ocean": "Océan",
  "crepuscule": "Crépuscule",
  "foret": "Forêt",
  "encre": "Encre",
};
