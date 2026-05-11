import React, { useState, useCallback, useRef } from "react";
import KrobarSvg from "@/components/KrobarSvg";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Download, Play, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type TestCase = {
  template_id: string;
  text: string;
  expected_slots: string[];
  expected_slot_count: number;
  category: string;
};

type BenchmarkResult = {
  id: string;
  status: "OK" | "ANALYZE_FAIL" | "RENDER_FAIL" | "MISSING";
  in_top3: boolean;
  top_position: number; // 0,1,2 or -1
  category: string;
  expected_slots: string[];
  claude_returned_slots: string[];
  filled_slots: string[];
  fill_ratio: number;
  top1_template: string;
  top1_score: number;
  text_used: string;
  svg?: string;
};

type CellStatus = "pending" | "running" | "green" | "lightgreen" | "orange" | "red";

function cellColor(status: CellStatus): string {
  switch (status) {
    case "green": return "bg-green-600 text-white";
    case "lightgreen": return "bg-green-400 text-white";
    case "orange": return "bg-orange-500 text-white";
    case "red": return "bg-red-600 text-white";
    case "running": return "bg-blue-400 text-white animate-pulse";
    default: return "bg-muted text-muted-foreground";
  }
}

function computeCellStatus(r: BenchmarkResult): CellStatus {
  if (r.status === "ANALYZE_FAIL" || r.status === "RENDER_FAIL") return "red";
  if (!r.in_top3) return "red";
  if (r.fill_ratio < 0.3) return "red";
  if (r.fill_ratio < 0.7) return "orange";
  if (r.top_position === 0) return "green";
  return "lightgreen";
}

async function proxyFetch<T>(endpoint: string, method: string, payload?: unknown, retries = 2): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const { data, error } = await supabase.functions.invoke("krobar-proxy", {
      body: { endpoint, method: method.toUpperCase(), payload },
    });
    const errMsg = error?.message || data?.error;
    if (errMsg) {
      const isTimeout = typeof errMsg === "string" && (errMsg.includes("temps") || errMsg.includes("504") || errMsg.includes("timeout"));
      if (isTimeout && attempt < retries) {
        console.warn(`Timeout on ${endpoint}, retry ${attempt + 1}/${retries}…`);
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      throw new Error(errMsg);
    }
    return data as T;
  }
  throw new Error("Max retries reached");
}

