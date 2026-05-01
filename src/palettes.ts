export type PaletteKey =
  | 'ocean'
  | 'foret'
  | 'crepuscule'
  | 'aurore'
  | 'encre'
  | 'corail'
  | 'menthe'
  | 'lavande'
  | 'sable';

export interface PaletteColors {
  primary: string;
  accent: string;
  bg: string;
  text: string;
  muted: string;
  surface: string;
  border: string;
}

export interface Palette {
  key: PaletteKey;
  name: string;
  description: string;
  colors: PaletteColors;
}

export const palettes: Record<PaletteKey, Palette> = {
  ocean: {
    key: 'ocean',
    name: 'Océan',
    description: 'Calme, professionnel — analytique, business, économie',
    colors: {
      primary: '#0F2A44', accent: '#2563EB', bg: '#FAFAF9', text: '#18181B',
      muted: '#71717A', surface: '#F4F4F5', border: '#E4E4E7',
    },
  },
  foret: {
    key: 'foret',
    name: 'Forêt',
    description: 'Naturel, sage — pédagogique, sciences, culture',
    colors: {
      primary: '#064E3B', accent: '#10B981', bg: '#FBFCF9', text: '#1C1917',
      muted: '#78716C', surface: '#F5F5F4', border: '#E7E5E4',
    },
  },
  crepuscule: {
    key: 'crepuscule',
    name: 'Crépuscule',
    description: 'Élégant, créatif — art, narration, design',
    colors: {
      primary: '#581C87', accent: '#C2410C', bg: '#FBF7F0', text: '#1C1917',
      muted: '#78716C', surface: '#F5EDE0', border: '#E7DECF',
    },
  },
  aurore: {
    key: 'aurore',
    name: 'Aurore',
    description: 'Lumineux, optimiste — communication, marketing, social',
    colors: {
      primary: '#BE185D', accent: '#FBBF24', bg: '#FFFBF5', text: '#1C1917',
      muted: '#78716C', surface: '#FEF3E2', border: '#FDE8C9',
    },
  },
  encre: {
    key: 'encre',
    name: 'Encre',
    description: 'Sobre, intemporel — formel, institutionnel, juridique',
    colors: {
      primary: '#18181B', accent: '#525252', bg: '#FAFAFA', text: '#09090B',
      muted: '#737373', surface: '#F4F4F5', border: '#E4E4E7',
    },
  },
};

export const defaultPalette: PaletteKey = 'ocean';

// Backwards-compat: labels map (name) for any code still importing it
export const paletteLabels: Record<PaletteKey, string> = {
  ocean: palettes.ocean.name,
  foret: palettes.foret.name,
  crepuscule: palettes.crepuscule.name,
  aurore: palettes.aurore.name,
  encre: palettes.encre.name,
};
