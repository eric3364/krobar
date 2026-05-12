// Presets canoniques (Phase 8 backend) : matrices académiques avec slots
// sémantiques imposés (SWOT, PESTEL, BCG, Porter, BMC, McKinsey 7S, Ansoff).

import { adminFetch } from "@/lib/adminApi";

export type CanonicalPresetSlot = {
  key: string;
  label_fr: string;
  description_fr?: string;
};

export type CanonicalPreset = {
  id: string;
  name_fr: string;
  cardinality: number;
  slots: CanonicalPresetSlot[];
};

export type CanonicalPresetsResponse = {
  presets: CanonicalPreset[];
  all_canonical_keys: string[];
};

// Fallback statique si le backend ne répond pas (UI utilisable hors-ligne).
const FALLBACK_PRESETS: CanonicalPreset[] = [
  {
    id: "swot",
    name_fr: "SWOT — Forces / Faiblesses / Opportunités / Menaces",
    cardinality: 4,
    slots: [
      { key: "strength", label_fr: "Forces (S)", description_fr: "Avantages internes" },
      { key: "weakness", label_fr: "Faiblesses (W)", description_fr: "Limites internes" },
      { key: "opportunity", label_fr: "Opportunités (O)", description_fr: "Tendances favorables externes" },
      { key: "threat", label_fr: "Menaces (T)", description_fr: "Risques externes" },
    ],
  },
  {
    id: "pestel",
    name_fr: "PESTEL — Politique / Économique / Socio-culturel / Technologique / Écologique / Légal",
    cardinality: 6,
    slots: [
      { key: "political", label_fr: "Politique" },
      { key: "economic", label_fr: "Économique" },
      { key: "sociocultural", label_fr: "Socio-culturel" },
      { key: "technological", label_fr: "Technologique" },
      { key: "ecological", label_fr: "Écologique" },
      { key: "legal", label_fr: "Légal" },
    ],
  },
  {
    id: "bcg",
    name_fr: "BCG — Matrice de croissance / part de marché",
    cardinality: 4,
    slots: [
      { key: "star", label_fr: "Étoiles (Stars)" },
      { key: "cash_cow", label_fr: "Vaches à lait (Cash Cows)" },
      { key: "question_mark", label_fr: "Dilemmes (Question Marks)" },
      { key: "dog", label_fr: "Poids morts (Dogs)" },
    ],
  },
  {
    id: "porter",
    name_fr: "Porter — 5 forces concurrentielles",
    cardinality: 5,
    slots: [
      { key: "competitor", label_fr: "Rivalité interne" },
      { key: "new_entrant", label_fr: "Nouveaux entrants" },
      { key: "substitute", label_fr: "Produits de substitution" },
      { key: "supplier", label_fr: "Pouvoir des fournisseurs" },
      { key: "buyer", label_fr: "Pouvoir des clients" },
    ],
  },
  {
    id: "bmc",
    name_fr: "Business Model Canvas (Osterwalder)",
    cardinality: 9,
    slots: [
      { key: "customer_segment", label_fr: "Segments de clients" },
      { key: "value_proposition", label_fr: "Proposition de valeur" },
      { key: "channel", label_fr: "Canaux de distribution" },
      { key: "customer_relation", label_fr: "Relations clients" },
      { key: "revenue_stream", label_fr: "Flux de revenus" },
      { key: "key_resource", label_fr: "Ressources clés" },
      { key: "key_activity", label_fr: "Activités clés" },
      { key: "key_partner", label_fr: "Partenaires clés" },
      { key: "cost_structure", label_fr: "Structure de coûts" },
    ],
  },
  {
    id: "mckinsey_7s",
    name_fr: "McKinsey 7S",
    cardinality: 7,
    slots: [
      { key: "strategy", label_fr: "Stratégie" },
      { key: "structure", label_fr: "Structure" },
      { key: "system", label_fr: "Systèmes" },
      { key: "shared_value", label_fr: "Valeurs partagées" },
      { key: "skill", label_fr: "Compétences" },
      { key: "style", label_fr: "Style de management" },
      { key: "staff", label_fr: "Personnel" },
    ],
  },
  {
    id: "ansoff",
    name_fr: "Matrice Ansoff (produits × marchés)",
    cardinality: 4,
    slots: [
      { key: "market_penetration", label_fr: "Pénétration de marché" },
      { key: "market_development", label_fr: "Développement de marché" },
      { key: "product_development", label_fr: "Développement de produit" },
      { key: "diversification", label_fr: "Diversification" },
    ],
  },
];

export async function fetchCanonicalPresets(): Promise<CanonicalPreset[]> {
  try {
    const res = await adminFetch<CanonicalPresetsResponse>(
      "/admin/studio/canonical-presets",
      { method: "GET" },
    );
    if (Array.isArray(res?.presets) && res.presets.length > 0) return res.presets;
  } catch {
    /* fallback silencieux */
  }
  return FALLBACK_PRESETS;
}
