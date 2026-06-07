import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { toast } from "sonner";
import {
  ArrowLeft, Loader2, Copy, Check, X, Upload as UploadIcon, AlertTriangle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import StructuralSketch from "@/components/admin/studio/StructuralSketch";
import ZoomableSvg from "@/components/admin/studio/ZoomableSvg";
import PlaceholdersEditor from "@/components/admin/studio/PlaceholdersEditor";
import {
  studioV2Api,
  type CoverageCell,
  type CoverageResponse,
  type GeneratePromptResponse,
  type CharteResponse,
  type Moteur,
  type VectorizeResponse,
  type PlaceZonesResponse,
  type ZonePair,
  FAMILY_ORDER,
  FAMILY_LABEL,
  CARDINALITY_ORDER,
  REGIME_ORDER,
  byRegistreSummary,
  MAX_VECTORIZE_BYTES,
} from "@/lib/studioV2Api";

const SPORTS_LABEL: Record<string, string> = {
  ATHLE: "Athlétisme", BASKET: "Basket", BOXE: "Boxe", FOOT: "Foot",
  HAND: "Hand", JUDO: "Judo", NATATION: "Natation", RUGBY: "Rugby",
  TENNIS: "Tennis", VELO: "Vélo", VOILE: "Voile", VOLLEY: "Volley",
};
const DOMAIN_LABEL: Record<string, string> = {
  ARC: "Architecture", BOD: "Corps", BUS: "Business", COM: "Communication",
  MEC: "Mécanique", NAT: "Nature", SPO: "Sport",
};

type Registre = "domain" | "etat" | "conflit" | "sport";

type ProductionState = {
  cell: CoverageCell;
  registre: Registre;
  selecteur: string | null;     // domain code, sport key, or null for etat/conflit
};

const STUDIO_V2_ACTIVE_KEY = "krobar-studio-v2-active";

function loadActive(): ProductionState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STUDIO_V2_ACTIVE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (p && p.cell && typeof p.cell.index === "string") return p as ProductionState;
  } catch { /* ignore */ }
  return null;
}

export default function AdminStudioV2Page() {
  const [coverage, setCoverage] = useState<CoverageResponse | null>(null);
  const [loadingCoverage, setLoadingCoverage] = useState(true);
  const [coverageError, setCoverageError] = useState<string | null>(null);
  const [active, setActiveState] = useState<ProductionState | null>(() => loadActive());

  const setActive = (s: ProductionState | null) => {
    setActiveState(s);
    try {
      if (s) localStorage.setItem(STUDIO_V2_ACTIVE_KEY, JSON.stringify(s));
      else localStorage.removeItem(STUDIO_V2_ACTIVE_KEY);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    let cancel = false;
    setLoadingCoverage(true);
    studioV2Api
      .coverage()
      .then((r) => { if (!cancel) { setCoverage(r); setCoverageError(null); } })
      .catch((e) => { if (!cancel) setCoverageError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!cancel) setLoadingCoverage(false); });
    return () => { cancel = true; };
  }, []);


  // Sort cells by family > cardinality > regime
  const groupedCells = useMemo(() => {
    if (!coverage) return new Map<string, CoverageCell[]>();
    const m = new Map<string, CoverageCell[]>();
    for (const fam of FAMILY_ORDER) m.set(fam, []);
    for (const c of coverage.cells) {
      const arr = m.get(c.family as string) ?? [];
      arr.push(c);
      m.set(c.family as string, arr);
    }
    const cardIdx = (c: string) => CARDINALITY_ORDER.indexOf(c);
    const regIdx = (r: string) => REGIME_ORDER.indexOf(r);
    for (const arr of m.values()) {
      arr.sort((a, b) => {
        const c = cardIdx(a.cardinality) - cardIdx(b.cardinality);
        if (c !== 0) return c;
        const r = regIdx(a.regime) - regIdx(b.regime);
        if (r !== 0) return r;
        return a.index.localeCompare(b.index);
      });
    }
    return m;
  }, [coverage]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Helmet>
        <title>Studio Krobar — Production figurative SICAI</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      {/* Top bar */}
      <header className="border-b bg-card sticky top-0 z-20">
        <div className="px-4 md:px-6 py-3 flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to="/admin"><ArrowLeft className="w-4 h-4 mr-1" /> Admin</Link>
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold">Studio Krobar</h1>
            <p className="text-xs text-muted-foreground">
              Production des illustrations figuratives, cellule par cellule
            </p>
          </div>
          {active && (
            <Button variant="outline" size="sm" onClick={() => setActive(null)}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Retour à la grille
            </Button>
          )}
        </div>
      </header>

      <main className="w-full px-4 md:px-6 py-6">
        {!active && (
          <CoverageScreen
            loading={loadingCoverage}
            error={coverageError}
            coverage={coverage}
            groupedCells={groupedCells}
            onPick={(cell) =>
              setActive({ cell, registre: pickDefaultRegistre(cell), selecteur: pickDefaultSelecteur(cell) })
            }
          />
        )}
        {active && (
          <ProductionScreen
            state={active}
            onChange={setActive}
            onBack={() => setActive(null)}
          />
        )}
      </main>
    </div>
  );
}

