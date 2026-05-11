import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, Pause, Play, Download, RotateCcw, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { palettes, paletteLabels, type Palette } from "@/palettes";
import { fetchCanonicalTestSuite, type TestCase, type ChoremeFamily } from "@/data/test-suite";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import {
  checkPaletteApplied,
  checkSlotsLength,
  formatScorePct,
  loadRenderedSvg,
  svgToString,
  type Manifest,
  type Suggestion,
} from "@/lib/kroki";
import { normalizeScore } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";

type Status = "idle" | "running" | "success" | "warning" | "fail";

type FailureCategory =
  | "mismatch"
  | "empty_suggestions"
  | "api_error"
  | "network_error"
  | "render_error"
  | "parse_error"
  | "frontend_exception";

type TestResult = {
  id: number;
  status: Status;
  suggestions: Suggestion[];
  actualTemplate: string | null;
  matchKind: "exact" | "in_top3" | "miss" | null;
  latencyMs: number | null;
  svgString: string | null;
  errorMsg: string | null;
  slotsLengthOk: boolean | null;
  slotsOffenders: string[];
  paletteOk: boolean | null;
  timestamp: string | null;
  failureCategory: FailureCategory | null;
  failureDetail: string | null;
};

const RESULTS_STORAGE = "kroki-last-test-run";
const NOTES_STORAGE = "kroki-test-notes";

function emptyResult(id: number): TestResult {
  return {
    id,
    status: "idle",
    suggestions: [],
    actualTemplate: null,
    matchKind: null,
    latencyMs: null,
    svgString: null,
    errorMsg: null,
    slotsLengthOk: null,
    slotsOffenders: [],
    paletteOk: null,
    timestamp: null,
    failureCategory: null,
    failureDetail: null,
  };
}

const failureLabel: Record<FailureCategory, string> = {
  mismatch: "Mauvais top 1",
  empty_suggestions: "❌ Pas de suggestion",
  api_error: "❌ Erreur API",
  network_error: "❌ Pas de réponse",
  render_error: "❌ Rendu échoué",
  parse_error: "❌ Réponse non-JSON",
  frontend_exception: "❌ Erreur frontend",
};

const statusIcon: Record<Status, string> = {
  idle: "⬜",
  running: "🔄",
  success: "✅",
  warning: "⚠️",
  fail: "❌",
};

const statusLabel: Record<Status, string> = {
  idle: "En attente",
  running: "En cours",
  success: "Réussi",
  warning: "Avertissement",
  fail: "Échec",
};

function loadNotes(): Record<number, string> {
  try {
    return JSON.parse(localStorage.getItem(NOTES_STORAGE) || "{}");
  } catch {
    return {};
  }
}

function saveNotes(notes: Record<number, string>) {
  localStorage.setItem(NOTES_STORAGE, JSON.stringify(notes));
}

interface Props {
  manifest: Manifest;
  onBack: () => void;
}