export default function BenchmarkPage() {
  const [tests, setTests] = useState<TestCase[]>([]);
  const [results, setResults] = useState<(BenchmarkResult | null)[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const abortRef = useRef(false);

  const loadTests = useCallback(async () => {
    const data = await proxyFetch<{ tests: TestCase[] }>("test-texts", "GET");
    setTests(data.tests);
    setResults(new Array(data.tests.length).fill(null));
    return data.tests;
  }, []);

  const runBenchmark = useCallback(async () => {
    abortRef.current = false;
    setRunning(true);
    setDone(false);
    setProgress(0);

    let cases = tests;
    if (cases.length === 0) {
      cases = await loadTests();
    } else {
      setResults(new Array(cases.length).fill(null));
    }

    const res: (BenchmarkResult | null)[] = new Array(cases.length).fill(null);

    for (let i = 0; i < cases.length; i++) {
      if (abortRef.current) break;
      const tc = cases[i];
      setProgress(i);

      // Mark running
      setResults([...res]);

      let result: BenchmarkResult = {
        id: tc.template_id,
        status: "OK",
        in_top3: false,
        top_position: -1,
        category: tc.category,
        expected_slots: tc.expected_slots,
        claude_returned_slots: [],
        filled_slots: [],
        fill_ratio: 0,
        top1_template: "",
        top1_score: 0,
        text_used: tc.text,
      };

      try {
        // Analyze
        const analyzeRes = await proxyFetch<{ suggestions: { template_id: string; score: number; slots: Record<string, string> }[] }>(
          "analyze", "POST", { text: tc.text, detail_level: "auto" }
        );

        const suggestions = analyzeRes.suggestions || [];
        const topIdx = suggestions.findIndex(s => s.template_id === tc.template_id);
        result.top_position = topIdx >= 0 && topIdx < 3 ? topIdx : -1;
        result.in_top3 = topIdx >= 0 && topIdx < 3;
        result.top1_template = suggestions[0]?.template_id || "";
        result.top1_score = suggestions[0]?.score || 0;

        // Pick suggestion for render
        const chosen = result.in_top3 ? suggestions[topIdx] : suggestions[0];
        if (!chosen) throw new Error("No suggestions");

        result.claude_returned_slots = Object.keys(chosen.slots);

        // Render
        try {
          const renderRes = await proxyFetch<{ svg: string; filled_slots?: string[] }>(
            "render", "POST", { template_id: chosen.template_id, slots: chosen.slots, palette: {} }
          );
          result.svg = renderRes.svg;
          result.filled_slots = renderRes.filled_slots || Object.keys(chosen.slots);
          result.fill_ratio = result.in_top3 ? result.filled_slots.length / tc.expected_slot_count : 0;
          if (!result.in_top3) result.status = "MISSING";
        } catch {
          result.status = "RENDER_FAIL";
        }
      } catch {
        result.status = "ANALYZE_FAIL";
      }

      res[i] = result;
      setResults([...res]);

      if (i < cases.length - 1) {
        await new Promise(r => setTimeout(r, 400));
      }
    }

    setProgress(cases.length);
    setRunning(false);
    setDone(true);
  }, [tests, loadTests]);

  const completedResults = results.filter(Boolean) as BenchmarkResult[];
  const top1 = completedResults.filter(r => r.top_position === 0).length;
  const top23 = completedResults.filter(r => r.top_position === 1 || r.top_position === 2).length;
  const absent = completedResults.filter(r => !r.in_top3).length;
  const fillOk = completedResults.filter(r => r.fill_ratio >= 0.7).length;
  const perfect = completedResults.filter(r => r.top_position === 0 && r.fill_ratio === 1).length;
  const pipelineOk = completedResults.filter(r => r.status === "OK" && r.in_top3 && r.fill_ratio >= 0.7).length;
  const total = tests.length || 49;

  const downloadReport = () => {
    const report = completedResults.map(r => {
      const { svg, ...rest } = r;
      return rest;
    });
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "batch_report_frontend.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const selected = selectedIdx !== null ? results[selectedIdx] : null;

  return (
    <div className="min-h-screen bg-background text-foreground p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Benchmark KROBAR — 49 Templates</h1>

      {/* Summary */}
      {done && (
        <div className="grid grid-cols-3 gap-3 mb-6 text-sm">
          <Stat label="Pipeline OK" value={`${pipelineOk}/${total}`} />
          <Stat label="Top 1" value={`${top1}/${total} (${Math.round(top1/total*100)}%)`} />
          <Stat label="Top 2-3" value={`${top23}/${total}`} />
          <Stat label="Absent top 3" value={`${absent}/${total}`} />
          <Stat label="Fill ≥ 70%" value={`${fillOk}/${total}`} />
          <Stat label="Parfaits (top1+100%)" value={`${perfect}/${total}`} />
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-4 mb-4">
        <Button onClick={runBenchmark} disabled={running}>
          {running ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
          {running ? "En cours…" : "Lancer le benchmark"}
        </Button>
        {done && (
          <Button variant="outline" onClick={downloadReport}>
            <Download className="mr-2 h-4 w-4" /> Télécharger JSON
          </Button>
        )}
      </div>

      {running && (
        <div className="mb-4">
          <p className="text-sm text-muted-foreground mb-1">{progress}/{total} testés</p>
          <Progress value={(progress / total) * 100} className="h-2" />
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-7 gap-1.5 mb-6">
        {Array.from({ length: 49 }).map((_, i) => {
          const r = results[i];
          const tc = tests[i];
          const status: CellStatus = !tc ? "pending" : !r ? (running && i === progress ? "running" : "pending") : computeCellStatus(r);
          const label = tc?.template_id || `#${i + 1}`;

          return (
            <Tooltip key={i}>
              <TooltipTrigger asChild>
                <button
                  className={`rounded p-1.5 text-[10px] leading-tight text-center truncate h-14 flex items-center justify-center cursor-pointer border border-border ${cellColor(status)}`}
                  onClick={() => r?.svg && setSelectedIdx(i)}
                >
                  {label.replace(/_/g, " ")}
                </button>
              </TooltipTrigger>
              {r && (
                <TooltipContent className="max-w-xs text-xs">
                  <p>Position: {r.top_position === -1 ? "absent" : `top ${r.top_position + 1}`}</p>
                  <p>Fill ratio: {Math.round(r.fill_ratio * 100)}%</p>
                  <p>Top 1: {r.top1_template} ({Math.round(r.top1_score * 100)}%)</p>
                  <p>Status: {r.status}</p>
                </TooltipContent>
              )}
            </Tooltip>
          );
        })}
      </div>

      {/* SVG Modal */}
      <Dialog open={selectedIdx !== null} onOpenChange={() => setSelectedIdx(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>{selected?.id}</DialogTitle>
          </DialogHeader>
          {selected?.svg && (
            <KrobarSvg svg={selected.svg} className="w-full" />
          )}
          {selected && (
            <div className="text-xs text-muted-foreground mt-2 space-y-1">
              <p>Fill ratio: {Math.round(selected.fill_ratio * 100)}% — Slots remplis: {selected.filled_slots.join(", ") || "aucun"}</p>
              <p>Slots attendus: {selected.expected_slots.join(", ")}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border p-2">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
