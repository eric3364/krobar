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
import { ArrowLeft, Pause, Play, Download, RotateCcw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { palettes, paletteLabels, type Palette } from "@/palettes";
import { testSuite, type TestCase } from "@/data/test-suite";
import {
  applyPaletteVars,
  callBackend,
  checkPaletteApplied,
  checkSlotsLength,
  fillSlots,
  formatScorePct,
  loadSvg,
  svgToString,
  type Manifest,
  type Suggestion,
} from "@/lib/kroki";

type Status = "idle" | "running" | "success" | "warning" | "fail";

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
  };
}

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
  const [results, setResults] = useState<TestResult[]>(() => {
    try {
      const cached = localStorage.getItem(RESULTS_STORAGE);
      if (cached) return JSON.parse(cached);
    } catch {
      /* ignore */
    }
    return testSuite.map((t) => emptyResult(t.id));
  });
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
    try {
      const { suggestions, latencyMs } = await callBackend(test.text);
      const top = suggestions[0];
      const ids = suggestions.map((s) => s.template_id);
      let matchKind: TestResult["matchKind"] = "miss";
      let status: Status = "fail";
      if (top?.template_id === test.expected_template) {
        matchKind = "exact";
        status = "success";
      } else if (ids.includes(test.expected_template)) {
        matchKind = "in_top3";
        status = "warning";
      }

      // Render the SVG of the actually chosen template via the backend.
      const tpl = manifest.templates.find((t) => t.id === top.template_id);
      let svgString: string | null = null;
      let paletteOk = false;
      if (tpl) {
        const svg = await loadSvg(tpl.file);
        applyPaletteVars(svg, currentPalette);
        fillSlots(svg, top.slots);
        svg.setAttribute("width", "100%");
        svg.setAttribute("height", "100%");
        paletteOk = checkPaletteApplied(svg, currentPalette);
        svgString = svgToString(svg);
      }
      const lengthCheck = checkSlotsLength(top.slots);

      updateResult(test.id, {
        status,
        suggestions,
        actualTemplate: top.template_id,
        matchKind,
        latencyMs,
        svgString,
        slotsLengthOk: lengthCheck.ok,
        slotsOffenders: lengthCheck.offenders,
        paletteOk,
        timestamp: new Date().toISOString(),
        errorMsg: null,
      });
    } catch (e) {
      updateResult(test.id, {
        status: "fail",
        errorMsg: e instanceof Error ? e.message : String(e),
        timestamp: new Date().toISOString(),
      });
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
  };
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
  };

  const replayOne = async (test: TestCase) => {
    await runOne(test, palette);
  };

  const completedCount = results.filter((r) => r.status !== "idle" && r.status !== "running").length;
  const successCount = results.filter((r) => r.status === "success").length;
  const warningCount = results.filter((r) => r.status === "warning").length;
  const failCount = results.filter((r) => r.status === "fail").length;
  const allDone = completedCount === testSuite.length;

  const exportReport = () => {
    const report = {
      generated_at: new Date().toISOString(),
      palette: paletteKey,
      score: { success: successCount, warning: warningCount, fail: failCount, total: testSuite.length },
      results: results.map((r) => {
        const test = testSuite.find((t) => t.id === r.id)!;
        return {
          id: r.id,
          expected_template: test.expected_template,
          actual_template: r.actualTemplate,
          match_kind: r.matchKind,
          status: r.status,
          score: r.suggestions[0]?.score ?? null,
          suggestions: r.suggestions.map((s) => ({
            template_id: s.template_id,
            score: s.score,
          })),
          latency_ms: r.latencyMs,
          slots_length_ok: r.slotsLengthOk,
          slots_offenders: r.slotsOffenders,
          palette_ok: r.paletteOk,
          error: r.errorMsg,
          timestamp: r.timestamp,
        };
      }),
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `krobar-test-report-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
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
              <Button onClick={runAll} disabled={running} size="sm">
                {running ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 mr-2" />
                )}
                Lancer tous les tests
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

          {allDone && (
            <div className="rounded-lg border bg-accent/30 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-4 text-sm">
                <span className="font-bold">
                  Score global : {successCount}/{testSuite.length} (
                  {Math.round((successCount / testSuite.length) * 100)}%)
                </span>
                <span>✅ {successCount} réussis</span>
                <span>⚠️ {warningCount} avertissements</span>
                <span>❌ {failCount} échecs</span>
              </div>
              <Button onClick={exportReport} size="sm" variant="outline">
                <Download className="w-4 h-4 mr-2" /> Exporter le rapport
              </Button>
            </div>
          )}
        </div>
      </header>

      <main className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {testSuite.map((test) => {
          const r = results.find((x) => x.id === test.id) ?? emptyResult(test.id);
          return (
            <TestCard
              key={test.id}
              test={test}
              result={r}
              note={notes[test.id] || ""}
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
  onReplay: () => void;
  onZoom: (svg: string) => void;
  onShowFullText: () => void;
  onAnnotate: () => void;
}

function TestCard({ test, result, note, onReplay, onZoom, onShowFullText, onAnnotate }: CardProps) {
  const truncated = test.text.length > 150 ? test.text.slice(0, 150) + "…" : test.text;
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

  return (
    <Card className="p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">{statusIcon[result.status]}</span>
          <div>
            <div className="text-xs font-bold">Test {test.id}</div>
            <div className="text-[10px] text-muted-foreground font-mono">
              {test.expected_template}
            </div>
          </div>
        </div>
        <span className="text-[10px] text-muted-foreground">{statusLabel[result.status]}</span>
      </div>

      <div className="text-xs text-muted-foreground">
        {truncated}
        {test.text.length > 150 && (
          <button onClick={onShowFullText} className="ml-1 underline text-foreground">
            Voir tout
          </button>
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

      {result.errorMsg && (
        <div className="text-[10px] text-red-600 bg-red-50 border border-red-200 rounded p-1.5">
          {result.errorMsg}
        </div>
      )}

      {result.actualTemplate && (
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
              .map((s) => `${s.template_id} (${formatScorePct(s.score)})`)
              .join(" · ")}
          </div>
        </div>
      )}

      {(result.status === "success" || result.status === "warning") && (
        <div className="flex flex-wrap gap-1">
          <Pill ok={result.latencyMs !== null} label={`⏱ ${result.latencyMs ?? "?"}ms`} />
          <Pill ok={result.slotsLengthOk} label="📏 Longueur OK" />
          <Pill ok={result.paletteOk} label="🎨 Palette OK" />
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