export default function TestSuiteView({ manifest, onBack }: Props) {
  const [testSuite, setTestSuite] = useState<TestCase[]>([]);
  const [corpusLoading, setCorpusLoading] = useState(true);
  const [corpusError, setCorpusError] = useState<string | null>(null);
  const [results, setResults] = useState<TestResult[]>(() => {
    try {
      const cached = localStorage.getItem(RESULTS_STORAGE);
      if (cached) return JSON.parse(cached);
    } catch {
      /* ignore */
    }
    return [];
  });

  const loadCorpus = async () => {
    setCorpusLoading(true);
    setCorpusError(null);
    try {
      const suite = await fetchCanonicalTestSuite(manifest);
      setTestSuite(suite);
      setResults((prev) => {
        // Conserver les résultats persistés correspondants, initialiser le reste.
        const byId = new Map(prev.map((r) => [r.id, r]));
        return suite.map((t) => byId.get(t.id) ?? emptyResult(t.id));
      });
    } catch (e) {
      setCorpusError(e instanceof Error ? e.message : String(e));
    } finally {
      setCorpusLoading(false);
    }
  };

  useEffect(() => {
    loadCorpus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  type FilterType = "all" | "procedural" | "choreme" | "premium" | "A" | "B" | "C";
  type FilterStatus = "all" | "success" | "warning" | "fail" | "mismatch" | "errors";
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");

  const categories = useMemo(() => {
    const set = new Set<string>(testSuite.map((t) => t.category));
    return ["all", ...Array.from(set).sort()];
  }, [testSuite]);

  const filteredTests = useMemo(() => {
    return testSuite.filter((t) => {
      if (filterType === "procedural" && t.choreme) return false;
      if (filterType === "choreme" && !t.choreme) return false;
      if ((filterType === "A" || filterType === "B" || filterType === "C") && t.choreme?.family !== filterType) return false;
      if (filterCategory !== "all" && t.category !== filterCategory) return false;
      if (filterStatus !== "all") {
        const r = results.find((x) => x.id === t.id);
        if (!r) return false;
        if (filterStatus === "success" && r.status !== "success") return false;
        if (filterStatus === "warning" && r.status !== "warning") return false;
        if (filterStatus === "fail" && r.status !== "fail") return false;
        if (filterStatus === "mismatch" && r.failureCategory !== "mismatch") return false;
        if (filterStatus === "errors") {
          const errs: (typeof r.failureCategory)[] = ["api_error", "network_error", "parse_error", "frontend_exception", "empty_suggestions", "render_error"];
          if (!r.failureCategory || !errs.includes(r.failureCategory)) return false;
        }
      }
      return true;
    });
  }, [testSuite, filterType, filterCategory, filterStatus, results]);

  const [paletteKey, setPaletteKey] = useState<keyof typeof palettes>("ocean");
  const [fastMode, setFastMode] = useState(true);
  const [running, setRunning] = useState(false);
  const pauseRef = useRef(false);
  const [paused, setPaused] = useState(false);
  const [zoom, setZoom] = useState<{ id: number; svg: string } | null>(null);
  const [fullText, setFullText] = useState<TestCase | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>(() => loadNotes());
  const [annotateId, setAnnotateId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const toggleSelected = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectAll = () => setSelectedIds(new Set(testSuite.map((t) => t.id)));
  const clearSelection = () => setSelectedIds(new Set());
  const allSelected = selectedIds.size === testSuite.length;

  // Compute "new" tests: those whose id isn't present in the persisted results snapshot at mount.
  const [newTestIds] = useState<Set<number>>(() => {
    try {
      const cached = localStorage.getItem(RESULTS_STORAGE);
      if (!cached) return new Set(testSuite.map((t) => t.id));
      const parsed = JSON.parse(cached) as Array<{ id: number }>;
      const known = new Set(parsed.map((r) => r.id));
      return new Set(testSuite.filter((t) => !known.has(t.id)).map((t) => t.id));
    } catch {
      return new Set(testSuite.map((t) => t.id));
    }
  });
  const selectNew = () => setSelectedIds(new Set(newTestIds));

  const palette = palettes[paletteKey];

  // Persist results.
  useEffect(() => {
    localStorage.setItem(RESULTS_STORAGE, JSON.stringify(results));
  }, [results]);

  const updateResult = (id: number, patch: Partial<TestResult>) => {
    setResults((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const runOne = async (test: TestCase, currentPalette: Palette): Promise<void> => {
    updateResult(test.id, { ...emptyResult(test.id), status: "running" });

    const t0 = performance.now();
    let latencyMs: number | null = null;
    let suggestions: Suggestion[] = [];
    let failureCategory: FailureCategory | null = null;
    let failureDetail: string | null = null;

    try {
      const resp = await supabase.functions.invoke("krobar-proxy", {
        body: { endpoint: "analyze", payload: { text: test.text, detail_level: "auto" } },
      });
      latencyMs = Math.round(performance.now() - t0);

      if (resp.error) {
        let body: { error?: string; detail?: string; status?: number } | null = null;
        let httpStatus: number | null = null;
        const ctx = (resp.error as unknown as { context?: Response }).context;
        if (ctx instanceof Response) {
          httpStatus = ctx.status;
          try {
            body = await ctx.clone().json();
          } catch {
            failureCategory = "parse_error";
            failureDetail = `Réponse non-JSON (HTTP ${httpStatus})`;
          }
        }
        if (!failureCategory) {
          if (httpStatus && httpStatus >= 400 && httpStatus !== 504) {
            failureCategory = "api_error";
            failureDetail = `HTTP ${httpStatus} — ${body?.error || body?.detail || resp.error.message}`;
          } else {
            failureCategory = "network_error";
            failureDetail = body?.error || resp.error.message || "Pas de réponse du backend";
          }
        }
        console.error(`[Test ${test.expected_template}] ${failureCategory}`, resp.error, body);
      } else {
        const data = resp.data as { suggestions?: Suggestion[]; latency_ms?: number } | null;
        const raw = data?.suggestions ?? [];
        if (typeof data?.latency_ms === "number") latencyMs = data.latency_ms;
        if (raw.length === 0) {
          failureCategory = "empty_suggestions";
          failureDetail = "Le backend a renvoyé un tableau vide";
          console.error(`[Test ${test.expected_template}] empty_suggestions`, data);
        } else {
          try {
            suggestions = raw.map((s) => ({ ...s, score: normalizeScore(s.score) }));
          } catch (e) {
            failureCategory = "frontend_exception";
            failureDetail = e instanceof Error ? e.message : String(e);
            console.error(`[Test ${test.expected_template}] frontend_exception`, e);
          }
        }
      }
    } catch (e) {
      latencyMs = Math.round(performance.now() - t0);
      failureCategory = "network_error";
      failureDetail = e instanceof Error ? e.message : String(e);
      console.error(`[Test ${test.expected_template}] network_error`, e);
    }

    let actualTemplate: string | null = null;
    let matchKind: TestResult["matchKind"] = null;
    let status: Status = "fail";
    let svgString: string | null = null;
    let paletteOk = false;
    let slotsLengthOk: boolean | null = null;
    let slotsOffenders: string[] = [];

    if (suggestions.length > 0) {
      const top = suggestions[0];
      actualTemplate = top.template_id;
      const ids = suggestions.map((s) => s.template_id);
      if (top.template_id === test.expected_template) {
        matchKind = "exact";
        status = "success";
        failureCategory = null;
        failureDetail = null;
      } else if (ids.includes(test.expected_template)) {
        matchKind = "in_top3";
        status = "warning";
        failureCategory = "mismatch";
        const isChoremeExpected = !!test.choreme;
        const top1IsProcedural = !top.template_id.startsWith("choreme_");
        if (isChoremeExpected && top1IsProcedural) {
          failureDetail = `Chorème attendu en position ${ids.indexOf(test.expected_template) + 1}/${ids.length} ; top 1 procédural équivalent reçu (${top.template_id})`;
        } else {
          failureDetail = `Top 1 reçu = ${top.template_id} (attendu en position ${ids.indexOf(test.expected_template) + 1}/${ids.length})`;
        }
      } else {
        matchKind = "miss";
        status = "fail";
        failureCategory = "mismatch";
        failureDetail = `Top 1 reçu = ${top.template_id} (attendu absent du top ${ids.length})`;
      }

      try {
        const svg = await loadRenderedSvg(top.template_id, top.slots, currentPalette);
        svg.setAttribute("width", "100%");
        svg.setAttribute("height", "100%");
        paletteOk = checkPaletteApplied(svg, currentPalette);
        svgString = svgToString(svg);
      } catch (e) {
        if (matchKind === "exact") {
          status = "warning";
          failureCategory = "render_error";
          failureDetail = e instanceof Error ? e.message : String(e);
        }
        console.error(`[Test ${test.expected_template}] render_error`, e);
      }
      const lengthCheck = checkSlotsLength(top.slots);
      slotsLengthOk = lengthCheck.ok;
      slotsOffenders = lengthCheck.offenders;
    }

    updateResult(test.id, {
      status,
      suggestions,
      actualTemplate,
      matchKind,
      latencyMs,
      svgString,
      slotsLengthOk,
      slotsOffenders,
      paletteOk,
      timestamp: new Date().toISOString(),
      errorMsg: failureDetail,
      failureCategory,
      failureDetail,
    });
  };

  const playBeep = () => {
    try {
      const Ctx = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
      const ctx = new Ctx();
      const beep = (freq: number, start: number, dur: number) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "sine";
        o.frequency.value = freq;
        o.connect(g);
        g.connect(ctx.destination);
        const t0 = ctx.currentTime + start;
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(0.25, t0 + 0.01);
        g.gain.linearRampToValueAtTime(0, t0 + dur);
        o.start(t0);
        o.stop(t0 + dur + 0.05);
      };
      beep(880, 0, 0.18);
      beep(1320, 0.22, 0.22);
      setTimeout(() => ctx.close(), 800);
    } catch {
      /* audio not available — silent fallback */
    }
  };

  const runAll = async () => {
    setRunning(true);
    pauseRef.current = false;
    setPaused(false);
    // Reset all
    setResults(testSuite.map((t) => emptyResult(t.id)));
    for (const test of testSuite) {
      if (pauseRef.current) {
        toast.info("Pause — exécution arrêtée");
        break;
      }
      await runOne(test, palette);
      await new Promise((r) => setTimeout(r, 1000)); // rate limiting
      if (!fastMode) {
        // (placeholder pour différencier — pour l'instant identique)
      }
    }
    setRunning(false);
    playBeep();
  };

  const runSelection = async () => {
    if (selectedIds.size === 0) return;
    setRunning(true);
    pauseRef.current = false;
    setPaused(false);
    const subset = testSuite.filter((t) => selectedIds.has(t.id));
    for (const test of subset) {
      if (pauseRef.current) {
        toast.info("Pause — exécution arrêtée");
        break;
      }
      await runOne(test, palette);
      await new Promise((r) => setTimeout(r, 1000));
    }
    setRunning(false);
    playBeep();
  };

  const pause = () => {
    if (!running) return;
    pauseRef.current = true;
    setPaused(true);
  };

  const resume = async () => {
    if (running) return;
    pauseRef.current = false;
    setPaused(false);
    setRunning(true);
    for (const test of testSuite) {
      const r = results.find((x) => x.id === test.id);
      if (r && r.status !== "idle") continue;
      if (pauseRef.current) break;
      await runOne(test, palette);
      await new Promise((r) => setTimeout(r, 1000));
    }
    setRunning(false);
    playBeep();
  };

  const replayOne = async (test: TestCase) => {
    await runOne(test, palette);
    playBeep();
  };

  const completedCount = results.filter((r) => r.status !== "idle" && r.status !== "running").length;
  const successCount = results.filter((r) => r.status === "success").length;
  const warningCount = results.filter((r) => r.status === "warning").length;
  const failCount = results.filter((r) => r.status === "fail").length;
  const allDone = completedCount === testSuite.length;
  const hasAnyCompleted = completedCount > 0;

  // Score breakdown procéduraux vs chorèmes
  const choremeIds = useMemo(() => new Set(testSuite.filter((t) => t.choreme).map((t) => t.id)), [testSuite]);
  const procIds = useMemo(() => new Set(testSuite.filter((t) => !t.choreme).map((t) => t.id)), [testSuite]);
  const procDone = results.filter((r) => procIds.has(r.id) && r.status !== "idle" && r.status !== "running");
  const procSuccess = procDone.filter((r) => r.status === "success").length;
  const chorDone = results.filter((r) => choremeIds.has(r.id) && r.status !== "idle" && r.status !== "running");
  const chorSuccess = chorDone.filter((r) => r.status === "success").length;

  const selectFiltered = () => setSelectedIds(new Set(filteredTests.map((t) => t.id)));


  const exportReport = () => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
    const human = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} à ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const filename = `krobar-tests-${stamp}.md`;

    const escapeText = (s: string) => s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/"/g, '\\"');
    const countItems = (s: string) =>
      (s.match(/[,;]/g) || []).length + (s.match(/\n/g) || []).length + 1;

    const typeLabel = (t: TestCase) =>
      t.choreme ? `Chorème ${t.choreme.family}/${t.choreme.code}` : "Procédural";
    const migrationGroup = (t: TestCase) => (t.choreme ? "chorème" : "v1 legacy");

    const executed = results.filter((r) => r.status !== "idle" && r.status !== "running");
    const executedSet = new Set(executed.map((r) => r.id));
    const totalLatency = executed.reduce((acc, r) => acc + (r.latencyMs ?? 0), 0);

    // Tests à exporter : respecter le filtre actif
    const inScope = filteredTests.filter((t) => executedSet.has(t.id));
    const inScopeIds = new Set(inScope.map((t) => t.id));
    const resInScope = executed.filter((r) => inScopeIds.has(r.id));
    const inScopeSuccess = resInScope.filter((r) => r.status === "success").length;
    const inScopeWarn = resInScope.filter((r) => r.status === "warning").length;
    const inScopeFail = resInScope.filter((r) => r.status === "fail").length;

    const procInScope = resInScope.filter((r) => procIds.has(r.id));
    const chorInScope = resInScope.filter((r) => choremeIds.has(r.id));
    const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

    // Synthèse par catégorie
    const byCat = new Map<string, { total: number; ok: number; warn: number; fail: number }>();
    inScope.forEach((t) => {
      const r = executed.find((x) => x.id === t.id)!;
      const c = t.category;
      const e = byCat.get(c) || { total: 0, ok: 0, warn: 0, fail: 0 };
      e.total++;
      if (r.status === "success") e.ok++;
      else if (r.status === "warning") e.warn++;
      else if (r.status === "fail") e.fail++;
      byCat.set(c, e);
    });

    const lines: string[] = [];
    lines.push(`# Suite de tests Krobar — Export ${human}`);
    lines.push("");
    lines.push("**Source : corpus canonique v1.0 (79 textes)**");
    lines.push("");
    lines.push("## Métadonnées");
    lines.push("");
    lines.push(`- **Tests exécutés** : ${resInScope.length} / ${filteredTests.length}`);
    lines.push(`- **Palette** : ${paletteLabels[paletteKey] || paletteKey}`);
    lines.push(`- **Mode rapide** : ${fastMode ? "ON" : "OFF"}`);
    lines.push(
      `- **Filtres actifs** : Type=${filterType}, Catégorie=${filterCategory}, Statut=${filterStatus}`,
    );
    lines.push(`- **Durée totale** : ${totalLatency} ms`);
    lines.push("");
    lines.push("## Score global");
    lines.push("");
    lines.push(
      `- **Tous** : ${inScopeSuccess}/${resInScope.length} (${pct(inScopeSuccess, resInScope.length)}%)`,
    );
    const procOk = procInScope.filter((r) => r.status === "success").length;
    const chorOk = chorInScope.filter((r) => r.status === "success").length;
    lines.push(
      `- **Procéduraux** : ${procOk}/${procInScope.length} (${pct(procOk, procInScope.length)}%)`,
    );
    lines.push(
      `- **Chorèmes** : ${chorOk}/${chorInScope.length} (${pct(chorOk, chorInScope.length)}%)`,
    );
    lines.push("");
    lines.push("## Synthèse par catégorie");
    lines.push("");
    lines.push("| Catégorie | Total | ✅ Réussis | ⚠️ Avertissements | ❌ Échecs |");
    lines.push("|---|---|---|---|---|");
    Array.from(byCat.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .forEach(([cat, v]) => {
        lines.push(`| ${cat} | ${v.total} | ${v.ok} | ${v.warn} | ${v.fail} |`);
      });
    lines.push("");

    const renderDetail = (t: TestCase, r: TestResult, position: number, withMeta = false) => {
      const out: string[] = [];
      const top1 = r.suggestions[0];
      const top3str = r.suggestions
        .slice(0, 3)
        .map((s) => `\`${s.template_id}\` (${formatScorePct(s.score)})`)
        .join(" · ");
      const card = manifest.templates.find((m) => m.id === t.expected_template) as
        | { cardinality?: number | { ideal?: number; min?: number; max?: number } }
        | undefined;
      const cardObj = typeof card?.cardinality === "object" ? card?.cardinality : null;
      const ideal = cardObj?.ideal ?? (typeof card?.cardinality === "number" ? card?.cardinality : "?");
      const minC = cardObj?.min ?? "?";
      const maxC = cardObj?.max ?? "?";
      const typeStr = t.choreme
        ? `Chorème ${t.choreme.family}/${t.choreme.code}, triplet : \`${t.choreme.triplet || "—"}\`, processus dominants : \`${(t.choreme.dominant_processes || []).join(", ") || "—"}\``
        : "Procédural";
      out.push(`- **Type** : ${typeStr}`);
      out.push(`- **Catégorie** : ${t.category}`);
      out.push(`- **Groupe migration** : ${migrationGroup(t)}`);
      if (withMeta) out.push(`- **Cardinality** : ideal=${ideal}, min=${minC}, max=${maxC}`);
      out.push(
        `- **Texte testé** (${t.text.length} car., ${countItems(t.text)} items détectés) : \`"${escapeText(t.text)}"\``,
      );
      out.push(`- **Attendu en top 1** : \`${t.expected_template}\``);
      const top1Display = top1
        ? `\`${top1.template_id}\` (${formatScorePct(top1.score)})`
        : r.failureCategory && r.failureCategory !== "mismatch"
          ? `${failureLabel[r.failureCategory]}`
          : "—";
      out.push(`- **Reçu en top 1** : ${top1Display}`);
      out.push(`- **Top 3 candidats** : ${top3str || (r.failureCategory ? failureLabel[r.failureCategory as FailureCategory] : "—")}`);
      out.push(`- **Latence** : ${r.latencyMs ?? "—"} ms${r.latencyMs == null && r.failureCategory ? ` (cause : ${r.failureCategory})` : ""}`);
      out.push(
        `- **Validation** : Longueur ${r.slotsLengthOk == null ? "—" : r.slotsLengthOk ? "OK" : "KO"} · Palette ${r.paletteOk == null ? "—" : r.paletteOk ? "OK" : "KO"}`,
      );
      if (r.status !== "success") {
        out.push(`- **Catégorie d'échec** : \`${r.failureCategory ?? "—"}\``);
        out.push(`- **Détail technique** : ${r.failureDetail ? escapeText(r.failureDetail) : "—"}`);
      }
      out.push(`- **Annotation utilisateur** : ${notes[t.id] || "(aucune)"}`);
      return out.join("\n");
    };

    const failures = inScope
      .map((t, i) => ({ t, r: executed.find((x) => x.id === t.id)!, position: i + 1 }))
      .filter((x) => x.r.status === "fail");
    const warnings = inScope
      .map((t, i) => ({ t, r: executed.find((x) => x.id === t.id)!, position: i + 1 }))
      .filter((x) => x.r.status === "warning");

    lines.push(`## Échecs (${failures.length})`);
    lines.push("");
    failures.forEach(({ t, r, position }) => {
      const top3 = r.suggestions
        .slice(0, 3)
        .map((s) => `\`${s.template_id}\` (${formatScorePct(s.score)}${s.source ? `, ${s.source}` : ""})`)
        .join(" · ");
      const excerpt = t.text.length > 200 ? t.text.slice(0, 200) + "…" : t.text;
      lines.push(`### ❌ ${t.expected_template} · #${position}`);
      lines.push(`- **Attendu** : \`${t.expected_template}\``);
      lines.push(`- **Top 3 reçu** : ${top3 || "—"}`);
      lines.push(`- **Catégorie d'erreur** : \`${r.failureCategory ?? "—"}\``);
      lines.push(`- **Extrait du texte** : "${escapeText(excerpt)}"`);
      lines.push("");
      lines.push(renderDetail(t, r, position));
      lines.push("");
    });
    if (failures.length === 0) {
      lines.push("_Aucun échec._");
      lines.push("");
    }

    lines.push(`## Avertissements (${warnings.length})`);
    lines.push("");
    warnings.forEach(({ t, r, position }) => {
      lines.push(`### ⚠️ ${t.expected_template} · #${position}`);
      lines.push(renderDetail(t, r, position));
      lines.push("");
    });
    if (warnings.length === 0) {
      lines.push("_Aucun avertissement._");
      lines.push("");
    }

    lines.push("## Détail complet de tous les tests exécutés");
    lines.push("");
    inScope.forEach((t, i) => {
      const r = executed.find((x) => x.id === t.id)!;
      const icon = r.status === "success" ? "✅" : r.status === "warning" ? "⚠️" : "❌";
      lines.push(`### ${icon} ${t.expected_template} · #${i + 1}`);
      lines.push(renderDetail(t, r, i + 1, true));
      lines.push("");
    });

    const pending = filteredTests.filter((t) => !executedSet.has(t.id));
    lines.push(`## Tests non exécutés (${pending.length})`);
    lines.push("");
    pending.forEach((t) => {
      lines.push(`- \`${t.expected_template}\` · ${t.category} · ${t.choreme ? "Chorème" : "Procédural"}`);
    });
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push("*Export généré automatiquement par la Suite de tests Krobar.*");

    const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Rapport exporté : ${filename}`);
  };


  const updateNote = (id: number, text: string) => {
    const next = { ...notes, [id]: text };
    setNotes(next);
    saveNotes(next);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card sticky top-0 z-20">
        <div className="px-6 py-4 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-baseline gap-3">
              <h1 className="text-2xl font-black tracking-tight">Suite de tests Krobar</h1>
              <span className="text-sm text-muted-foreground font-mono">
                {completedCount} / {testSuite.length} tests exécutés
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={runAll} disabled={running || corpusLoading || testSuite.length === 0} size="sm">
                {running ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 mr-2" />
                )}
                Lancer la suite
              </Button>
              {paused ? (
                <Button onClick={resume} variant="secondary" size="sm">
                  <Play className="w-4 h-4 mr-2" /> Reprendre
                </Button>
              ) : (
                <Button onClick={pause} disabled={!running} variant="outline" size="sm">
                  <Pause className="w-4 h-4 mr-2" /> Pause
                </Button>
              )}
              <Button onClick={onBack} variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4 mr-2" /> Retour à l'éditeur
              </Button>
            </div>
          </div>

          {corpusLoading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground border rounded-lg px-3 py-2 bg-muted/20">
              <Loader2 className="w-3 h-3 animate-spin" /> Chargement du corpus canonique…
            </div>
          )}
          {corpusError && (
            <div className="flex items-center justify-between gap-3 border border-destructive/40 rounded-lg px-3 py-2 bg-destructive/10 text-sm">
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="w-4 h-4" />
                <span>Impossible de charger le corpus de tests depuis le backend.</span>
                <span className="text-xs text-muted-foreground font-mono">({corpusError})</span>
              </div>
              <Button onClick={loadCorpus} size="sm" variant="outline">
                <RotateCcw className="w-3 h-3 mr-1" /> Réessayer
              </Button>
            </div>
          )}

          <div className="flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-2">
              <Label className="text-xs font-semibold">Palette :</Label>
              <select
                value={paletteKey}
                onChange={(e) => setPaletteKey(e.target.value as keyof typeof palettes)}
                className="text-sm rounded border bg-background px-2 py-1"
              >
                {Object.keys(palettes).map((k) => (
                  <option key={k} value={k}>
                    {paletteLabels[k]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={fastMode} onCheckedChange={setFastMode} id="fast" />
              <Label htmlFor="fast" className="text-xs">
                Mode rapide (1ère suggestion uniquement)
              </Label>
            </div>
          </div>

          {hasAnyCompleted && (
            <div className="rounded-lg border bg-accent/30 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex flex-col gap-1 text-sm">
                <span className="font-bold">
                  Score global : {successCount}/{completedCount} (
                  {completedCount > 0 ? Math.round((successCount / completedCount) * 100) : 0}%)
                </span>
                <span className="text-xs text-muted-foreground font-mono pl-3">
                  ├─ Procéduraux : {procSuccess}/{procDone.length}
                  {procDone.length > 0 && ` (${Math.round((procSuccess / procDone.length) * 100)}%)`}
                </span>
                <span className="text-xs text-muted-foreground font-mono pl-3">
                  └─ Chorèmes&nbsp;&nbsp;&nbsp;: {chorSuccess}/{chorDone.length}
                  {chorDone.length > 0 && ` (${Math.round((chorSuccess / chorDone.length) * 100)}%)`}
                </span>
                <div className="flex gap-3 text-xs mt-1">
                  <span>✅ {successCount}</span>
                  <span>⚠️ {warningCount}</span>
                  <span>❌ {failCount}</span>
                  <span className="text-muted-foreground">
                    ({completedCount}/{testSuite.length} exécutés)
                  </span>
                </div>
              </div>
              <Button
                onClick={exportReport}
                size="sm"
                variant="outline"
                disabled={completedCount === 0}
                title={
                  completedCount === 0
                    ? "Aucun test exécuté"
                    : completedCount < testSuite.length
                      ? `Exporter les ${completedCount}/${testSuite.length} tests exécutés`
                      : undefined
                }
              >
                <Download className="w-4 h-4 mr-2" /> Exporter le rapport
              </Button>
            </div>
          )}

          {/* Barre de filtres */}
          <div className="flex items-center gap-3 flex-wrap text-xs border rounded-lg px-3 py-2 bg-muted/20">
            <span className="font-semibold">Type :</span>
            {([
              ["all", "Tous"],
              ["procedural", "Procéduraux"],
              ["choreme", "Chorèmes"],
              ["A", "Famille A"],
              ["B", "Famille B"],
              ["C", "Famille C"],
            ] as const).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setFilterType(k)}
                className={`px-2 py-0.5 rounded border transition ${
                  filterType === k
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border hover:bg-accent"
                }`}
              >
                {label}
              </button>
            ))}
            <span className="font-semibold ml-2">Catégorie :</span>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="text-xs rounded border bg-background px-2 py-1"
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c === "all" ? "Toutes" : c}
                </option>
              ))}
            </select>
            <span className="font-semibold ml-2">Statut :</span>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
              className="text-xs rounded border bg-background px-2 py-1"
            >
              <option value="all">Tous</option>
              <option value="success">Success</option>
              <option value="mismatch">Mismatch</option>
              <option value="fail">Fail</option>
              <option value="warning">Warning</option>
              <option value="errors">Erreurs</option>
            </select>
            <span className="text-muted-foreground ml-auto">
              {filteredTests.length} affiché{filteredTests.length > 1 ? "s" : ""}
            </span>
          </div>


          <div className="flex items-center gap-3 flex-wrap text-xs border rounded-lg px-3 py-2 bg-muted/30">
            <div className="flex items-center gap-2">
              <Checkbox
                id="select-all"
                checked={allSelected}
                onCheckedChange={(c) => (c ? selectAll() : clearSelection())}
              />
              <Label htmlFor="select-all" className="text-xs cursor-pointer">
                Tout sélectionner
              </Label>
            </div>
            <Button
              onClick={selectNew}
              disabled={newTestIds.size === 0}
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              title={newTestIds.size === 0 ? "Aucun nouveau test détecté" : undefined}
            >
              Sélectionner les nouveaux ({newTestIds.size})
            </Button>
            <Button
              onClick={selectFiltered}
              disabled={filteredTests.length === 0}
              size="sm"
              variant="outline"
              className="h-7 text-xs"
            >
              Sélectionner le filtre actif ({filteredTests.length})
            </Button>
            <span className="text-muted-foreground">
              {selectedIds.size} test{selectedIds.size > 1 ? "s" : ""} sélectionné
              {selectedIds.size > 1 ? "s" : ""}
            </span>
            <Button
              onClick={runSelection}
              disabled={running || selectedIds.size === 0}
              size="sm"
              variant="default"
              className="h-7 text-xs"
            >
              <Play className="w-3 h-3 mr-1" /> Lancer la sélection
            </Button>
            <Button
              onClick={clearSelection}
              disabled={selectedIds.size === 0}
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
            >
              Effacer
            </Button>
          </div>
        </div>
      </header>

      <main className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredTests.map((test) => {
          const r = results.find((x) => x.id === test.id) ?? emptyResult(test.id);
          return (
            <TestCard
              key={test.id}
              test={test}
              result={r}
              note={notes[test.id] || ""}
              selected={selectedIds.has(test.id)}
              onToggleSelect={() => toggleSelected(test.id)}
              onReplay={() => replayOne(test)}
              onZoom={(svg) => setZoom({ id: test.id, svg })}
              onShowFullText={() => setFullText(test)}
              onAnnotate={() => setAnnotateId(test.id)}
            />
          );
        })}
      </main>

      {/* Zoom modal */}
      <Dialog open={!!zoom} onOpenChange={(o) => !o && setZoom(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Aperçu Test {zoom?.id}</DialogTitle>
          </DialogHeader>
          {zoom && (
            <div
              className="w-full bg-card rounded border"
              dangerouslySetInnerHTML={{ __html: zoom.svg }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Full text modal */}
      <Dialog open={!!fullText} onOpenChange={(o) => !o && setFullText(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Texte du Test {fullText?.id}</DialogTitle>
          </DialogHeader>
          <p className="text-sm whitespace-pre-wrap">{fullText?.text}</p>
        </DialogContent>
      </Dialog>

      {/* Annotate modal */}
      <Dialog open={annotateId !== null} onOpenChange={(o) => !o && setAnnotateId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Annoter le Test {annotateId}</DialogTitle>
          </DialogHeader>
          {annotateId !== null && (
            <Textarea
              rows={6}
              value={notes[annotateId] || ""}
              onChange={(e) => updateNote(annotateId, e.target.value)}
              placeholder="Notez vos observations…"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface CardProps {
  test: TestCase;
  result: TestResult;
  note: string;
  selected: boolean;
  onToggleSelect: () => void;
  onReplay: () => void;
  onZoom: (svg: string) => void;
  onShowFullText: () => void;
  onAnnotate: () => void;
}

function TestCard({ test, result, note, selected, onToggleSelect, onReplay, onZoom, onShowFullText, onAnnotate }: CardProps) {
  const [textOpen, setTextOpen] = useState(false);
  const matchBadge = useMemo(() => {
    if (result.matchKind === "exact")
      return <span className="text-xs text-green-700 font-medium">✅ Match attendu</span>;
    if (result.matchKind === "in_top3")
      return <span className="text-xs text-orange-600 font-medium">⚠️ Dans le top 3</span>;
    if (result.matchKind === "miss")
      return <span className="text-xs text-red-600 font-medium">❌ Hors top 3</span>;
    return null;
  }, [result.matchKind]);

  const Pill = ({ ok, label }: { ok: boolean | null; label: string }) => {
    const color =
      ok === true
        ? "bg-green-100 text-green-800 border-green-300"
        : ok === false
        ? "bg-red-100 text-red-800 border-red-300"
        : "bg-muted text-muted-foreground border-border";
    return <span className={`text-[10px] px-1.5 py-0.5 rounded border ${color}`}>{label}</span>;
  };

  const familyColors: Record<ChoremeFamily, { stripe: string; badge: string; dot: string }> = {
    A: { stripe: "border-l-[#1e3a8a]", badge: "bg-[#1e3a8a]/10 text-[#1e3a8a] border-[#1e3a8a]/40", dot: "bg-[#1e3a8a]" },
    B: { stripe: "border-l-[#166534]", badge: "bg-[#166534]/10 text-[#166534] border-[#166534]/40", dot: "bg-[#166534]" },
    C: { stripe: "border-l-[#b45309]", badge: "bg-[#b45309]/10 text-[#b45309] border-[#b45309]/40", dot: "bg-[#b45309]" },
  };
  const fam = test.choreme?.family;
  const stripeClass = fam ? `border-l-[3px] ${familyColors[fam].stripe}` : "";

  return (
    <Card className={`p-3 flex flex-col gap-2 ${stripeClass}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Checkbox
            checked={selected}
            onCheckedChange={onToggleSelect}
            aria-label={`Sélectionner le test ${test.id}`}
          />
          <span className="text-base">{statusIcon[result.status]}</span>
          <div className="min-w-0">
            <div className="text-xs font-bold font-mono truncate">
              {test.expected_template}{" "}
              <span className="text-[10px] text-muted-foreground font-normal">· #{test.id}</span>
            </div>
            <div className="text-[10px] text-muted-foreground truncate">{test.category}</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {typeof test.expected_slot_count === "number" && (
            <span className="text-[10px] px-1.5 py-0.5 rounded border bg-muted text-foreground border-border">
              {test.expected_slot_count} slots attendus
            </span>
          )}
          {test.choreme && fam && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border ${familyColors[fam].badge}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${familyColors[fam].dot}`} />
                    Chorème {test.choreme.code}
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs space-y-1">
                  <div><span className="font-semibold">Triplet :</span> {test.choreme.triplet || "—"}</div>
                  <div>
                    <span className="font-semibold">Processus dominants :</span>{" "}
                    {test.choreme.dominant_processes?.join(", ") || "—"}
                  </div>
                  <div>
                    <span className="font-semibold">Marqueurs :</span>{" "}
                    {(test.choreme.matching_expressions || []).slice(0, 3).join(" · ") || "—"}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <span className="text-[10px] text-muted-foreground">{statusLabel[result.status]}</span>
        </div>
      </div>


      <div className="text-xs">
        <button
          onClick={() => setTextOpen((v) => !v)}
          className="text-[10px] underline text-muted-foreground hover:text-foreground"
        >
          {textOpen ? "Masquer le texte" : "Voir le texte"}
        </button>
        {textOpen && (
          <p className="mt-1 text-muted-foreground whitespace-pre-wrap text-[11px]">
            {test.text}
            {test.text.length > 400 && (
              <button onClick={onShowFullText} className="ml-1 underline text-foreground">
                ouvrir
              </button>
            )}
          </p>
        )}
      </div>

      <button
        onClick={() => result.svgString && onZoom(result.svgString)}
        className="w-full aspect-[4/3] border rounded bg-card overflow-hidden flex items-center justify-center"
        disabled={!result.svgString}
      >
        {result.status === "running" && <Loader2 className="w-5 h-5 animate-spin" />}
        {result.svgString ? (
          <div
            className="w-full h-full"
            dangerouslySetInnerHTML={{ __html: result.svgString }}
          />
        ) : (
          result.status !== "running" && (
            <span className="text-[10px] text-muted-foreground">Pas encore exécuté</span>
          )
        )}
      </button>

      {result.failureCategory && result.failureCategory !== "mismatch" && (
        <div className="text-[10px] text-red-700 bg-red-50 border border-red-200 rounded p-1.5">
          <div className="font-semibold">{failureLabel[result.failureCategory]}</div>
          {result.failureDetail && (
            <div className="text-red-600 mt-0.5 break-words">{result.failureDetail}</div>
          )}
        </div>
      )}

      {result.actualTemplate ? (
        <div className="text-[11px] space-y-1">
          <div className="flex items-center justify-between">
            <span className="font-mono">{result.actualTemplate}</span>
            {result.suggestions[0] && (
              <span className="font-mono text-muted-foreground">
                {formatScorePct(result.suggestions[0].score)}
              </span>
            )}
          </div>
          {matchBadge}
          <div className="text-[10px] text-muted-foreground">
            Top 3 :{" "}
            {result.suggestions
              .map((s) => `${s.template_id} (${formatScorePct(s.score)}${s.source ? `, ${s.source}` : ""})`)
              .join(" · ")}
          </div>
        </div>
      ) : result.status !== "idle" && result.status !== "running" ? (
        <div className="text-[11px] space-y-1 text-muted-foreground">
          <div>Top 1 reçu : <span className="font-medium text-red-600">{result.failureCategory ? failureLabel[result.failureCategory] : "—"}</span></div>
          <div className="text-[10px]">Top 3 : {result.failureCategory ? failureLabel[result.failureCategory] : "—"}</div>
        </div>
      ) : null}

      {result.status !== "idle" && result.status !== "running" && (
        <div className="flex flex-wrap gap-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Pill ok={result.latencyMs !== null} label={`⏱ ${result.latencyMs ?? "—"}ms`} />
                </span>
              </TooltipTrigger>
              {result.latencyMs == null && result.failureCategory && (
                <TooltipContent className="text-xs">
                  Pas d'appel mesuré (cause : {result.failureCategory})
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
          <Pill ok={result.slotsLengthOk} label={`📏 Longueur ${result.slotsLengthOk == null ? "—" : result.slotsLengthOk ? "OK" : "KO"}`} />
          <Pill ok={result.paletteOk} label={`🎨 Palette ${result.paletteOk == null ? "—" : result.paletteOk ? "OK" : "KO"}`} />
        </div>
      )}

      <div className="flex gap-1 pt-1">
        <Button onClick={onReplay} size="sm" variant="outline" className="flex-1 h-7 text-[11px]">
          <RotateCcw className="w-3 h-3 mr-1" /> Rejouer
        </Button>
        <Button onClick={onAnnotate} size="sm" variant="ghost" className="flex-1 h-7 text-[11px]">
          📝 Annoter {note ? "•" : ""}
        </Button>
      </div>
    </Card>
  );
}
