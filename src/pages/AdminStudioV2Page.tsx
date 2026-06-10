import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { toast } from "sonner";
import {
  ArrowLeft, Loader2, Copy, Check, X, Upload as UploadIcon, AlertTriangle, Eraser,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import TemplatesGallery from "@/components/admin/studio/TemplatesGallery";
import SvgEraserDialog from "@/components/admin/studio/SvgEraserDialog";
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
  ARC: "Architecture", BUS: "Business", COM: "Communication",
  MEC: "Mécanique", NAT: "Nature",
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
          <Tabs defaultValue="production" className="space-y-4">
            <TabsList>
              <TabsTrigger value="production">Production</TabsTrigger>
              <TabsTrigger value="library">Bibliothèque</TabsTrigger>
            </TabsList>
            <TabsContent value="production" className="mt-0">
              <CoverageScreen
                loading={loadingCoverage}
                error={coverageError}
                coverage={coverage}
                groupedCells={groupedCells}
                onPick={(cell) =>
                  setActive({ cell, registre: pickDefaultRegistre(cell), selecteur: pickDefaultSelecteur(cell) })
                }
              />
            </TabsContent>
            <TabsContent value="library" className="mt-0">
              <TemplatesGallery />
            </TabsContent>
          </Tabs>
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
  const prod = cell.production;
  const byDomain = prod?.by_domain ?? {};
  const domainKeys = Object.keys(byDomain).filter((d) => d !== "_none");
  const producedDomains = domainKeys.filter((d) => byDomain[d]?.canonical_done).length;
  const cellProduced = prod?.cell_produced === true;

  return (
    <button
      type="button"
      disabled={implausible}
      onClick={() => onPick(cell)}
      className={[
        "text-left rounded-md bg-card p-3 transition-all",
        cellProduced ? "border-2 border-emerald-500" : "border",
        implausible
          ? "opacity-40 cursor-not-allowed line-through"
          : "hover:shadow-md hover:border-primary/50 cursor-pointer",
        covered && !implausible && !cellProduced ? "border-emerald-500/40" : "",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        {cellProduced ? (
          <div className="w-8 flex items-start justify-center pt-0.5">
            <Check className="w-5 h-5 text-emerald-600" />
          </div>
        ) : null}
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
          {prod && (
            <div className="text-[11px] text-muted-foreground mt-0.5 flex flex-wrap gap-x-2">
              <span>Canonique : {prod.canonical_cardinality}</span>
              <span>Produite : {producedDomains}/{domainKeys.length} domaine(s)</span>
            </div>
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {s.domains.slice(0, 6).map((d) => {
          const dp = byDomain[d];
          const done = dp?.canonical_done === true;
          const tooltip = dp && dp.cardinalities_produced.length > 0
            ? `Cardinalités produites : ${dp.cardinalities_produced.join(", ")}`
            : "Aucune production";
          return done ? (
            <Badge
              key={d}
              title={tooltip}
              className="text-[10px] py-0 px-1.5 bg-emerald-600 text-white hover:bg-emerald-600/90 border-transparent"
            >
              ✓ {d}
            </Badge>
          ) : (
            <Badge key={d} variant="secondary" title={tooltip} className="text-[10px] py-0 px-1.5">
              {d}
            </Badge>
          );
        })}
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
  const baseUserMax = useMemo(() => {
    const m = cell.index.match(/-(\d)-/);
    return m ? parseInt(m[1], 10) : 1;
  }, [cell.index]);
  type Persisted = {
    moteur: Moteur;
    gpt2Style: string | null;
    promptRes: GeneratePromptResponse | null;
    vectRes: VectorizeResponse | null;
    validated: boolean;
    placement?: PlaceZonesResponse | null;
    editedZones?: Record<string, ZonePair[]>;
    placementsMode?: boolean;
    userMax?: number;
    produceByN?: Record<number, boolean>;
    validatedByN?: Record<number, boolean>;
    mirrored?: boolean;
    rotation?: 0 | 90 | 180 | 270;
  };
  const loadPersisted = (): Persisted | null => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(persistKey);
      return raw ? (JSON.parse(raw) as Persisted) : null;
    } catch { return null; }
  };
  const initial = loadPersisted();

  const initialProduce = (max: number): Record<number, boolean> => {
    const r: Record<number, boolean> = {};
    for (let i = 1; i <= max; i++) r[i] = true;
    return r;
  };

  const [moteur, setMoteur] = useState<Moteur>(initial?.moteur ?? "midjourney");
  const [gpt2Style, setGpt2Style] = useState<string | null>(initial?.gpt2Style ?? null);
  const [charte, setCharte] = useState<CharteResponse | null>(null);
  const [promptRes, setPromptRes] = useState<GeneratePromptResponse | null>(initial?.promptRes ?? null);
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);
  const [promptEdited, setPromptEdited] = useState<string | null>(null);

  const [vectRes, setVectRes] = useState<VectorizeResponse | null>(initial?.vectRes ?? null);
  const [vectLoading, setVectLoading] = useState(false);
  const [vectError, setVectError] = useState<string | null>(null);
  const [validated, setValidated] = useState<boolean>(initial?.validated ?? false);
  const [sizeInfo, setSizeInfo] = useState<{ before: number; after: number } | null>(null);
  const [placement, setPlacement] = useState<PlaceZonesResponse | null>(initial?.placement ?? null);
  const [editedZones, setEditedZones] = useState<Record<string, ZonePair[]>>(initial?.editedZones ?? {});
  const [placementsMode, setPlacementsMode] = useState<boolean>(initial?.placementsMode ?? false);
  const [userMax, setUserMax] = useState<number>(initial?.userMax ?? baseUserMax);
  const [produceByN, setProduceByN] = useState<Record<number, boolean>>(
    initial?.produceByN ?? initialProduce(initial?.userMax ?? baseUserMax),
  );
  const [validatedByN, setValidatedByN] = useState<Record<number, boolean>>(initial?.validatedByN ?? {});
  const [mirrored, setMirrored] = useState<boolean>(initial?.mirrored ?? false);
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(initial?.rotation ?? 0);
  const [eraserOpen, setEraserOpen] = useState(false);
  const [composition, setComposition] = useState<import("@/components/admin/studio/PlaceholdersEditor").CompositionReadyData | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Existing produced illustrations for the active domain
  const producedItems = useMemo(() => {
    if (registre !== "domain" || !selecteur) return [] as { cardinality: number; id: string; file: string }[];
    const arr = cell.production?.by_domain?.[selecteur]?.produced;
    return Array.isArray(arr) ? [...arr].sort((a, b) => a.cardinality - b.cardinality) : [];
  }, [cell, registre, selecteur]);
  const hasProduced = producedItems.length > 0;

  const [selectedProducedCard, setSelectedProducedCard] = useState<number | null>(
    hasProduced ? producedItems[producedItems.length - 1].cardinality : null,
  );
  const [bypassGuard, setBypassGuard] = useState(false);
  const [guardAction, setGuardAction] = useState<(() => void) | null>(null);

  const requestAction = (act: () => void) => {
    if (hasProduced && !bypassGuard && !vectRes) {
      setGuardAction(() => act);
    } else {
      act();
    }
  };

  // Load charte once
  useEffect(() => {
    let cancel = false;
    studioV2Api.charte()
      .then((c) => { if (!cancel) setCharte(c); })
      .catch(() => { /* silent — selector just won't show styles */ });
    return () => { cancel = true; };
  }, []);

  // Hydrate from storage when cell/registre/selecteur changes
  useEffect(() => {
    const p = loadPersisted();
    setPromptRes(p?.promptRes ?? null);
    setPromptError(null);
    setVectRes(p?.vectRes ?? null);
    setVectError(null);
    setValidated(p?.validated ?? false);
    setMoteur(p?.moteur ?? "midjourney");
    setGpt2Style(p?.gpt2Style ?? null);
    // Drop cached placement that pre-dates the headers feature so it gets refetched
    // (otherwise headers boxes never appear for sessions persisted before the upgrade).
    const cachedPlacement = p?.placement && (p.placement as PlaceZonesResponse).headers
      ? p.placement
      : null;
    setPlacement(cachedPlacement);
    setEditedZones(p?.editedZones ?? {});
    setPlacementsMode(p?.placementsMode ?? false);
    setUserMax(p?.userMax ?? baseUserMax);
    setProduceByN(p?.produceByN ?? initialProduce(p?.userMax ?? baseUserMax));
    setValidatedByN(p?.validatedByN ?? {});
    setMirrored(p?.mirrored ?? false);
    setRotation(p?.rotation ?? 0);
    setComposition(null);
    setBypassGuard(false);
    setSelectedProducedCard(hasProduced ? producedItems[producedItems.length - 1].cardinality : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cell.index, registre, selecteur]);

  // Persist whenever a meaningful piece changes
  useEffect(() => {
    try {
      localStorage.setItem(
        persistKey,
        JSON.stringify({
          moteur, gpt2Style, promptRes, vectRes, validated,
          placement, editedZones, placementsMode,
          userMax, produceByN, validatedByN, mirrored, rotation,
        } satisfies Persisted),
      );
    } catch { /* ignore quota */ }
  }, [persistKey, moteur, gpt2Style, promptRes, vectRes, validated, placement, editedZones, placementsMode, userMax, produceByN, validatedByN, mirrored, rotation]);




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
      setPromptEdited(null);
    } catch (e) {
      // Ne pas laisser un ancien prompt visible quand la tentative a échoué.
      setPromptRes(null);
      setPromptEdited(null);
      setPromptError(e instanceof Error ? e.message : String(e));
    } finally {
      setPromptLoading(false);
    }
  };

  const hasAnyRegistre =
    s.domains.length > 0 || s.sport.length > 0 || s.hasEtat || s.hasConflit;

  const handleFile = async (file: File) => {
    setVectLoading(true); setVectError(null); setValidated(false); setVectRes(null); setSizeInfo(null);
    setPlacement(null); setEditedZones({}); setValidatedByN({}); setComposition(null); setPlacementsMode(false);
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


  const setRegistre = (r: Registre, sel: string | null) =>
    onChange({ ...state, registre: r, selecteur: sel });

  const handleUserMaxChange = (n: number) => {
    setUserMax(n);
    setProduceByN((prev) => {
      const next: Record<number, boolean> = {};
      for (let i = 1; i <= n; i++) next[i] = prev[i] ?? true;
      return next;
    });
    setValidatedByN((prev) => {
      const next: Record<number, boolean> = {};
      for (let i = 1; i <= n; i++) if (prev[i]) next[i] = true;
      return next;
    });
    setEditedZones({});
    setComposition(null);
  };

  const handleValidateCard = (n: number) => {
    setValidatedByN((prev) => ({ ...prev, [n]: true }));
    toast.success(`Cardinalité ${n} validée`);
  };


  const [promptOpen, setPromptOpen] = useState(false);

  return (
    <div className="space-y-3">
      {/* Cell header */}
      <div className="flex items-baseline gap-3 flex-wrap">
        <span className="font-mono text-xl font-semibold">{cell.index}</span>
        <span className="text-sm text-muted-foreground">{cell.sicai_code}</span>
      </div>

      {/* BAR 1 — Incarnation (compact horizontal) */}
      <Card className="px-3 py-2">
        <div className="flex items-center gap-3 flex-wrap">
          {s.domains.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Dom.</span>
              <div className="flex gap-1">
                {s.domains.map((d) => (
                  <button
                    key={d}
                    onClick={() => setRegistre("domain", d)}
                    className={[
                      "px-2 py-0.5 text-xs rounded border",
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
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Sport</span>
              <div className="flex gap-1 flex-wrap">
                {s.sport.map((sp) => (
                  <button
                    key={sp}
                    onClick={() => setRegistre("sport", sp)}
                    className={[
                      "px-2 py-0.5 text-xs rounded border",
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
            <div className="flex gap-1">
              {s.hasEtat && (
                <button
                  onClick={() => setRegistre("etat", null)}
                  className={[
                    "px-2 py-0.5 text-xs rounded border",
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
                    "px-2 py-0.5 text-xs rounded border",
                    registre === "conflit"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background hover:bg-muted",
                  ].join(" ")}
                >CONFLIT</button>
              )}
            </div>
          )}

          <div className="ml-auto flex items-center gap-2 min-w-0">
            {promptRes?.incarnation_source && (
              <span
                className="text-xs text-muted-foreground truncate max-w-[40ch]"
                title={promptRes.incarnation_source}
              >
                {promptRes.incarnation_source}
              </span>
            )}
            <div
              className="shrink-0"
              title={`${FAMILY_LABEL[cell.family as string] ?? cell.family} · ${cell.cardinality} · ${cell.regime}`}
            >
              <StructuralSketch
                family={cell.family as string}
                cardinality={cell.cardinality as string}
                regime={cell.regime as string}
                size={40}
                showBadge={false}
              />
            </div>
          </div>
        </div>
      </Card>

      {/* BAR 2 — Import / vectorisation / actions (compact horizontal) */}
      <Card className="px-3 py-2">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) requestAction(() => handleFile(f));
            }}
            onClick={() => requestAction(() => fileInputRef.current?.click())}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded border border-dashed hover:bg-muted/40 transition-colors"
            title="PNG / JPEG, max 5 Mo"
          >
            <UploadIcon className="w-4 h-4" />
            <span>{vectRes ? "Remplacer l'image" : "Déposer ou cliquer"}</span>
          </button>
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

          {vectLoading && (
            <span className="text-xs text-muted-foreground inline-flex items-center">
              <Loader2 className="w-4 h-4 mr-1 animate-spin" /> Vectorisation…
            </span>
          )}

          {sizeInfo && !vectLoading && (
            <span className="text-[11px] text-muted-foreground">
              {formatBytes(sizeInfo.before)} → {formatBytes(sizeInfo.after)}
            </span>
          )}

          {vectRes && (
            <div className="flex items-center gap-2 text-xs">
              <VerdictBadge verdict={vectRes.metrics.verdict} />
              <span className="text-muted-foreground">
                {vectRes.metrics.ink_density_pct.toFixed(1)}% · ombres {vectRes.metrics.shadow_blobs_removed} · {vectRes.metrics.cropped_size[0]}×{vectRes.metrics.cropped_size[1]}
              </span>
            </div>
          )}

          {vectError && (
            <span className="text-xs text-destructive">{vectError}</span>
          )}

          <div className="ml-auto flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => requestAction(() => setPromptOpen((v) => !v))}
            >
              {promptOpen ? "Masquer le prompt" : "Prompt"}
            </Button>
            {vectRes && !validated && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEraserOpen(true)}
                  title="Effacer les imperfections avant validation"
                >
                  <Eraser className="w-4 h-4 mr-1" /> Gomme
                </Button>
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
              </>
            )}
            {validated && vectRes && vectRes.viewbox && !placementsMode && (
              <>
                <button
                  type="button"
                  onClick={() => setMirrored((m) => !m)}
                  title="Inverser horizontalement l'illustration"
                  className={[
                    "px-2 py-1 text-xs rounded border transition",
                    mirrored
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background hover:bg-muted",
                  ].join(" ")}
                >
                  ⇄ Miroir
                </button>
                <button
                  type="button"
                  onClick={() => setRotation((r) => (((r + 90) % 360) as 0 | 90 | 180 | 270))}
                  title="Rotation 90° (clic répété)"
                  className={[
                    "px-2 py-1 text-xs rounded border transition",
                    rotation !== 0
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background hover:bg-muted",
                  ].join(" ")}
                >
                  ⟳ Rotation {rotation}°
                </button>
                <Button size="sm" onClick={() => setPlacementsMode(true)}>
                  Poser les placeholders
                </Button>
              </>
            )}
            {validated && vectRes && !vectRes.viewbox && (
              <span className="text-xs text-destructive">Viewbox manquante</span>
            )}
          </div>
        </div>
      </Card>

      {/* Optional prompt panel (collapsible) */}
      {promptOpen && (
        <Card className="p-3 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 className="text-sm font-semibold uppercase tracking-wider">Prompt</h3>
            <div className="flex items-center gap-2">
              <Tabs value={moteur} onValueChange={(v) => setMoteur(v as Moteur)}>
                <TabsList>
                  <TabsTrigger value="midjourney">Midjourney</TabsTrigger>
                  <TabsTrigger value="gpt-image-2">GPT-image-2</TabsTrigger>
                </TabsList>
              </Tabs>
              {moteur === "gpt-image-2" && gpt2Styles && (
                <Select
                  value={gpt2Style ?? gpt2Default ?? ""}
                  onValueChange={(v) => setGpt2Style(v)}
                >
                  <SelectTrigger className="w-[160px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(gpt2Styles).map(([key, st]) => (
                      <SelectItem key={key} value={key}>
                        {(st as { label: string }).label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button onClick={generatePrompt} disabled={promptLoading || !hasAnyRegistre} size="sm">
                {promptLoading
                  ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Génération…</>)
                  : "Générer le prompt"}
              </Button>
            </div>
          </div>

          {!hasAnyRegistre && (
            <p className="text-sm text-muted-foreground">
              Cette cellule n'a pas encore d'incarnation — rien à générer.
            </p>
          )}

          {hasAnyRegistre && promptError && <p className="text-sm text-destructive">{promptError}</p>}

          {promptRes && (
            <div className="space-y-2">
              <textarea
                value={promptEdited ?? promptRes.prompt}
                onChange={(e) => setPromptEdited(e.target.value)}
                className="w-full min-h-[120px] font-mono text-xs p-3 rounded-md border bg-background resize-y"
              />
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await navigator.clipboard.writeText(promptEdited ?? promptRes.prompt);
                    toast.success("Prompt copié");
                  }}
                >
                  <Copy className="w-4 h-4 mr-1" /> Copier
                </Button>
                {promptEdited !== null && promptEdited !== promptRes.prompt && (
                  <>
                    <span className="text-xs text-amber-600">● modifié</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setPromptEdited(null)}
                    >
                      Réinitialiser
                    </Button>
                  </>
                )}
                <p className="text-xs text-muted-foreground">
                  Charte v{promptRes.charte_version} · {promptRes.meta.cote}
                  {promptRes.style && (
                    <span className="ml-2">
                      Style : {gpt2Styles?.[promptRes.style]?.label ?? promptRes.style}
                    </span>
                  )}
                </p>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* CENTRAL ZONE — full width */}
      <Card className="p-3">
        {placementsMode && validated && vectRes && vectRes.viewbox ? (
          <PlaceholdersEditor
            svg={vectRes.svg}
            viewbox={vectRes.viewbox}
            occupancy={vectRes.occupancy}
            userMax={userMax}
            onUserMaxChange={handleUserMaxChange}
            produceByN={produceByN}
            onProduceChange={setProduceByN}
            validatedByN={validatedByN}
            onValidateCard={handleValidateCard}
            placement={placement}
            editedZones={editedZones}
            onPlacementLoaded={(p) => { setPlacement(p); setEditedZones({}); }}
            onEditedChange={setEditedZones}
            onCompositionReady={setComposition}
            ratioLabel={vectRes.metrics?.ratio_label}
            persistKey={persistKey}
            mirrored={mirrored}
            rotation={rotation}
          />

        ) : (
          <div
            className="relative w-full flex items-center justify-center"
            style={{ height: "calc(100vh - 280px)" }}
          >
            {(() => {
              // Compute aspect ratio of the (possibly rotated) image so the
              // surrounding frame adapts to portrait/landscape orientations.
              const svgStr = vectRes?.svg ?? "";
              const vb = svgStr.match(/viewBox\s*=\s*["']\s*([-\d.]+)\s+([-\d.]+)\s+([\d.]+)\s+([\d.]+)\s*["']/i);
              let nW = 1, nH = 1;
              if (vb) { nW = parseFloat(vb[3]); nH = parseFloat(vb[4]); }
              const rotated90 = rotation === 90 || rotation === 270;
              const imgW = rotated90 ? nH : nW;
              const imgH = rotated90 ? nW : nH;
              const aspect = imgW / imgH;
              return (
                <div
                  className="relative bg-muted/30 border rounded-md overflow-hidden h-full"
                  style={{ aspectRatio: `${aspect}`, maxWidth: "100%" }}
                >
                  {vectLoading && (
                    <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Vectorisation…
                    </div>
                  )}
                  {!vectLoading && vectRes && (
                    <ZoomableSvg svg={vectRes.svg} mirrored={mirrored} rotation={rotation} />
                  )}
                </div>
              );
            })()}
            {!vectLoading && !vectRes && hasProduced && (() => {
              const item =
                producedItems.find((p) => p.cardinality === selectedProducedCard) ??
                producedItems[producedItems.length - 1];
              const url = `https://krobar.online/templates/${item.file}`;
              return (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4">
                  {producedItems.length > 1 && (
                    <div className="flex gap-1.5">
                      {producedItems.map((p) => (
                        <button
                          key={p.cardinality}
                          onClick={() => setSelectedProducedCard(p.cardinality)}
                          className={[
                            "w-7 h-7 text-xs rounded-full border font-mono",
                            (selectedProducedCard ?? item.cardinality) === p.cardinality
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-background hover:bg-muted",
                          ].join(" ")}
                          title={`Cardinalité ${p.cardinality}`}
                        >
                          {p.cardinality}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex-1 min-h-0 w-full flex items-center justify-center">
                    <img
                      src={url}
                      alt={`Illustration ${item.id}`}
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground font-mono">{item.id}</p>
                </div>
              );
            })()}
            {!vectLoading && !vectRes && !hasProduced && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center text-muted-foreground px-6">
                  <StructuralSketch
                    family={cell.family as string}
                    cardinality={cell.cardinality as string}
                    regime={cell.regime as string}
                    size={140}
                    showBadge={false}
                  />
                  <p className="text-sm mt-3">Aucune illustration pour l'instant.</p>
                  <p className="text-xs mt-1">
                    Générez le prompt, créez l'image, puis importez-la pour vectoriser.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {composition && (
        <MetadataExportPanel
          cell={cell}
          incarnation={promptRes?.incarnation_source ?? ""}
          domain={registre === "domain" ? (selecteur ?? "") : ""}
          vectorizedSvg={vectRes?.svg ?? ""}
          composition={composition}
          produceByN={produceByN}
          validatedByN={validatedByN}
          onCancel={onBack}
        />
      )}

      <AlertDialog open={guardAction !== null} onOpenChange={(o) => { if (!o) setGuardAction(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Illustration déjà existante</AlertDialogTitle>
            <AlertDialogDescription>
              Une illustration existe déjà pour {cell.index} / {selecteur ?? ""}
              {producedItems.length > 0 && (
                <> (cardinalité {producedItems[producedItems.length - 1].cardinality})</>
              )}.
              Voulez-vous vraiment en créer une nouvelle ? Cela n'écrase pas l'existante
              mais ajoute une variante.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setGuardAction(null)}>
              Voir l'existante
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const act = guardAction;
                setBypassGuard(true);
                setGuardAction(null);
                if (act) act();
              }}
            >
              Créer quand même
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {vectRes && (
        <SvgEraserDialog
          open={eraserOpen}
          onOpenChange={setEraserOpen}
          svg={vectRes.svg}
          onApply={(newSvg) => {
            setVectRes({ ...vectRes, svg: newSvg });
            toast.success("Imperfections effacées");
          }}
        />
      )}
    </div>
  );
}

function MetadataExportPanel(props: {
  cell: CoverageCell;
  incarnation: string;
  domain: string;
  vectorizedSvg: string;
  composition: import("@/components/admin/studio/PlaceholdersEditor").CompositionReadyData;
  produceByN: Record<number, boolean>;
  validatedByN: Record<number, boolean>;
  onCancel: () => void;
}) {
  const { cell, incarnation, domain, vectorizedSvg, composition, produceByN, validatedByN, onCancel } = props;
  const [meta, setMeta] = useState<{ best_for: string; textual_markers: string[]; matching_types: string[] }>({
    best_for: "", textual_markers: [], matching_types: [],
  });
  const [groups, setGroups] = useState<import("@/lib/studioV2Api").MatchingGroup[]>([]);
  const [loadingSuggest, setLoadingSuggest] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<import("@/lib/studioV2Api").ExportResponse | null>(null);
  const [markerInput, setMarkerInput] = useState("");

  const pendingExportNs = useMemo(
    () =>
      Object.keys(produceByN)
        .map(Number)
        .filter((n) => produceByN[n] && !validatedByN[n])
        .sort((a, b) => a - b),
    [produceByN, validatedByN],
  );

  useEffect(() => {
    studioV2Api.matchingTypes().then((r) => setGroups(r.groups)).catch(() => {});
  }, []);

  const suggest = async () => {
    setLoadingSuggest(true);
    try {
      const r = await studioV2Api.suggestMetadata({
        cell: { family: cell.family as string, cardinality: cell.cardinality as string, regime: cell.regime as string },
        incarnation,
      });
      setMeta({ best_for: r.best_for, textual_markers: r.textual_markers, matching_types: r.matching_types });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Suggestion impossible");
    } finally {
      setLoadingSuggest(false);
    }
  };

  useEffect(() => { if (!meta.best_for) suggest(); /* eslint-disable-next-line */ }, []);

  const toggleMatchingType = (id: string) => {
    setMeta((m) => ({
      ...m,
      matching_types: m.matching_types.includes(id)
        ? m.matching_types.filter((x) => x !== id)
        : [...m.matching_types, id],
    }));
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const exportPayload = {
        composition: {
          cell: {
            index: cell.index,
            family: cell.family as string,
            cardinality: cell.cardinality as string,
            regime: cell.regime as string,
            incarnation,
          },
          viewbox: composition.viewbox,
          decor: { vectorized_svg: vectorizedSvg, transform: composition.transform },
          gabarit: composition.gabarit,
          metadata: {
            category: "Visual Metaphors",
            domain,
            best_for: meta.best_for,
            textual_markers: meta.textual_markers,
            matching_types: meta.matching_types,
          },
          zones_by_cardinality: composition.zones_by_cardinality,
          ...(composition.headers ? { headers: composition.headers } : {}),
        },
      };
      // Debug: confirm headers actually leaves the front in the export payload.
      // eslint-disable-next-line no-console
      console.log("[studio] export payload.headers =", exportPayload.composition.headers);
      const r = await studioV2Api.exportTemplates(exportPayload);
      setExportResult(r);
      toast.success("Templates déployés");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export impossible");
    } finally {
      setExporting(false);
    }
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider">Référencement</h3>
        <Button size="sm" variant="outline" onClick={suggest} disabled={loadingSuggest}>
          {loadingSuggest ? <Loader2 className="w-4 h-4 animate-spin" /> : "Re-suggérer"}
        </Button>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium">best_for</label>
        <textarea
          value={meta.best_for}
          onChange={(e) => setMeta((m) => ({ ...m, best_for: e.target.value }))}
          className="w-full min-h-[60px] text-sm p-2 rounded border bg-background"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium">textual_markers</label>
        <div className="flex flex-wrap gap-1">
          {meta.textual_markers.map((t) => (
            <Badge key={t} variant="secondary" className="cursor-pointer" onClick={() => setMeta((m) => ({ ...m, textual_markers: m.textual_markers.filter((x) => x !== t) }))}>
              {t} ×
            </Badge>
          ))}
        </div>
        <div className="flex gap-1 mt-1">
          <input
            value={markerInput}
            onChange={(e) => setMarkerInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && markerInput.trim()) {
                e.preventDefault();
                setMeta((m) => ({ ...m, textual_markers: [...m.textual_markers, markerInput.trim()] }));
                setMarkerInput("");
              }
            }}
            placeholder="Ajouter un marqueur (Entrée)"
            className="text-xs h-7 px-2 border rounded bg-background flex-1"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium">matching_types</label>
        <div className="space-y-2 max-h-[200px] overflow-auto border rounded p-2">
          {groups.map((g) => (
            <div key={g.id}>
              <p className="text-[11px] font-semibold text-muted-foreground">{g.label}</p>
              <div className="flex flex-wrap gap-1">
                {g.matching_types.map((mt) => (
                  <button
                    key={mt.id}
                    onClick={() => toggleMatchingType(mt.id)}
                    className={[
                      "text-[11px] px-2 py-0.5 rounded border",
                      meta.matching_types.includes(mt.id)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background hover:bg-muted",
                    ].join(" ")}
                  >
                    {mt.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex gap-2">
          <Button
            onClick={handleExport}
            disabled={exporting || !meta.best_for || pendingExportNs.length > 0}
            title={
              pendingExportNs.length > 0
                ? `Validez d'abord les cardinalités : ${pendingExportNs.join(", ")}`
                : undefined
            }
          >
            {exporting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
            Exporter dans la bibliothèque
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={exporting}
          >
            Annuler
          </Button>
        </div>
        {pendingExportNs.length > 0 && (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Validez d'abord les cardinalités : {pendingExportNs.join(", ")}
          </p>
        )}
      </div>

      {exportResult && (
        <div className="rounded-md border bg-emerald-500/10 border-emerald-500/30 p-3 text-xs space-y-1">
          {exportResult.deployed.length === 0 ? (
            <p className="font-medium text-emerald-700 dark:text-emerald-300">
              Déployé : 0 fichier{exportResult.skipped.length > 0 ? ` — déjà existants : ${exportResult.skipped.join(", ")}` : ""}
            </p>
          ) : (
            <p className="font-medium text-emerald-700 dark:text-emerald-300">
              Déployé : {exportResult.deployed.join(", ")} ({exportResult.deployed.length} fichier{exportResult.deployed.length > 1 ? "s" : ""})
            </p>
          )}
          {exportResult.deployed.length > 0 && exportResult.skipped.length > 0 && (
            <p className="text-muted-foreground">Ignorés (déjà existants) : {exportResult.skipped.join(", ")}</p>
          )}
          {exportResult.deployed.length > 0 && exportResult.restart_triggered && (
            <p className="font-medium">
              ↻ Redémarrage automatique en cours — les templates seront servis dans ~10 secondes.
            </p>
          )}
          {exportResult.deployed.length > 0 && exportResult.restart_required && !exportResult.restart_triggered && (
            <p className="text-amber-700 dark:text-amber-300 font-medium">
              ⚠ Redémarrage manuel requis.
            </p>
          )}
          <p className="text-muted-foreground">Manifest total : {exportResult.manifest_total} · backup : {exportResult.backup}</p>
        </div>
      )}
    </Card>
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
