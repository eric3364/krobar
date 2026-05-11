import { useEffect, useReducer, useState, useCallback, useMemo } from "react";
import KrobarSvg from "@/components/KrobarSvg";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Plus, Trash2, Loader2, Upload, X, Sparkles, Image as ImageIcon, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { templateCreatorApi, type GeneratePayload, type GenerateResponse, type SlotRole } from "@/lib/templateCreatorApi";
import { DiagnosticPanel, type DiagnosticVersion } from "@/components/DiagnosticPanel";

type Mode = "description" | "image" | "both";
type CardinalityMode = "variants" | "optional_groups" | "fixed_decor_pool";

type WizardState = {
  step: 1 | 2 | 3 | 4 | 5;
  mode: Mode;
  description: string;
  imageBase64: string | null;
  imageMimeType: string | null;
  imageNotes: string;
  name: string;
  display_name: string;
  slots: SlotRole[];
  category: string;
  description_short: string;
  best_for: string;
  textual_markers: string[];
  cardinality_mode: CardinalityMode;
};

const STORAGE_KEY = "krobar_template_wizard";
const DRAFT_ID_KEY = "krobar_template_current_draft_id";

const CATEGORIES = [
  { id: "process", label: "Process", desc: "Étapes successives." },
  { id: "comparison", label: "Comparison", desc: "Deux ou plusieurs entités confrontées." },
  { id: "hierarchy", label: "Hierarchy", desc: "Organisation arborescente." },
  { id: "matrix", label: "Matrix", desc: "Croisement de deux axes." },
  { id: "network", label: "Network", desc: "Réseau de relations." },
  { id: "timeline", label: "Timeline", desc: "Chronologie." },
  { id: "concept", label: "Concept", desc: "Concept central rayonnant ou constellation." },
];

const initialState: WizardState = {
  step: 1,
  mode: "description",
  description: "",
  imageBase64: null,
  imageMimeType: null,
  imageNotes: "",
  name: "",
  display_name: "",
  slots: [
    { id: "title", label: "Titre central", type: "unique", placement: "" },
    { id: "item", label: "Item (un par occurrence)", type: "repeated", min: 3, max: 6, placement: "" },
  ],
  category: "concept",
  description_short: "",
  best_for: "",
  textual_markers: [],
  cardinality_mode: "variants",
};

type Action =
  | { type: "PATCH"; patch: Partial<WizardState> }
  | { type: "UPDATE_SLOT"; index: number; patch: Partial<SlotRole> }
  | { type: "ADD_SLOT" }
  | { type: "REMOVE_SLOT"; index: number }
  | { type: "ADD_MARKER"; marker: string }
  | { type: "REMOVE_MARKER"; marker: string }
  | { type: "SET_MARKERS"; markers: string[] }
  | { type: "RESET" }
  | { type: "HYDRATE"; state: WizardState };

function reducer(state: WizardState, action: Action): WizardState {
  switch (action.type) {
    case "PATCH":
      return { ...state, ...action.patch };
    case "UPDATE_SLOT":
      return { ...state, slots: state.slots.map((s, i) => (i === action.index ? { ...s, ...action.patch } : s)) };
    case "ADD_SLOT":
      return {
        ...state,
        slots: [...state.slots, { id: `slot_${state.slots.length + 1}`, label: "Nouveau rôle", type: "unique", placement: "" }],
      };
    case "REMOVE_SLOT":
      return { ...state, slots: state.slots.filter((_, i) => i !== action.index) };
    case "ADD_MARKER":
      if (!action.marker.trim() || state.textual_markers.includes(action.marker.trim())) return state;
      return { ...state, textual_markers: [...state.textual_markers, action.marker.trim()] };
    case "REMOVE_MARKER":
      return { ...state, textual_markers: state.textual_markers.filter((m) => m !== action.marker) };
    case "SET_MARKERS":
      return { ...state, textual_markers: action.markers };
    case "RESET":
      return initialState;
    case "HYDRATE":
      return action.state;
    default:
      return state;
  }
}

const SLUG_RE = /^[a-z][a-z0-9_]{2,40}$/;

