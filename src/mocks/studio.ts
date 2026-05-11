// Mocks du Krobar Studio. Activés via VITE_USE_STUDIO_MOCKS (par défaut true).

export type UploadResponse = {
  session_id: string;
  source_format: "svg" | "eps" | "ai" | "pdf";
  image_width: number;
  image_height: number;
  rendered_png_url: string;
  cleaned_svg: string;
  native_text_count: number;
  sanitization: { elements_removed: number; attributes_removed: number; external_refs_blocked: number };
};

export type MatchingType = {
  id: string;
  label: string;
  category: string;
  primary_intent: "process" | "comparison" | "hierarchy" | "matrix" | "network" | "timeline" | "concept";
  textual_markers: string[];
};

export const MATCHING_TYPES_FALLBACK: MatchingType[] = [
  { id: "process_steps",       label: "Présenter une suite d'étapes ordonnées",          category: "PROCESSUS & ÉTAPES",      primary_intent: "process",    textual_markers: ["étape", "phase", "puis", "ensuite"] },
  { id: "process_cycle",       label: "Décrire un processus cyclique",                   category: "PROCESSUS & ÉTAPES",      primary_intent: "process",    textual_markers: ["cycle", "boucle", "récurrent"] },
  { id: "process_progression", label: "Illustrer une progression ou une montée en charge", category: "PROCESSUS & ÉTAPES",    primary_intent: "process",    textual_markers: ["progression", "monter", "croissance"] },
  { id: "comparison_options",  label: "Opposer deux ou plusieurs options",               category: "COMPARAISON & CHOIX",     primary_intent: "comparison", textual_markers: ["versus", "ou bien", "alternative"] },
  { id: "comparison_before_after", label: "Montrer un avant et un après",                category: "COMPARAISON & CHOIX",     primary_intent: "comparison", textual_markers: ["avant", "après", "transformation"] },
  { id: "comparison_swot",     label: "Comparer des forces et faiblesses",               category: "COMPARAISON & CHOIX",     primary_intent: "comparison", textual_markers: ["force", "faiblesse", "opportunité", "menace"] },
  { id: "hierarchy_org",       label: "Représenter une hiérarchie ou une structure",     category: "HIÉRARCHIE & ORGANISATION", primary_intent: "hierarchy", textual_markers: ["hiérarchie", "niveau", "structure"] },
  { id: "hierarchy_levels",    label: "Montrer des niveaux d'importance",                category: "HIÉRARCHIE & ORGANISATION", primary_intent: "hierarchy", textual_markers: ["important", "prioritaire", "majeur"] },
  { id: "hierarchy_subordination", label: "Décrire une subordination",                   category: "HIÉRARCHIE & ORGANISATION", primary_intent: "hierarchy", textual_markers: ["dépend de", "sous", "rattaché"] },
  { id: "matrix_axes",         label: "Croiser deux dimensions / axes",                  category: "MATRICE & CROISEMENT",    primary_intent: "matrix",     textual_markers: ["axe", "dimension", "croisement"] },
  { id: "matrix_quadrants",    label: "Distinguer 4 quadrants",                          category: "MATRICE & CROISEMENT",    primary_intent: "matrix",     textual_markers: ["quadrant", "quatre catégories"] },
  { id: "network_mindmap",     label: "Cartographier les idées autour d'un concept",     category: "RÉSEAU & MINDMAP",        primary_intent: "network",    textual_markers: ["mindmap", "carte", "centre", "facettes"] },
  { id: "network_facets",      label: "Présenter les facettes d'un sujet",               category: "RÉSEAU & MINDMAP",        primary_intent: "network",    textual_markers: ["facette", "aspect", "dimension"] },
  { id: "network_ecosystem",   label: "Illustrer un écosystème ou un réseau",            category: "RÉSEAU & MINDMAP",        primary_intent: "network",    textual_markers: ["écosystème", "réseau", "interconnecté"] },
  { id: "timeline_chrono",     label: "Suivre une chronologie ou frise",                 category: "TEMPS & CHRONOLOGIE",     primary_intent: "timeline",   textual_markers: ["chronologie", "frise", "date"] },
  { id: "timeline_roadmap",    label: "Présenter une roadmap",                           category: "TEMPS & CHRONOLOGIE",     primary_intent: "timeline",   textual_markers: ["roadmap", "trimestre", "jalon"] },
  { id: "concept_metaphor",    label: "Illustrer un concept par une métaphore visuelle", category: "CONCEPT & MÉTAPHORE",     primary_intent: "concept",    textual_markers: ["métaphore", "incarne", "symbolise"] },
  { id: "concept_abstract",    label: "Symboliser une idée abstraite",                   category: "CONCEPT & MÉTAPHORE",     primary_intent: "concept",    textual_markers: ["abstrait", "idée", "représente"] },
];

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const uuid = () => "sess_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export async function mockUpload(file: File): Promise<UploadResponse> {
  await delay(1200);
  const ext = (file.name.split(".").pop() ?? "svg").toLowerCase() as UploadResponse["source_format"];
  const w = 1345, h = 1550;
  return {
    session_id: uuid(),
    source_format: ext,
    image_width: w,
    image_height: h,
    rendered_png_url: `https://placehold.co/${w}x${h}/fafaf8/666666?text=${encodeURIComponent(file.name)}`,
    cleaned_svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"></svg>`,
    native_text_count: 0,
    sanitization: { elements_removed: 0, attributes_removed: 0, external_refs_blocked: 0 },
  };
}

export async function mockMatchingTypes(): Promise<{ matching_types: MatchingType[] }> {
  await delay(200);
  return { matching_types: MATCHING_TYPES_FALLBACK };
}

export async function mockSaveDraft(payload: unknown): Promise<{ draft_id: string }> {
  await delay(400);
  return { draft_id: "draft_" + Math.random().toString(36).slice(2, 10) };
}

export async function mockDeploy(payload: unknown): Promise<{ deployed: true; template_id: string }> {
  await delay(800);
  return { deployed: true, template_id: (payload as any)?.template_id ?? "deployed_template" };
}