function pickDefaultRegistre(c: CoverageCell): Registre {
  const s = byRegistreSummary(c);
  if (s.domains.length > 0) return "domain";
  if (s.sport.length > 0) return "sport";
  if (s.hasEtat) return "etat";
  if (s.hasConflit) return "conflit";
  return "domain";
}
function pickDefaultSelecteur(c: CoverageCell): string | null {
  const s = byRegistreSummary(c);
  if (s.domains.length > 0) return s.domains[0];
  if (s.sport.length > 0) return s.sport[0];
  return null;
}

/* ────────────────────────────────  ÉCRAN A  ──────────────────────────────── */

function CoverageScreen(props: {
  loading: boolean;
  error: string | null;
  coverage: CoverageResponse | null;
  groupedCells: Map<string, CoverageCell[]>;
  onPick: (c: CoverageCell) => void;
}) {
  const { loading, error, coverage, groupedCells, onPick } = props;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32 text-muted-foreground">
        <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Chargement de la grille de complétude…
      </div>
    );
  }
  if (error) {
    return (
      <Card className="p-6 border-destructive/50">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive mt-0.5" />
          <div>
            <p className="font-medium">Impossible de charger la grille SICAI</p>
            <p className="text-sm text-muted-foreground mt-1">{error}</p>
          </div>
        </div>
      </Card>
    );
  }
  if (!coverage) return null;

  const { summary } = coverage;
  const pct = summary.figurative_cells_total > 0
    ? (summary.figurative_cells_touched / summary.figurative_cells_total) * 100
    : 0;

  return (
    <div className="space-y-6">
      {/* Summary bar */}
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-2 mb-3">
          <div>
            <div className="text-2xl font-semibold">
              {summary.figurative_cells_touched} / {summary.figurative_cells_total}
              <span className="text-base font-normal text-muted-foreground ml-2">cellules couvertes</span>
            </div>
          </div>
          <div className="text-sm text-muted-foreground">
            {summary.total_incarnations} incarnations · {summary.figurative_cells_untouched} cellule(s) à couvrir
          </div>
        </div>
        <Progress value={pct} className="h-2" />
      </Card>

      {/* Grid by family */}
      {FAMILY_ORDER.map((fam) => {
        const cells = groupedCells.get(fam) ?? [];
        if (cells.length === 0) return null;
        const touched = cells.filter((c) => c.covered && c.plausibility !== "X").length;
        const plausible = cells.filter((c) => c.plausibility !== "X").length;
        return (
          <section key={fam}>
            <div className="flex items-baseline gap-3 mb-3">
              <h2 className="text-base font-semibold uppercase tracking-wider">
                {FAMILY_LABEL[fam] ?? fam}
              </h2>
              <span className="text-xs text-muted-foreground">
                {touched} / {plausible} couvertes
              </span>
            </div>
            <div className="grid gap-3"
                 style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
              {cells.map((c) => (
                <CellCard key={c.index} cell={c} onPick={onPick} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function CellCard({ cell, onPick }: { cell: CoverageCell; onPick: (c: CoverageCell) => void }) {
  const implausible = cell.plausibility === "X";
  const covered = cell.covered;
  const s = byRegistreSummary(cell);

  return (
    <button
      type="button"
      disabled={implausible}
      onClick={() => onPick(cell)}
      className={[
        "text-left rounded-md border bg-card p-3 transition-all",
        implausible
          ? "opacity-40 cursor-not-allowed line-through"
          : "hover:shadow-md hover:border-primary/50 cursor-pointer",
        covered && !implausible ? "border-emerald-500/40" : "",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <StructuralSketch
          family={cell.family as string}
          cardinality={cell.cardinality as string}
          regime={cell.regime as string}
          size={64}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold">{cell.index}</span>
            {covered ? (
              <Check className="w-4 h-4 text-emerald-600" />
            ) : !implausible ? (
              <span className="text-xs text-muted-foreground">à produire</span>
            ) : null}
            {cell.plausibility === "R" && (
              <Badge variant="outline" className="text-[10px] py-0 px-1">rare</Badge>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground truncate" title={cell.sicai_code}>
            {cell.sicai_code}
          </div>
          <div className="text-xs mt-1">
            <span className="text-muted-foreground">{cell.incarnations} incarnation(s)</span>
          </div>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {s.domains.slice(0, 6).map((d) => (
          <Badge key={d} variant="secondary" className="text-[10px] py-0 px-1.5">{d}</Badge>
        ))}
        {s.hasEtat && <Badge variant="outline" className="text-[10px] py-0 px-1.5">ÉTAT</Badge>}
        {s.hasConflit && <Badge variant="outline" className="text-[10px] py-0 px-1.5">CONFLIT</Badge>}
        {s.sport.slice(0, 4).map((sp) => (
          <Badge key={sp} className="text-[10px] py-0 px-1.5 bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30">
            {SPORTS_LABEL[sp] ?? sp}
          </Badge>
        ))}
      </div>
    </button>
  );
}

/* ────────────────────────────────  ÉCRAN B  ──────────────────────────────── */

function ProductionScreen({
  state,
  onChange,
  onBack,
}: {
  state: ProductionState;
  onChange: (s: ProductionState) => void;
  onBack: () => void;
}) {
  const { cell, registre, selecteur } = state;
  const s = byRegistreSummary(cell);

  const persistKey = `krobar-studio-v2-prod:${cell.index}|${registre}|${selecteur ?? ""}`;
  type Persisted = {
    moteur: Moteur;
    gpt2Style: string | null;
    promptRes: GeneratePromptResponse | null;
    vectRes: VectorizeResponse | null;
    validated: boolean;
  };
  const loadPersisted = (): Persisted | null => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(persistKey);
      return raw ? (JSON.parse(raw) as Persisted) : null;
    } catch { return null; }
  };
  const initial = loadPersisted();

  const [moteur, setMoteur] = useState<Moteur>(initial?.moteur ?? "midjourney");
  const [gpt2Style, setGpt2Style] = useState<string | null>(initial?.gpt2Style ?? null);
  const [charte, setCharte] = useState<CharteResponse | null>(null);
  const [promptRes, setPromptRes] = useState<GeneratePromptResponse | null>(initial?.promptRes ?? null);
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);

  const [vectRes, setVectRes] = useState<VectorizeResponse | null>(initial?.vectRes ?? null);
  const [vectLoading, setVectLoading] = useState(false);
  const [vectError, setVectError] = useState<string | null>(null);
  const [validated, setValidated] = useState<boolean>(initial?.validated ?? false);
  const [sizeInfo, setSizeInfo] = useState<{ before: number; after: number } | null>(null);
  const [placement, setPlacement] = useState<PlaceZonesResponse | null>(null);
  const [editedZones, setEditedZones] = useState<Record<string, ZonePair[]>>({});
  const [placeholdersValidated, setPlaceholdersValidated] = useState<boolean>(false);
  const [placementsMode, setPlacementsMode] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load charte once
  useEffect(() => {
    let cancel = false;
    studioV2Api.charte()
      .then((c) => { if (!cancel) setCharte(c); })
      .catch(() => { /* silent — selector just won't show styles */ });
    return () => { cancel = true; };
  }, []);

  // Hydrate from storage when cell/registre/selecteur changes (e.g. user switches incarnation)
  useEffect(() => {
    const p = loadPersisted();
    setPromptRes(p?.promptRes ?? null);
    setPromptError(null);
    setVectRes(p?.vectRes ?? null);
    setVectError(null);
    setValidated(p?.validated ?? false);
    setMoteur(p?.moteur ?? "midjourney");
    setGpt2Style(p?.gpt2Style ?? null);
    setPlacement(null);
    setEditedZones({});
    setPlaceholdersValidated(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cell.index, registre, selecteur]);

  // Persist whenever a meaningful piece changes
  useEffect(() => {
    try {
      localStorage.setItem(
        persistKey,
        JSON.stringify({
          moteur, gpt2Style, promptRes, vectRes, validated,
        } satisfies Persisted),
      );
    } catch { /* ignore quota */ }
  }, [persistKey, moteur, gpt2Style, promptRes, vectRes, validated]);



  const gpt2Styles = charte?.moteurs?.["gpt-image-2"]?.styles;
  const gpt2Default = charte?.moteurs?.["gpt-image-2"]?.style_default;

  const generatePrompt = async () => {
    setPromptLoading(true); setPromptError(null);
    try {
      const r = await studioV2Api.generatePrompt({
        index: cell.index,
        registre,
        selecteur,
        moteur,
        ...(moteur === "gpt-image-2" ? { style: gpt2Style ?? gpt2Default ?? undefined } : {}),
      });
      setPromptRes(r);
    } catch (e) {
      setPromptError(e instanceof Error ? e.message : String(e));
    } finally {
      setPromptLoading(false);
    }
  };

  const handleFile = async (file: File) => {
    setVectLoading(true); setVectError(null); setValidated(false); setVectRes(null); setSizeInfo(null);
    setPlacement(null); setEditedZones({}); setPlaceholdersValidated(false);
    try {
      const compressed = await compressImage(file);
      setSizeInfo({ before: file.size, after: compressed.size });
      // Garde-fou : base64 ~= taille * 1.37 ; si > ~2.5 Mo on refuse
      if (compressed.size > 2.5 * 1024 * 1024) {
        throw new Error(
          `Image trop volumineuse après compression (${(compressed.size / 1024 / 1024).toFixed(2)} Mo). Limite : 2.5 Mo.`
        );
      }
      const r = await studioV2Api.vectorize(compressed);
      setVectRes(r);
    } catch (e) {
      setVectError(e instanceof Error ? e.message : String(e));
    } finally {
      setVectLoading(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const setRegistre = (r: Registre, sel: string | null) =>
    onChange({ ...state, registre: r, selecteur: sel });

  const cardinalityMax = useMemo(() => {
    const m = cell.index.match(/-(\d)-/);
    return m ? parseInt(m[1], 10) : 1;
  }, [cell.index]);

  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-xl font-semibold">{cell.index}</span>
        <span className="text-sm text-muted-foreground">{cell.sicai_code}</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        {/* LEFT — incarnation */}
        <Card className="p-4 lg:col-span-3 space-y-4 min-w-0 overflow-hidden">

          <h3 className="text-sm font-semibold uppercase tracking-wider">Incarnation</h3>

          {s.domains.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Domaines</p>
              <div className="flex flex-wrap gap-1">
                {s.domains.map((d) => (
                  <button
                    key={d}
                    onClick={() => setRegistre("domain", d)}
                    className={[
                      "px-2 py-1 text-xs rounded border",
                      registre === "domain" && selecteur === d
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background hover:bg-muted",
                    ].join(" ")}
                    title={DOMAIN_LABEL[d] ?? d}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          )}

          {s.sport.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Sport</p>
              <div className="flex flex-wrap gap-1">
                {s.sport.map((sp) => (
                  <button
                    key={sp}
                    onClick={() => setRegistre("sport", sp)}
                    className={[
                      "px-2 py-1 text-xs rounded border",
                      registre === "sport" && selecteur === sp
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background hover:bg-muted",
                    ].join(" ")}
                  >
                    {SPORTS_LABEL[sp] ?? sp}
                  </button>
                ))}
              </div>
            </div>
          )}

          {(s.hasEtat || s.hasConflit) && (
            <div className="flex gap-2">
              {s.hasEtat && (
                <button
                  onClick={() => setRegistre("etat", null)}
                  className={[
                    "px-2 py-1 text-xs rounded border",
                    registre === "etat"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background hover:bg-muted",
                  ].join(" ")}
                >ÉTAT</button>
              )}
              {s.hasConflit && (
                <button
                  onClick={() => setRegistre("conflit", null)}
                  className={[
                    "px-2 py-1 text-xs rounded border",
                    registre === "conflit"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background hover:bg-muted",
                  ].join(" ")}
                >CONFLIT</button>
              )}
            </div>
          )}

          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground mb-2">Aperçu structurel</p>
            <div className="flex justify-center">
              <StructuralSketch
                family={cell.family as string}
                cardinality={cell.cardinality as string}
                regime={cell.regime as string}
                size={120}
              />
            </div>
            <p className="text-[11px] text-muted-foreground mt-2 text-center">
              {FAMILY_LABEL[cell.family as string] ?? cell.family} ·{" "}
              {cell.cardinality} · {cell.regime}
            </p>
          </div>

          {promptRes?.incarnation_source && (
            <div className="pt-2 border-t min-w-0">
              <p className="text-xs text-muted-foreground mb-1">Texte d'incarnation</p>
              <p className="text-sm leading-snug break-words [overflow-wrap:anywhere] whitespace-pre-wrap">
                {promptRes.incarnation_source}
              </p>
            </div>
          )}

        </Card>

        {/* CENTER — visual + prompt */}
        <div className="lg:col-span-6 space-y-4">
          {/* Visual area: 3:2 ratio when empty/zoom, or placement editor when validated */}
          <Card className="p-4">
            {validated && vectRes && vectRes.viewbox ? (
              <PlaceholdersEditor
                svg={vectRes.svg}
                viewbox={vectRes.viewbox}
                occupancy={vectRes.occupancy}
                cardinalityMax={cardinalityMax}
                placement={placement}
                editedZones={editedZones}
                onPlacementLoaded={(p) => { setPlacement(p); setEditedZones({}); }}
                onEditedChange={setEditedZones}
                onValidate={() => { setPlaceholdersValidated(true); toast.success("Placeholders validés"); }}
                validated={placeholdersValidated}
              />
            ) : (
              <div
                className="relative w-full bg-muted/30 border rounded-md overflow-hidden flex items-center justify-center"
                style={{ aspectRatio: "3 / 2" }}
              >
                {vectLoading && (
                  <div className="text-muted-foreground flex items-center">
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Vectorisation…
                  </div>
                )}
                {!vectLoading && vectRes && (
                  <ZoomableSvg svg={vectRes.svg} />
                )}
                {!vectLoading && !vectRes && (
                  <div className="text-center text-muted-foreground px-6">
                    <StructuralSketch
                      family={cell.family as string}
                      cardinality={cell.cardinality as string}
                      regime={cell.regime as string}
                      size={140}
                      showBadge={false}
                    />
                    <p className="text-sm mt-3">
                      Aucune illustration pour l'instant.
                    </p>
                    <p className="text-xs mt-1">
                      Générez le prompt, créez l'image, puis importez-la pour vectoriser.
                    </p>
                  </div>
                )}
              </div>
            )}
          </Card>


          {/* Prompt */}
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider">Prompt</h3>
              <Tabs value={moteur} onValueChange={(v) => setMoteur(v as Moteur)}>
                <TabsList>
                  <TabsTrigger value="midjourney">Midjourney</TabsTrigger>
                  <TabsTrigger value="gpt-image-2">GPT-image-2</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {moteur === "gpt-image-2" && gpt2Styles && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Style</span>
                <Select
                  value={gpt2Style ?? gpt2Default ?? ""}
                  onValueChange={(v) => setGpt2Style(v)}
                >
                  <SelectTrigger className="w-[160px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(gpt2Styles).map(([key, s]) => (
                      <SelectItem key={key} value={key}>
                        {(s as { label: string }).label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <Button onClick={generatePrompt} disabled={promptLoading} className="w-full sm:w-auto">
              {promptLoading
                ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Génération…</>)
                : "Générer le prompt"}
            </Button>

            {promptError && (
              <p className="text-sm text-destructive">{promptError}</p>
            )}

            {promptRes && (
              <div className="space-y-2">
                <textarea
                  readOnly
                  value={promptRes.prompt}
                  className="w-full min-h-[140px] font-mono text-xs p-3 rounded-md border bg-muted/30 resize-y"
                />
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      await navigator.clipboard.writeText(promptRes.prompt);
                      toast.success("Prompt copié");
                    }}
                  >
                    <Copy className="w-4 h-4 mr-1" /> Copier
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Charte v{promptRes.charte_version} · {promptRes.meta.cote}
                    {promptRes.style && (
                      <span className="ml-2">
                        Style : {gpt2Styles?.[promptRes.style]?.label ?? promptRes.style}
                      </span>
                    )}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Copiez ce prompt, générez l'image dans{" "}
                  {moteur === "midjourney" ? "Midjourney" : "ChatGPT"}, puis revenez l'importer ci-dessous.
                </p>
              </div>
            )}
          </Card>
        </div>

        {/* RIGHT — upload + metrics */}
        <Card className="p-4 lg:col-span-3 space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider">Import & vectorisation</h3>

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed rounded-md p-6 text-center cursor-pointer hover:bg-muted/40 transition-colors"
          >
            <UploadIcon className="w-6 h-6 mx-auto text-muted-foreground" />
            <p className="text-sm mt-2">Déposer ou cliquer</p>
            <p className="text-xs text-muted-foreground mt-1">PNG / JPEG, max 5 Mo</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />

          {sizeInfo && (
            <p className="text-xs text-muted-foreground">
              Compression : {formatBytes(sizeInfo.before)} → {formatBytes(sizeInfo.after)}
            </p>
          )}

          {vectError && (
            <p className="text-sm text-destructive">{vectError}</p>
          )}

          {vectRes && (
            <div className="space-y-2 pt-2 border-t">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Verdict</span>
                <VerdictBadge verdict={vectRes.metrics.verdict} />
              </div>
              <ul className="text-xs space-y-0.5 text-muted-foreground">
                <li>Densité d'encre : {vectRes.metrics.ink_density_pct.toFixed(2)} %</li>
                <li>Ombres retirées : {vectRes.metrics.shadow_blobs_removed}</li>
                <li>Format : {vectRes.metrics.cropped_size[0]} × {vectRes.metrics.cropped_size[1]}</li>
              </ul>

              {!validated && (
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    onClick={() => { setValidated(true); toast.success("Vectorisation validée"); }}
                  >
                    <Check className="w-4 h-4 mr-1" /> Valider
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setVectRes(null); setValidated(false); }}
                  >
                    <X className="w-4 h-4 mr-1" /> Rejeter
                  </Button>
                </div>
              )}

              {validated && (
                <div className="rounded-md border bg-emerald-500/10 border-emerald-500/30 p-3 text-xs">
                  <p className="font-medium text-emerald-700 dark:text-emerald-300">
                    Vectorisation validée
                  </p>
                  <p className="text-muted-foreground mt-1">
                    Pose des placeholders disponible dans la zone centrale.
                  </p>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function VerdictBadge({ verdict }: { verdict: VectorizeResponse["metrics"]["verdict"] }) {
  if (verdict === "clean")
    return <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">clean</Badge>;
  if (verdict === "acceptable")
    return <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">acceptable</Badge>;
  return <Badge className="bg-destructive/15 text-destructive border border-destructive/30">charcoal_suspect</Badge>;
}

async function compressImage(file: File, maxWidth = 1600, quality = 0.85): Promise<File> {
  const dataUrl: string = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("Image illisible"));
    i.src = dataUrl;
  });
  const scale = img.width > maxWidth ? maxWidth / img.width : 1;
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponible");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Compression échouée"))),
      "image/jpeg",
      quality
    );
  });
  const name = file.name.replace(/\.(png|jpe?g|webp)$/i, "") + ".jpg";
  return new File([blob], name, { type: "image/jpeg" });
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} Ko`;
  return `${(n / 1024 / 1024).toFixed(2)} Mo`;
}
