import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Play, Loader2, AlertTriangle, RotateCcw, Trash2, Settings2, ImageOff, ExternalLink, CheckCircle2, AlertCircle, XCircle, Rocket, Eye,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

type Nom = {
  id: string;
  illustration_id: string;
  family_code: string;
  cardinality_code: string;
  regime_code: string;
};

type JobRow = {
  id: string;
  status: string;
  template_id: string | null;
  error_message: string | null;
};

type BatchRow = {
  id: string;
  status: string;
  request_count: number;
  approved_count: number | null;
  failed_count: number | null;
  is_dry_run: boolean;
  cost_estimate_usd: number | null;
  created_at: string;
  label: string | null;
};

const COST_PER_IMAGE_SYNC = 0.04; // mirrors COST_SYNC in supabase/functions/_shared/sicai.ts
const COST_PER_IMAGE_BATCH = 0.02;
const CANONICAL_TOTAL = 72;
const PARALLEL_CAP = 6;

const DEFAULT_COMBOS: Array<[string, string, string]> = [
  // [family_code, cardinality_code, regime_code]
  ["CONCEPTUELLE_SYSTEMIQUE", "UNITAIRE", "CONCRET"],
  ["CONCEPTUELLE_SYSTEMIQUE", "BINAIRE", "SEMI_METAPHORIQUE"],
  ["NARRATIVE_SCENIQUE", "TERNAIRE", "CONCRET"],
  ["DESCRIPTIVE_AMBIANCE", "MULTIPLE", "ABSTRAIT_SYSTEMIQUE"],
  ["PROCEDURALE_SEQUENTIELLE", "TERNAIRE", "CONCRET"],
  ["OPPOSITION_TRANSFORMATION", "BINAIRE", "ABSTRAIT_SYSTEMIQUE"],
];

const FINAL_STATUSES = new Set(["approved", "review_needed", "qc_failed"]);