const LOADING_MESSAGES = [
  "Analyse du visuel souhaité…",
  "Composition du dessin…",
  "Annotation des emplacements de texte…",
  "Vérification de la conformité…",
];

export default function AdminTemplateAtelierPage() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [generating, setGenerating] = useState(false);
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  const [draft, setDraft] = useState<GenerateResponse | null>(null);
  const [diagnosticVersions, setDiagnosticVersions] = useState<DiagnosticVersion[]>([]);
  const [markerInput, setMarkerInput] = useState("");
  const navigate = useNavigate();

  // Hydrate
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) dispatch({ type: "HYDRATE", state: JSON.parse(raw) });
    } catch { /* noop */ }
  }, []);

  // Persist
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch { /* noop */ }
  }, [state]);

  // Loading messages rotation
  useEffect(() => {
    if (!generating) return;
    const t = setInterval(() => setLoadingMsgIdx((i) => (i + 1) % LOADING_MESSAGES.length), 9000);
    return () => clearInterval(t);
  }, [generating]);

  const patch = useCallback((p: Partial<WizardState>) => dispatch({ type: "PATCH", patch: p }), []);

  const canNext = useMemo(() => {
    switch (state.step) {
      case 1:
        return state.mode === "image" ? !!state.imageBase64 : state.description.trim().length >= 30;
      case 2: {
        if (!SLUG_RE.test(state.name) || !state.display_name.trim()) return false;
        const hasUnique = state.slots.some((s) => s.type === "unique");
        const hasRepeated = state.slots.some((s) => s.type === "repeated");
        if (!hasUnique || !hasRepeated) return false;
        return state.slots.every(
          (s) => s.id && s.label && (s.type === "unique" || ((s.min ?? 0) >= 1 && (s.max ?? 0) >= (s.min ?? 0))),
        );
      }
      case 3:
        return !!state.category && state.description_short.trim().length >= 10;
      case 4:
        return !!state.cardinality_mode;
      default:
        return false;
    }
  }, [state]);

  const handleFile = useCallback(
    (file: File) => {
      if (file.size > 4 * 1024 * 1024) {
        toast.error("Image trop grande (max 4 Mo).");
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        const base64 = dataUrl.split(",")[1] ?? "";
        patch({ imageBase64: base64, imageMimeType: file.type, mode: state.description ? "both" : "image" });
      };
      reader.readAsDataURL(file);
    },
    [patch, state.description],
  );

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setLoadingMsgIdx(0);
    try {
      const payload: GeneratePayload = {
        mode: state.mode,
        description: state.description || undefined,
        image_base64: state.imageBase64 || undefined,
        image_mime_type: state.imageMimeType || undefined,
        name: state.name,
        display_name: state.display_name,
        slots: state.slots,
        category: state.category,
        description_short: state.description_short,
        best_for: state.best_for || undefined,
        textual_markers_seed: state.description || state.description_short,
        cardinality_mode: state.cardinality_mode,
      };
      const result = await templateCreatorApi.generate(payload);
      setDraft(result);
      sessionStorage.setItem(DRAFT_ID_KEY, result.draft_id);
      if (result.intermediate_steps) {
        setDiagnosticVersions((prev) => [
          ...prev,
          {
            id: `${result.draft_id}-${prev.length + 1}`,
            label: `v${prev.length + 1}`,
            createdAt: Date.now(),
            steps: result.intermediate_steps!,
          },
        ]);
      }
      // Suggérer marqueurs s'il n'y en a pas encore
      if (state.textual_markers.length === 0 && result.suggested_markers.length) {
        dispatch({ type: "SET_MARKERS", markers: result.suggested_markers });
      }
      toast.success("Template généré.");
      result.warnings?.forEach((w) => toast.warning(w));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de la génération.");
    } finally {
      setGenerating(false);
    }
  }, [state]);

  const reset = () => {
    dispatch({ type: "RESET" });
    setDraft(null);
    setDiagnosticVersions([]);
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(DRAFT_ID_KEY);
  };

  const hasDiagnostic = diagnosticVersions.length > 0;

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background">
        <div className="border-b">
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button asChild variant="ghost" size="sm">
                <Link to="/admin"><ArrowLeft className="w-4 h-4" /> Retour</Link>
              </Button>
              <h1 className="text-xl font-semibold">Atelier de création de templates</h1>
              {templateCreatorApi.isMockMode() && (
                <Badge variant="outline" className="text-xs">Mode mock</Badge>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link to="/admin/templates/new">Upload direct (SVG/PNG)</Link>
              </Button>
              <Button variant="ghost" size="sm" onClick={reset}>Recommencer</Button>
            </div>
          </div>
          <div className="max-w-7xl mx-auto px-6 pb-3">
            <Stepper step={state.step} />
          </div>
        </div>

        <div className="max-w-7xl mx-auto p-6 grid lg:grid-cols-2 gap-6">
          {/* COLONNE GAUCHE — wizard */}
          <div className="space-y-4">
            {state.step === 1 && <Step1 state={state} patch={patch} onFile={handleFile} />}
            {state.step === 2 && <Step2 state={state} dispatch={dispatch} patch={patch} />}
            {state.step === 3 && (
              <Step3
                state={state}
                patch={patch}
                markerInput={markerInput}
                setMarkerInput={setMarkerInput}
                addMarker={(m) => dispatch({ type: "ADD_MARKER", marker: m })}
                removeMarker={(m) => dispatch({ type: "REMOVE_MARKER", marker: m })}
              />
            )}
            {state.step === 4 && <Step4 state={state} patch={patch} />}
            {state.step === 5 && <Step5 state={state} onGenerate={handleGenerate} generating={generating} loadingMsg={LOADING_MESSAGES[loadingMsgIdx]} draft={draft} />}

            <div className="flex items-center justify-between pt-2">
              <Button
                variant="outline"
                disabled={state.step === 1 || generating}
                onClick={() => patch({ step: (state.step - 1) as WizardState["step"] })}
              >
                <ArrowLeft className="w-4 h-4" /> Précédent
              </Button>
              {state.step < 5 ? (
                <Button disabled={!canNext} onClick={() => patch({ step: (state.step + 1) as WizardState["step"] })}>
                  Étape suivante <ArrowRight className="w-4 h-4" />
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">Édition (test/affiner/déployer) à venir</span>
              )}
            </div>
          </div>

          {/* COLONNE DROITE — aperçu / diagnostic */}
          <div>
            <Card className="p-4 sticky top-6">
              <Tabs defaultValue="preview">
                <div className="flex items-center justify-between mb-3">
                  <TabsList>
                    <TabsTrigger value="preview">Aperçu</TabsTrigger>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <TabsTrigger value="diagnostic" disabled={!hasDiagnostic}>
                            Diagnostic
                          </TabsTrigger>
                        </span>
                      </TooltipTrigger>
                      {!hasDiagnostic && (
                        <TooltipContent>Disponible après la première génération.</TooltipContent>
                      )}
                    </Tooltip>
                  </TabsList>
                  {draft && <Badge variant="secondary" className="text-xs">draft {draft.draft_id.slice(-6)}</Badge>}
                </div>

                <TabsContent value="preview">
                  <div className="bg-muted/30 rounded-md aspect-[6/5] flex items-center justify-center overflow-hidden border">
                    {generating ? (
                      <div className="text-center space-y-3 p-6">
                        <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
                        <p className="text-sm text-muted-foreground">{LOADING_MESSAGES[loadingMsgIdx]}</p>
                        <p className="text-xs text-muted-foreground">L'IA dessine ton template, ça peut prendre 30 à 90 secondes…</p>
                      </div>
                    ) : draft ? (
                      <KrobarSvg svg={draft.svg} className="w-full h-full p-4" />
                    ) : (
                      <div className="text-center text-muted-foreground text-sm p-6">
                        <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-40" />
                        L'aperçu apparaîtra après génération à l'étape 5.
                      </div>
                    )}
                  </div>
                  {draft?.variants && draft.variants.length > 1 && (
                    <div className="mt-3">
                      <p className="text-xs text-muted-foreground mb-2">Variantes générées ({draft.variants.length}) :</p>
                      <div className="flex gap-2 flex-wrap">
                        {draft.variants.map((v) => (
                          <Badge key={v.cardinality} variant="outline">cardinalité {v.cardinality}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="diagnostic">
                  {hasDiagnostic ? (
                    <DiagnosticPanel versions={diagnosticVersions} />
                  ) : (
                    <div className="text-sm text-muted-foreground border rounded-md p-6 text-center">
                      Les étapes intermédiaires ne sont pas disponibles pour cette génération
                      (mode mock ou option désactivée côté backend).
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </Card>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

/* ---------- Sub-components ---------- */

function Stepper({ step }: { step: number }) {
  const labels = ["Description", "Slots", "Matching", "Cardinalité", "Génération"];
  return (
    <div className="flex items-center gap-2 text-xs">
      {labels.map((l, i) => {
        const n = i + 1;
        const active = n === step;
        const done = n < step;
        return (
          <div key={l} className="flex items-center gap-2">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold border ${
                active ? "bg-primary text-primary-foreground border-primary" : done ? "bg-primary/20 text-primary border-primary/40" : "bg-muted text-muted-foreground"
              }`}
            >
              {n}
            </div>
            <span className={active ? "font-medium" : "text-muted-foreground"}>{l}</span>
            {n < labels.length && <div className="w-8 h-px bg-border" />}
          </div>
        );
      })}
    </div>
  );
}

function Step1({ state, patch, onFile }: { state: WizardState; patch: (p: Partial<WizardState>) => void; onFile: (f: File) => void }) {
  return (
    <Card className="p-5 space-y-4">
      <div>
        <h2 className="font-semibold mb-1">Étape 1 — Décris le visuel</h2>
        <p className="text-sm text-muted-foreground">Description écrite, image de référence, ou les deux.</p>
      </div>
      <Tabs value={state.mode === "image" ? "image" : "description"} onValueChange={(v) => patch({ mode: v as Mode })}>
        <TabsList>
          <TabsTrigger value="description"><FileText className="w-4 h-4" /> Description</TabsTrigger>
          <TabsTrigger value="image"><ImageIcon className="w-4 h-4" /> Image de référence</TabsTrigger>
        </TabsList>
        <TabsContent value="description" className="space-y-2 pt-3">
          <Textarea
            rows={8}
            value={state.description}
            onChange={(e) => patch({ description: e.target.value })}
            placeholder="Décris le visuel comme si tu le racontais à un illustrateur. Ex : un pot de fleurs en terre cuite vu de face, avec une grande fleur qui en sort, au centre une étamine ronde, autour plusieurs pétales arrondis disposés en couronne. Style illustration éditoriale aux lignes nettes."
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{state.description.length} / 1000 caractères (cible 200-1000)</span>
            <span>Min. 30 caractères pour passer à l'étape suivante.</span>
          </div>
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Conseils pour bien décrire</summary>
            <ul className="list-disc pl-5 mt-2 space-y-1 text-muted-foreground">
              <li>Mentionne les formes principales (pot, fleur, train, etc.)</li>
              <li>Précise la composition (centré, aligné, dispersé)</li>
              <li>Indique le style (illustration épurée, esquisse, plat, etc.)</li>
              <li>Décris les éléments où le texte se logera</li>
            </ul>
          </details>
        </TabsContent>
        <TabsContent value="image" className="space-y-3 pt-3">
          {state.imageBase64 ? (
            <div className="flex items-start gap-3">
              <img
                src={`data:${state.imageMimeType};base64,${state.imageBase64}`}
                alt="Référence"
                className="w-32 h-32 object-cover rounded border"
              />
              <Button variant="outline" size="sm" onClick={() => patch({ imageBase64: null, imageMimeType: null })}>
                <X className="w-4 h-4" /> Retirer
              </Button>
            </div>
          ) : (
            <label className="block border-2 border-dashed rounded-md p-8 text-center cursor-pointer hover:bg-muted/30">
              <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm">Glisse une image ici ou clique pour sélectionner</p>
              <p className="text-xs text-muted-foreground mt-1">PNG, JPEG, WebP — max 4 Mo</p>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
              />
            </label>
          )}
          <Textarea
            rows={3}
            value={state.imageNotes}
            onChange={(e) => patch({ imageNotes: e.target.value, description: e.target.value })}
            placeholder="Précisions complémentaires (optionnel) : « je veux les mêmes formes mais en plus épuré », « ignore le texte présent dans l'image »…"
          />
        </TabsContent>
      </Tabs>
    </Card>
  );
}

function Step2({
  state,
  dispatch,
  patch,
}: {
  state: WizardState;
  dispatch: React.Dispatch<Action>;
  patch: (p: Partial<WizardState>) => void;
}) {
  return (
    <Card className="p-5 space-y-4">
      <div>
        <h2 className="font-semibold mb-1">Étape 2 — Sémantique des slots</h2>
        <p className="text-sm text-muted-foreground">Où le texte de l'utilisateur final viendra se loger.</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Identifiant du template</Label>
          <Input
            value={state.name}
            onChange={(e) => patch({ name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })}
            placeholder="pot_de_fleurs_petales"
          />
          {state.name && !SLUG_RE.test(state.name) && (
            <p className="text-xs text-destructive">Format : 3-40 caractères, lettres minuscules, chiffres, underscore. Doit commencer par une lettre.</p>
          )}
        </div>
        <div className="space-y-1">
          <Label>Nom affiché</Label>
          <Input value={state.display_name} onChange={(e) => patch({ display_name: e.target.value })} placeholder="Le pot de fleurs" />
        </div>
      </div>

      <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        Ex. pour un pot de fleurs : 1 rôle <em>unique</em> "titre" au centre, 1 rôle <em>répété</em> "pétale" entre 3 et 8 occurrences en couronne.
      </div>

      <div className="space-y-3">
        {state.slots.map((slot, i) => (
          <div key={i} className="border rounded-md p-3 space-y-2 bg-card">
            <div className="flex items-start justify-between gap-2">
              <div className="grid grid-cols-2 gap-2 flex-1">
                <div className="space-y-1">
                  <Label className="text-xs">Identifiant</Label>
                  <Input
                    value={slot.id}
                    onChange={(e) => dispatch({ type: "UPDATE_SLOT", index: i, patch: { id: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") } })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Libellé humain</Label>
                  <Input value={slot.label} onChange={(e) => dispatch({ type: "UPDATE_SLOT", index: i, patch: { label: e.target.value } })} />
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => dispatch({ type: "REMOVE_SLOT", index: i })} disabled={state.slots.length <= 2}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex gap-4">
              <RadioGroup
                value={slot.type}
                onValueChange={(v) => dispatch({ type: "UPDATE_SLOT", index: i, patch: { type: v as "unique" | "repeated" } })}
                className="flex gap-4"
              >
                <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="unique" /> Unique</label>
                <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="repeated" /> Répété</label>
              </RadioGroup>
              {slot.type === "repeated" && (
                <div className="flex items-center gap-2 text-sm">
                  <Label className="text-xs">Min</Label>
                  <Input
                    type="number"
                    min={1}
                    max={12}
                    value={slot.min ?? 3}
                    onChange={(e) => dispatch({ type: "UPDATE_SLOT", index: i, patch: { min: parseInt(e.target.value, 10) || 1 } })}
                    className="w-16"
                  />
                  <Label className="text-xs">Max</Label>
                  <Input
                    type="number"
                    min={1}
                    max={12}
                    value={slot.max ?? 6}
                    onChange={(e) => dispatch({ type: "UPDATE_SLOT", index: i, patch: { max: parseInt(e.target.value, 10) || 1 } })}
                    className="w-16"
                  />
                </div>
              )}
            </div>
            <Input
              placeholder={slot.type === "unique" ? "Emplacement (ex. au centre, en grand)" : "Disposition (ex. un par pétale, en couronne)"}
              value={slot.placement ?? ""}
              onChange={(e) => dispatch({ type: "UPDATE_SLOT", index: i, patch: { placement: e.target.value } })}
            />
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={() => dispatch({ type: "ADD_SLOT" })}>
          <Plus className="w-4 h-4" /> Ajouter un rôle
        </Button>
      </div>
    </Card>
  );
}

function Step3({
  state,
  patch,
  markerInput,
  setMarkerInput,
  addMarker,
  removeMarker,
}: {
  state: WizardState;
  patch: (p: Partial<WizardState>) => void;
  markerInput: string;
  setMarkerInput: (v: string) => void;
  addMarker: (m: string) => void;
  removeMarker: (m: string) => void;
}) {
  return (
    <Card className="p-5 space-y-4">
      <div>
        <h2 className="font-semibold mb-1">Étape 3 — Métadonnées de matching</h2>
        <p className="text-sm text-muted-foreground">Ces infos permettent au pipeline de choisir ton template au bon moment.</p>
      </div>

      <div className="space-y-2">
        <Label>Catégorie</Label>
        <RadioGroup value={state.category} onValueChange={(v) => patch({ category: v })} className="grid grid-cols-2 gap-2">
          {CATEGORIES.map((c) => (
            <Tooltip key={c.id}>
              <TooltipTrigger asChild>
                <label className="flex items-center gap-2 border rounded-md p-2 cursor-pointer hover:bg-muted/30">
                  <RadioGroupItem value={c.id} /> <span className="text-sm">{c.label}</span>
                </label>
              </TooltipTrigger>
              <TooltipContent>{c.desc}</TooltipContent>
            </Tooltip>
          ))}
        </RadioGroup>
      </div>

      <div className="space-y-1">
        <Label>Description courte</Label>
        <Textarea
          rows={2}
          value={state.description_short}
          onChange={(e) => patch({ description_short: e.target.value })}
          placeholder="Représenter un concept central qui se décline en plusieurs facettes."
        />
      </div>

      <div className="space-y-1">
        <Label>Best for (optionnel)</Label>
        <Input value={state.best_for} onChange={(e) => patch({ best_for: e.target.value })} placeholder="Une mission ou une valeur déclinée en piliers." />
      </div>

      <div className="space-y-2">
        <Label>Marqueurs textuels (optionnel mais recommandé)</Label>
        <div className="flex gap-2">
          <Input
            value={markerInput}
            onChange={(e) => setMarkerInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addMarker(markerInput);
                setMarkerInput("");
              }
            }}
            placeholder="Ex. épanouir, rayonner, facettes…"
          />
          <Button variant="outline" onClick={() => { addMarker(markerInput); setMarkerInput(""); }}>Ajouter</Button>
        </div>
        <div className="flex flex-wrap gap-1">
          {state.textual_markers.map((m) => (
            <Badge key={m} variant="secondary" className="gap-1">
              {m}
              <button onClick={() => removeMarker(m)} className="hover:text-destructive">×</button>
            </Badge>
          ))}
          {state.textual_markers.length === 0 && (
            <p className="text-xs text-muted-foreground">L'IA suggérera 5 marqueurs après génération.</p>
          )}
        </div>
      </div>
    </Card>
  );
}

function Step4({ state, patch }: { state: WizardState; patch: (p: Partial<WizardState>) => void }) {
  const repeated = state.slots.find((s) => s.type === "repeated");
  const fixedRange = repeated && repeated.min === repeated.max;

  const cards: { id: CardinalityMode; title: string; desc: string; disabled?: boolean }[] = [
    {
      id: "variants",
      title: "Variantes pré-générées (recommandé)",
      desc: "L'IA génère plusieurs versions du template (une par valeur de cardinalité). Plus prévisible et stable, légèrement plus lourd côté stockage.",
    },
    {
      id: "optional_groups",
      title: "Slot-groups optionnels",
      desc: "L'IA génère une seule version calibrée pour la cardinalité maximale. Les emplacements non utilisés sont masqués au rendu. Plus léger, peut laisser des trous.",
      disabled: fixedRange,
    },
    {
      id: "fixed_decor_pool",
      title: "Décor fixe à pool de slots",
      desc: "L'IA dessine le visuel complet une seule fois et déclare un pool d'emplacements priorisés. Au rendu, seuls ceux nécessaires sont nommés. Idéal pour décors riches (plan de métro, constellation).",
      disabled: fixedRange,
    },
  ];

  return (
    <Card className="p-5 space-y-4">
      <div>
        <h2 className="font-semibold mb-1">Étape 4 — Mode de cardinalité</h2>
        <p className="text-sm text-muted-foreground">Comment l'IA gère les variations du nombre d'items.</p>
      </div>
      <div className="space-y-3">
        {cards.map((c) => (
          <button
            key={c.id}
            type="button"
            disabled={c.disabled}
            onClick={() => !c.disabled && patch({ cardinality_mode: c.id })}
            className={`w-full text-left border rounded-md p-4 transition ${
              state.cardinality_mode === c.id ? "border-primary bg-primary/5" : "hover:bg-muted/30"
            } ${c.disabled ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <div className="font-medium mb-1">{c.title}</div>
            <p className="text-sm text-muted-foreground">{c.desc}</p>
          </button>
        ))}
      </div>
      <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground space-y-1">
        <p><strong>Aide à la décision :</strong></p>
        <p>• Géométrie dense et serrée (couronne, train) → Variantes.</p>
        <p>• Géométrie lâche (mindmap, listes éparses) → Slot-groups optionnels.</p>
        <p>• Décor riche (plan de métro, constellation) → Décor fixe à pool.</p>
      </div>
    </Card>
  );
}

function Step5({
  state,
  onGenerate,
  generating,
  loadingMsg,
  draft,
}: {
  state: WizardState;
  onGenerate: () => void;
  generating: boolean;
  loadingMsg: string;
  draft: GenerateResponse | null;
}) {
  return (
    <Card className="p-5 space-y-4">
      <div>
        <h2 className="font-semibold mb-1">Étape 5 — Récapitulatif et génération</h2>
        <p className="text-sm text-muted-foreground">Vérifie tout puis lance l'IA.</p>
      </div>

      <div className="space-y-3 text-sm">
        <Row label="Nom" value={`${state.display_name} (${state.name})`} />
        <Row label="Catégorie" value={state.category} />
        <Row label="Description courte" value={state.description_short} />
        {state.best_for && <Row label="Best for" value={state.best_for} />}
        <Row
          label="Slots"
          value={
            <div className="space-y-1">
              {state.slots.map((s) => (
                <div key={s.id} className="flex gap-2 items-center">
                  <Badge variant="outline">{s.type === "unique" ? "1" : `${s.min}-${s.max}`}</Badge>
                  <span className="font-mono text-xs">{s.id}</span>
                  <span className="text-muted-foreground">— {s.label}</span>
                </div>
              ))}
            </div>
          }
        />
        <Row label="Mode cardinalité" value={state.cardinality_mode} />
        {state.textual_markers.length > 0 && (
          <Row
            label="Marqueurs"
            value={<div className="flex flex-wrap gap-1">{state.textual_markers.map((m) => <Badge key={m} variant="secondary">{m}</Badge>)}</div>}
          />
        )}
        <Row label="Source" value={state.mode === "image" ? "Image" : state.mode === "both" ? "Description + image" : "Description"} />
      </div>

      <Button onClick={onGenerate} disabled={generating} size="lg" className="w-full">
        {generating ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> {loadingMsg}</>
        ) : draft ? (
          <><Sparkles className="w-4 h-4" /> Régénérer</>
        ) : (
          <><Sparkles className="w-4 h-4" /> Générer le template</>
        )}
      </Button>

      {draft && (
        <div className="border rounded-md p-3 bg-muted/30 text-xs space-y-1">
          <p><strong>Draft ID :</strong> <span className="font-mono">{draft.draft_id}</span></p>
          <p>Mode édition (test, affiner, déployer) — disponible dans une prochaine itération.</p>
          {/* TODO Eric : brancher zones Test / Affiner / Déployer une fois l'API backend prête */}
        </div>
      )}
    </Card>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3">
      <span className="text-muted-foreground">{label}</span>
      <div>{value}</div>
    </div>
  );
}
