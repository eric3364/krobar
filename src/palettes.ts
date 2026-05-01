export type PaletteKey =
  | 'ocean'
  | 'foret'
  | 'crepuscule'
  | 'aurore'
  | 'encre'
  | 'corail'
  | 'menthe'
  | 'lavande'
  | 'sable'
  | 'ardoise';

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
  corail: {
    key: 'corail',
    name: 'Corail',
    description: 'Chaleureux, énergique — coaching, lifestyle, bien-être',
    colors: {
      primary: '#7C2D12', accent: '#F97316', bg: '#FFF8F4', text: '#1C1917',
      muted: '#78716C', surface: '#FEEBD8', border: '#FDD9B5',
    },
  },
  menthe: {
    key: 'menthe',
    name: 'Menthe',
    description: 'Frais, apaisant — santé, écologie, innovation',
    colors: {
      primary: '#134E4A', accent: '#14B8A6', bg: '#F5FBFA', text: '#0F172A',
      muted: '#64748B', surface: '#E6F5F2', border: '#CCEAE4',
    },
  },
  lavande: {
    key: 'lavande',
    name: 'Lavande',
    description: 'Doux, raisonné — recherche, technologie, conseil',
    colors: {
      primary: '#3730A3', accent: '#A78BFA', bg: '#FAF8FF', text: '#1E1B4B',
      muted: '#6B7280', surface: '#EFEAFE', border: '#DDD3FB',
    },
  },
  sable: {
    key: 'sable',
    name: 'Sable',
    description: 'Naturel, raffiné — éditorial, luxe discret, artisanat',
    colors: {
      primary: '#44403C', accent: '#B45309', bg: '#FBF8F1', text: '#1C1917',
      muted: '#78716C', surface: '#F1EAD9', border: '#E2D6BC',
    },
  },
  ardoise: {
    key: 'ardoise',
    name: 'Ardoise',
    description: 'Moderne, high-tech — startup, tech, data, ingénierie',
    colors: {
      primary: '#1E293B', accent: '#38BDF8', bg: '#F8FAFC', text: '#0F172A',
      muted: '#94A3B8', surface: '#F1F5F9', border: '#E2E8F0',
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
  corail: palettes.corail.name,
  menthe: palettes.menthe.name,
  lavande: palettes.lavande.name,
  sable: palettes.sable.name,
  ardoise: palettes.ardoise.name,
};