function statusBadge(status: string) {
  if (status === "approved") return <Badge variant="default" className="gap-1"><CheckCircle2 className="h-3 w-3" /> approved</Badge>;
  if (status === "review_needed") return <Badge variant="secondary" className="gap-1"><AlertCircle className="h-3 w-3" /> review</Badge>;
  if (status === "qc_failed") return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> failed</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

async function withConcurrency<T>(items: T[], cap: number, fn: (item: T) => Promise<unknown>): Promise<void> {
  let idx = 0;
  const workers = Array.from({ length: Math.min(cap, items.length) }, async () => {
    while (true) {
      const i = idx++;
      if (i >= items.length) return;
      try { await fn(items[i]); } catch (e) { console.error("worker error", e); }
    }
  });
  await Promise.all(workers);
}

type Props = {
  themeId: string | null;
  themeCode: string;
  hasContent: boolean; // lexicon non-empty OR manual prompt_bloc_addition non-empty
  onBeforeLaunch?: () => Promise<boolean>; // returns false to abort
};

export default function SicaiDryRunSection({ themeId, themeCode, hasContent, onBeforeLaunch }: Props) {
  const navigate = useNavigate();

  const [nomenclature, setNomenclature] = useState<Nom[]>([]);
  const [loadingNom, setLoadingNom] = useState(true);
  const [resolveWarning, setResolveWarning] = useState<string | null>(null);

  const [selected, setSelected] = useState<Nom[]>([]);
  const [selectorOpen, setSelectorOpen] = useState(false);

  const [batchId, setBatchId] = useState<string | null>(null);
  const [batch, setBatch] = useState<BatchRow | null>(null);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<"" | "creating" | "dispatching" | "polling" | "postprocessing" | "done">("");
  const pollTimer = useRef<number | null>(null);

  const [confirmFullOpen, setConfirmFullOpen] = useState(false);
  const [launchingFull, setLaunchingFull] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);

  // Restore last dry-run for this theme
  const storageKey = themeId ? `sicai_dryrun:${themeId}` : null;

  /* ---------- Load nomenclature & resolve defaults ---------- */
  useEffect(() => {
    (async () => {
      setLoadingNom(true);
      try {
        const { data, error } = await supabase
          .from("sicai_templates")
          .select("id, illustration_id, family_code, cardinality_code, regime_code")
          .order("family_code").order("cardinality_code").order("regime_code");
        if (error) throw error;
        const nom = (data ?? []) as Nom[];
        setNomenclature(nom);

        // Resolve defaults
        const warns: string[] = [];
        const picked: Nom[] = [];
        const usedIds = new Set<string>();
        for (const [fam, card, reg] of DEFAULT_COMBOS) {
          const exact = nom.find((n) =>
            n.family_code === fam && n.cardinality_code === card && n.regime_code === reg && !usedIds.has(n.id));
          if (exact) { picked.push(exact); usedIds.add(exact.id); continue; }
          // Fallback: any in same family not already used
          const fallback = nom.find((n) => n.family_code === fam && !usedIds.has(n.id));
          if (fallback) {
            picked.push(fallback); usedIds.add(fallback.id);
            warns.push(`Combo ${fam}×${card}×${reg} absent → fallback ${fallback.illustration_id}`);
          } else {
            warns.push(`Famille ${fam} absente de la nomenclature — combo ignoré`);
          }
        }
        setSelected(picked);
        setResolveWarning(warns.length > 0 ? warns.join(" · ") : null);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur chargement nomenclature");
      } finally {
        setLoadingNom(false);
      }
    })();
  }, []);

  /* ---------- Restore previous batch from localStorage ---------- */
  useEffect(() => {
    if (!storageKey) return;
    const prev = localStorage.getItem(storageKey);
    if (prev && prev !== batchId) {
      // Verify the batch still exists before adopting
      (async () => {
        const { data } = await supabase.from("sicai_generation_batches")
          .select("id").eq("id", prev).eq("is_dry_run", true).maybeSingle();
        if (data) setBatchId(prev);
        else localStorage.removeItem(storageKey);
      })();
    }
  }, [storageKey]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- Load batch + jobs + previews ---------- */
  const loadBatch = useCallback(async () => {
    if (!batchId) { setBatch(null); setJobs([]); setPreviews({}); return; }
    const { data: b } = await supabase.from("sicai_generation_batches")
      .select("id, status, request_count, approved_count, failed_count, is_dry_run, cost_estimate_usd, created_at, label")
      .eq("id", batchId).maybeSingle();
    if (!b) { setBatch(null); setJobs([]); setPreviews({}); return; }
    setBatch(b as BatchRow);
    const { data: js } = await supabase.from("sicai_generation_jobs")
      .select("id, status, template_id, error_message").eq("batch_id", batchId);
    const jobsList = (js ?? []) as JobRow[];
    setJobs(jobsList);

    if (jobsList.length > 0) {
      const { data: assets } = await supabase.from("sicai_assets")
        .select("job_id, storage_path, asset_kind")
        .in("asset_kind", ["png_normalized", "png_master"])
        .in("job_id", jobsList.map((j) => j.id));
      const chosen: Record<string, string> = {};
      for (const a of assets ?? []) if (a.asset_kind === "png_normalized") chosen[a.job_id] = a.storage_path;
      for (const a of assets ?? []) if (a.asset_kind === "png_master" && !chosen[a.job_id]) chosen[a.job_id] = a.storage_path;
      const signed = await Promise.allSettled(
        Object.entries(chosen).map(async ([job_id, path]) => {
          const { data: s } = await supabase.storage.from("sicai-assets").createSignedUrl(path, 3600);
          return { job_id, url: s?.signedUrl };
        }),
      );
      const next: Record<string, string> = {};
      for (const r of signed) if (r.status === "fulfilled" && r.value.url) next[r.value.job_id] = r.value.url;
      setPreviews(next);
    } else setPreviews({});
  }, [batchId]);

  useEffect(() => { loadBatch(); }, [loadBatch]);

  /* ---------- Map jobs to nomenclature for display ---------- */
  const nomByTplId = useMemo(() => {
    const m = new Map<string, Nom>();
    for (const n of nomenclature) m.set(n.id, n);
    return m;
  }, [nomenclature]);

  /* ---------- Launch dry-run ---------- */
  const canLaunch =
    !!themeId && !running && hasContent && selected.length >= 1 && selected.length <= 12 && !loadingNom;

  const launchDryRun = async () => {
    if (!themeId) return toast.error("Enregistrez le thème avant de lancer un dry-run.");
    if (!hasContent) return toast.error("Lexique vide et Bloc 0.5 manuel vide — dry-run inutile.");

    setRunning(true);
    setPhase("creating");
    try {
      const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 16);
      const label = `DRY-RUN ${themeCode} ${ts}`;

      const { data: created, error: cErr } = await supabase.functions.invoke("sicai-create-generation-batch", {
        body: {
          theme_id: themeId,
          template_ids: selected.map((s) => s.id),
          batch_mode: "sync",
          is_dry_run: true,
          label,
        },
      });
      if (cErr) throw new Error(cErr.message);
      const newBatchId: string = created.batch_id;
      setBatchId(newBatchId);
      if (storageKey) localStorage.setItem(storageKey, newBatchId);

      // Fetch jobs to dispatch
      const { data: js } = await supabase.from("sicai_generation_jobs")
        .select("id").eq("batch_id", newBatchId);
      const jobIds = (js ?? []).map((j) => j.id);

      setPhase("dispatching");
      await withConcurrency(jobIds, PARALLEL_CAP, async (jobId) => {
        await supabase.functions.invoke("sicai-dispatch-openai", {
          body: { batch_id: newBatchId, job_id: jobId },
        });
      });

      // Poll until all final
      setPhase("polling");
      await pollUntilDone(newBatchId, jobIds.length, "generated");

      // Postprocess (may need multiple calls if limit=8 < count, but 6 ≤ 8 OK)
      setPhase("postprocessing");
      await supabase.functions.invoke("sicai-postprocess-batch", {
        body: { batch_id: newBatchId, limit: jobIds.length, continue_until_done: true },
      });

      // Poll for final QC statuses
      await pollUntilDone(newBatchId, jobIds.length, "final");

      setPhase("done");
      await loadBatch();
      toast.success("Dry-run terminé");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec du dry-run");
      setPhase("");
    } finally {
      setRunning(false);
    }
  };

  // Poll until all jobs reach target state (or "final" QC states)
  const pollUntilDone = (bid: string, expected: number, target: "generated" | "final") =>
    new Promise<void>((resolve, reject) => {
      let tries = 0;
      const tick = async () => {
        tries++;
        try {
          const { data: js } = await supabase.from("sicai_generation_jobs")
            .select("id, status").eq("batch_id", bid);
          const allJobs = (js ?? []) as Array<{ id: string; status: string }>;
          // Refresh visible jobs
          setJobs((prev) => {
            const map = new Map(prev.map((j) => [j.id, j]));
            for (const aj of allJobs) {
              const ex = map.get(aj.id);
              map.set(aj.id, ex ? { ...ex, status: aj.status } : { id: aj.id, status: aj.status, template_id: null, error_message: null });
            }
            return Array.from(map.values());
          });
          const done = target === "generated"
            ? allJobs.filter((j) => j.status === "generated" || j.status === "qc_failed").length
            : allJobs.filter((j) => FINAL_STATUSES.has(j.status)).length;
          if (done >= expected) return resolve();
          if (tries > 120) return reject(new Error("Timeout polling"));
          pollTimer.current = window.setTimeout(tick, 2000);
        } catch (e) { reject(e); }
      };
      tick();
    });

  useEffect(() => () => { if (pollTimer.current) clearTimeout(pollTimer.current); }, []);

  /* ---------- Delete current dry-run ---------- */
  const deleteCurrentDryRun = async () => {
    if (!batchId) return;
    try {
      // 1. Collect storage_paths
      const { data: js } = await supabase.from("sicai_generation_jobs")
        .select("id").eq("batch_id", batchId);
      const jobIds = (js ?? []).map((j) => j.id);
      let paths: string[] = [];
      if (jobIds.length > 0) {
        const { data: assets } = await supabase.from("sicai_assets")
          .select("storage_path").in("job_id", jobIds);
        paths = (assets ?? []).map((a) => a.storage_path).filter(Boolean);
      }
      // 2. Delete batch (CASCADE jobs + assets rows)
      const { error: dErr } = await supabase.from("sicai_generation_batches")
        .delete().eq("id", batchId);
      if (dErr) throw dErr;
      // 3. Cleanup storage
      if (paths.length > 0) {
        const { error: rmErr } = await supabase.storage.from("sicai-assets").remove(paths);
        if (rmErr) console.warn("storage cleanup partial:", rmErr.message);
      }
      if (storageKey) localStorage.removeItem(storageKey);
      setBatchId(null); setBatch(null); setJobs([]); setPreviews({});
      toast.success("Dry-run effacé");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec suppression");
    }
  };

  /* ---------- Delete all dry-runs of this theme ---------- */
  const deleteAllDryRuns = async () => {
    if (!themeId) return;
    setDeletingAll(true);
    try {
      const { data: bs } = await supabase.from("sicai_generation_batches")
        .select("id").eq("theme_id", themeId).eq("is_dry_run", true);
      const bIds = (bs ?? []).map((b) => b.id);
      if (bIds.length === 0) { toast.info("Aucun dry-run à supprimer"); return; }

      const { data: js } = await supabase.from("sicai_generation_jobs")
        .select("id").in("batch_id", bIds);
      const jobIds = (js ?? []).map((j) => j.id);
      let paths: string[] = [];
      if (jobIds.length > 0) {
        const { data: assets } = await supabase.from("sicai_assets")
          .select("storage_path").in("job_id", jobIds);
        paths = (assets ?? []).map((a) => a.storage_path).filter(Boolean);
      }
      const { error: dErr } = await supabase.from("sicai_generation_batches")
        .delete().in("id", bIds);
      if (dErr) throw dErr;
      if (paths.length > 0) await supabase.storage.from("sicai-assets").remove(paths);
      if (storageKey) localStorage.removeItem(storageKey);
      setBatchId(null); setBatch(null); setJobs([]); setPreviews({});
      toast.success(`${bIds.length} dry-run(s) effacé(s)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec suppression globale");
    } finally {
      setDeletingAll(false);
    }
  };

  /* ---------- Launch full batch (72 templates) ---------- */
  const launchFullBatch = async () => {
    if (!themeId) return;
    setLaunchingFull(true);
    try {
      const { data, error } = await supabase.functions.invoke("sicai-create-generation-batch", {
        body: {
          theme_id: themeId,
          batch_mode: "openai_batch",
          is_dry_run: false,
          label: `Batch ${themeCode} ${new Date().toISOString().slice(0, 16)}`,
        },
      });
      if (error) throw new Error(error.message);
      toast.success(`Batch créé (${data.request_count} jobs)`);
      setConfirmFullOpen(false);
      // Redirect to batches tab
      navigate(`/admin/sicai/templates?tab=batches&batch=${data.batch_id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec création batch complet");
    } finally {
      setLaunchingFull(false);
    }
  };

  /* ---------- Render ---------- */

  const dryRunCost = (selected.length * COST_PER_IMAGE_SYNC).toFixed(2);
  const fullCost = (CANONICAL_TOTAL * COST_PER_IMAGE_BATCH).toFixed(2);
  const finalCount = jobs.filter((j) => FINAL_STATUSES.has(j.status)).length;
  const generatedCount = jobs.filter((j) => j.status === "generated" || FINAL_STATUSES.has(j.status)).length;
  const expected = batch?.request_count ?? jobs.length ?? selected.length;

  return (
    <div className="grid gap-4">
      {/* Status / context */}
      {!themeId && (
        <div className="text-xs text-muted-foreground border border-dashed rounded-md p-3">
          Enregistrez le thème pour activer le dry-run (un batch doit pouvoir être lié à un id de thème).
        </div>
      )}
      {themeId && !hasContent && (
        <div className="text-xs text-muted-foreground border border-dashed rounded-md p-3">
          Lexique vide et Bloc 0.5 manuel vide — le dry-run serait équivalent au thème neutre. Ajoutez au moins une catégorie de lexique ou un Bloc 0.5 manuel.
        </div>
      )}

      {/* Selection summary */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-sm">
          <span className="font-medium">{selected.length}</span> template{selected.length > 1 ? "s" : ""} de test
          {loadingNom && <Loader2 className="h-3 w-3 inline ml-2 animate-spin text-muted-foreground" />}
        </div>
        <Button variant="outline" size="sm" onClick={() => setSelectorOpen(true)} disabled={loadingNom}>
          <Settings2 className="h-3.5 w-3.5 mr-1" /> Modifier la sélection
        </Button>
        {batchId && !running && (
          <Button variant="ghost" size="sm" onClick={loadBatch}>
            <Eye className="h-3.5 w-3.5 mr-1" /> Voir le dernier dry-run
          </Button>
        )}
        <div className="ml-auto">
          <Button onClick={launchDryRun} disabled={!canLaunch}>
            {running ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Play className="h-4 w-4 mr-1" />}
            Lancer dry-run (~{dryRunCost} $, ~2 min, mode sync)
          </Button>
        </div>
      </div>

      {resolveWarning && (
        <div className="text-xs flex items-start gap-2 text-amber-700 dark:text-amber-400 border border-amber-300/40 bg-amber-50/40 dark:bg-amber-950/20 rounded-md p-2">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>{resolveWarning}</span>
        </div>
      )}

      {/* Selected templates list (compact) */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((s) => (
            <Badge key={s.id} variant="outline" className="text-[10px] font-mono">
              {s.illustration_id}
            </Badge>
          ))}
        </div>
      )}

      {/* Progress */}
      {running && (
        <div className="border rounded-md p-3 text-sm flex items-center gap-3">
          <Loader2 className="h-4 w-4 animate-spin" />
          <div className="flex-1">
            <div>
              {phase === "creating" && "Création du batch…"}
              {phase === "dispatching" && `Génération OpenAI : ${generatedCount}/${expected}`}
              {phase === "polling" && `Génération OpenAI : ${generatedCount}/${expected}`}
              {phase === "postprocessing" && `Post-traitement & QC : ${finalCount}/${expected}`}
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {batch && (
        <div className="grid gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">{batch.label}</Badge>
            <span>Statut : {batch.status}</span>
            <span>· {finalCount}/{batch.request_count} QC terminé</span>
            <span>· coût est. {Number(batch.cost_estimate_usd ?? 0).toFixed(2)} $</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {jobs.map((j) => {
              const tpl = j.template_id ? nomByTplId.get(j.template_id) : undefined;
              const url = previews[j.id];
              return (
                <div key={j.id} className="border rounded-md overflow-hidden bg-card">
                  <div className="aspect-[3/2] bg-muted flex items-center justify-center">
                    {url ? (
                      <img src={url} alt={tpl?.illustration_id ?? j.id} className="w-full h-full object-contain" />
                    ) : (
                      <div className="flex flex-col items-center gap-1 text-muted-foreground text-xs">
                        <ImageOff className="h-6 w-6" />
                        <span>{j.status}</span>
                      </div>
                    )}
                  </div>
                  <div className="p-2 grid gap-1">
                    <div className="text-[11px] font-mono truncate" title={tpl?.illustration_id}>
                      {tpl ? `${tpl.family_code} × ${tpl.cardinality_code} × ${tpl.regime_code}` : "—"}
                    </div>
                    <div className="flex items-center justify-between gap-1">
                      {statusBadge(j.status)}
                      {tpl && (
                        <Link
                          to={`/admin/sicai/templates/detail/${tpl.id}?batch=${batch.id}`}
                          className="text-[11px] inline-flex items-center gap-0.5 text-primary hover:underline"
                        >
                          détail <ExternalLink className="h-3 w-3" />
                        </Link>
                      )}
                    </div>
                    {j.error_message && (
                      <div className="text-[10px] text-destructive line-clamp-2" title={j.error_message}>
                        {j.error_message}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Action buttons */}
          {!running && (
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => { setBatchId(null); setBatch(null); setJobs([]); setPreviews({}); }}>
                <RotateCcw className="h-3.5 w-3.5 mr-1" /> Ajuster le thème
              </Button>
              <Button size="sm" onClick={() => setConfirmFullOpen(true)} disabled={!themeId}>
                <Rocket className="h-3.5 w-3.5 mr-1" /> Lancer le batch complet (~{fullCost} $, ~15 min)
              </Button>
              <Button variant="destructive" size="sm" onClick={deleteCurrentDryRun} className="ml-auto">
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Effacer ce dry-run
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Cleanup all */}
      {themeId && (
        <div className="pt-2 mt-1 border-t flex justify-end">
          <Button variant="ghost" size="sm" onClick={deleteAllDryRuns} disabled={deletingAll}>
            {deletingAll ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 mr-1" />}
            Effacer tous les dry-runs de ce thème
          </Button>
        </div>
      )}

      {/* Selector modal */}
      <SelectorDialog
        open={selectorOpen}
        onClose={() => setSelectorOpen(false)}
        nomenclature={nomenclature}
        initial={selected.map((s) => s.id)}
        onSubmit={(ids) => {
          const map = new Map(nomenclature.map((n) => [n.id, n]));
          setSelected(ids.map((id) => map.get(id)!).filter(Boolean));
          setSelectorOpen(false);
        }}
      />

      {/* Confirm full batch */}
      <Dialog open={confirmFullOpen} onOpenChange={setConfirmFullOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lancer le batch complet ?</DialogTitle>
            <DialogDescription>
              Génère les <strong>{CANONICAL_TOTAL} templates</strong> de la matrice SICAI avec le thème <code>{themeCode}</code> via OpenAI Batch API (50 % off).
              Coût estimé : <strong>~{fullCost} $</strong> · délai : jusqu'à 15 min (souvent moins).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmFullOpen(false)}>Annuler</Button>
            <Button onClick={launchFullBatch} disabled={launchingFull}>
              {launchingFull ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Rocket className="h-4 w-4 mr-1" />}
              Confirmer & lancer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------- Selector dialog ---------- */

function SelectorDialog({
  open, onClose, nomenclature, initial, onSubmit,
}: {
  open: boolean; onClose: () => void; nomenclature: Nom[]; initial: string[];
  onSubmit: (ids: string[]) => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set(initial));
  useEffect(() => { if (open) setPicked(new Set(initial)); }, [open, initial.join(",")]); // eslint-disable-line

  const groups = useMemo(() => {
    const m = new Map<string, Nom[]>();
    for (const n of nomenclature) {
      const arr = m.get(n.family_code) ?? [];
      arr.push(n); m.set(n.family_code, arr);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [nomenclature]);

  const toggle = (id: string) => {
    const s = new Set(picked);
    if (s.has(id)) s.delete(id);
    else { if (s.size >= 12) return; s.add(id); }
    setPicked(s);
  };

  const count = picked.size;
  const valid = count >= 1 && count <= 12;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Sélection des templates de test</DialogTitle>
          <DialogDescription>
            Choisir entre 1 et 12 templates. Sélection actuelle : <strong>{count}/12</strong>.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-auto grid gap-4">
          {groups.map(([fam, list]) => (
            <div key={fam}>
              <div className="text-xs font-semibold mb-1 sticky top-0 bg-background py-1">
                {fam} <span className="text-muted-foreground font-normal">({list.length})</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                {list.map((n) => {
                  const on = picked.has(n.id);
                  return (
                    <label key={n.id} className={`flex items-center gap-2 text-xs border rounded-md px-2 py-1.5 cursor-pointer ${on ? "bg-primary/10 border-primary/40" : "hover:bg-muted/40"}`}>
                      <input type="checkbox" checked={on} onChange={() => toggle(n.id)} />
                      <span className="font-mono truncate">{n.illustration_id}</span>
                      <span className="ml-auto text-muted-foreground">{n.cardinality_code} · {n.regime_code}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={() => onSubmit(Array.from(picked))} disabled={!valid}>
            Valider ({count})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
