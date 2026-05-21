import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Loader2, RefreshCw, RotateCw, Wand2, Zap } from "lucide-react";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Job = {
  id: string;
  custom_id: string;
  template_id: string;
  status: string;
  retry_count: number | null;
  error_code: string | null;
  error_message: string | null;
  revised_prompt: string | null;
  template?: { illustration_id: string } | null;
};

type Batch = {
  id: string;
  label: string | null;
  batch_mode: string;
  status: string;
  request_count: number;
  approved_count: number | null;
  failed_count: number | null;
  cost_estimate_usd: number | null;
  cost_actual_usd: number | null;
  openai_batch_id: string | null;
  created_at: string;
};

const STATUS_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  queued: "outline",
  generating: "secondary",
  generated: "default",
  approved: "default",
  review_needed: "secondary",
  qc_failed: "destructive",
};

export default function SicaiBatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [batch, setBatch] = useState<Batch | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [postAllProgress, setPostAllProgress] = useState<{ done: number; total: number } | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      // 1. Batch + jobs (no PostgREST join — no FK declared)
      const [{ data: b, error: be }, { data: js, error: je }] = await Promise.all([
        supabase.from("sicai_generation_batches").select("*").eq("id", id).maybeSingle(),
        supabase.from("sicai_generation_jobs")
          .select("id, custom_id, template_id, status, retry_count, error_code, error_message, revised_prompt")
          .eq("batch_id", id)
          .order("custom_id"),
      ]);
      if (be) toast.error(be.message);
      if (je) toast.error(je.message);
      setBatch((b as Batch) ?? null);
      const rawJobs = (js ?? []) as any[];

      // 2. Templates (separate query, indexed by id)
      const templateIds = Array.from(new Set(rawJobs.map((j) => j.template_id).filter(Boolean)));
      let templateMap: Record<string, { illustration_id: string }> = {};
      if (templateIds.length > 0) {
        const { data: tpls } = await supabase
          .from("sicai_templates")
          .select("id, illustration_id")
          .in("id", templateIds);
        for (const t of tpls ?? []) templateMap[t.id] = { illustration_id: t.illustration_id };
      }
      const mapped: Job[] = rawJobs.map((j) => ({ ...j, template: templateMap[j.template_id] ?? null }));
      setJobs(mapped);

      // 3. Signed URLs for previews — prefer png_normalized (post-processed), fallback png_master
      const allIds = mapped.map((j) => j.id);
      if (allIds.length > 0) {
        const { data: assets } = await supabase.from("sicai_assets")
          .select("job_id, storage_path, asset_kind")
          .in("asset_kind", ["png_normalized", "png_master"])
          .in("job_id", allIds);
        const chosen: Record<string, string> = {};
        for (const a of assets ?? []) {
          if (a.asset_kind === "png_normalized") chosen[a.job_id] = a.storage_path;
        }
        for (const a of assets ?? []) {
          if (a.asset_kind === "png_master" && !chosen[a.job_id]) chosen[a.job_id] = a.storage_path;
        }
        const settled = await Promise.allSettled(
          Object.entries(chosen).map(async ([job_id, path]) => {
            const { data: signed } = await supabase.storage
              .from("sicai-assets").createSignedUrl(path, 3600);
            return { job_id, url: signed?.signedUrl };
          })
        );
        const next: Record<string, string> = {};
        for (const r of settled) {
          if (r.status === "fulfilled" && r.value.url) next[r.value.job_id] = r.value.url;
        }
        setPreviews(next);
      } else {
        setPreviews({});
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Échec du chargement du batch");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const poll = async () => {
    if (!id) return;
    setBusy("poll");
    try {
      const { data, error } = await supabase.functions.invoke("sicai-poll-openai-batch", { body: { batch_id: id } });
      if (error) throw new Error(error.message);
      toast.success(`Poll : ${data.openai_status}`);
      await load();
    } catch (e: any) { toast.error(e?.message ?? "Échec poll"); }
    finally { setBusy(null); }
  };

  const regenFailed = async () => {
    if (!id || !batch) return;
    const failedIds = jobs.filter((j) => j.status === "qc_failed").map((j) => j.template_id);
    if (failedIds.length === 0) return;
    setBusy("regen");
    try {
      const { data, error } = await supabase.functions.invoke("sicai-create-generation-batch", {
        body: {
          label: `${batch.label ?? "Batch"} — relance échecs`,
          batch_mode: batch.batch_mode,
          template_ids: failedIds,
        },
      });
      if (error) throw new Error(error.message);
      toast.success(`Nouveau batch créé avec ${data.request_count} jobs`);
    } catch (e: any) { toast.error(e?.message ?? "Échec relance"); }
    finally { setBusy(null); }
  };
  const pollProgress = useCallback(async () => {
    if (!id) return { total: 0, remaining: 0, approved: 0, review: 0, failed: 0 };
    const [{ count: total }, { count: remaining }, { count: approved }, { count: review }, { count: failed }] =
      await Promise.all([
        supabase.from("sicai_generation_jobs").select("id", { count: "exact", head: true }).eq("batch_id", id),
        supabase.from("sicai_generation_jobs").select("id", { count: "exact", head: true }).eq("batch_id", id).in("status", ["generated", "qc_pending"]),
        supabase.from("sicai_generation_jobs").select("id", { count: "exact", head: true }).eq("batch_id", id).eq("status", "approved"),
        supabase.from("sicai_generation_jobs").select("id", { count: "exact", head: true }).eq("batch_id", id).eq("status", "review_needed"),
        supabase.from("sicai_generation_jobs").select("id", { count: "exact", head: true }).eq("batch_id", id).eq("status", "qc_failed"),
      ]);
    return { total: total ?? 0, remaining: remaining ?? 0, approved: approved ?? 0, review: review ?? 0, failed: failed ?? 0 };
  }, [id]);

  // Server-side chain: kick once, then poll DB. Survives tab closes.
  const postAll = async () => {
    if (!id || busy === "postAll") return;
    setBusy("postAll");
    try {
      const { error } = await supabase.functions.invoke("sicai-postprocess-batch", {
        body: { batch_id: id, limit: 8, continue_until_done: true },
      });
      if (error) throw new Error(error.message);
      toast.success("Post-traitement démarré en arrière-plan — vous pouvez quitter cette page.");
    } catch (e: any) {
      toast.error(`Échec démarrage : ${e?.message ?? "erreur"}`);
      setBusy(null);
    }
  };

  // Auto-poll DB whenever jobs remain in 'generated'/'qc_pending'. Detects an
  // in-progress chain even if it was started in a previous session.
  useEffect(() => {
    if (!id) return;
    let stopped = false;
    let prevRemaining = Infinity;
    let stableTicks = 0;
    const tick = async () => {
      if (stopped) return;
      try {
        const s = await pollProgress();
        if (stopped) return;
        setPostAllProgress({ done: Math.max(0, s.total - s.remaining), total: s.total });
        if (s.remaining > 0) {
          if (busy !== "postAll") setBusy("postAll");
          // Detect stalled chain: same remaining count for ~30s in a row.
          if (s.remaining === prevRemaining) stableTicks++;
          else { stableTicks = 0; prevRemaining = s.remaining; }
        } else {
          if (busy === "postAll") {
            toast.success(`Post-traitement terminé : ${s.approved} approuvés, ${s.review} à reviewer, ${s.failed} échoués`);
            await load();
          }
          setBusy((b) => (b === "postAll" ? null : b));
          setPostAllProgress(null);
          stopped = true;
          return;
        }
        if (stableTicks >= 10) {
          // Likely the chain died — restart it transparently.
          stableTicks = 0;
          supabase.functions.invoke("sicai-postprocess-batch", {
            body: { batch_id: id, limit: 8, continue_until_done: true },
          }).catch(() => {});
        }
      } catch { /* swallow */ }
    };
    // Initial check, then every 3s.
    tick();
    const handle = setInterval(tick, 3000);
    return () => { stopped = true; clearInterval(handle); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, pollProgress]);

  
  const runPostprocess = async () => {
    if (!id) return;
    setBusy("post");
    try {
      const { data, error } = await supabase.functions.invoke("sicai-postprocess-batch", { body: { batch_id: id, limit: 8 } });
      if (error) throw new Error(error.message);
      toast.success(`Post-traitement : ${data.processed} jobs, reste ${data.remaining}`);
      await load();
    } catch (e: any) { toast.error(e?.message ?? "Échec post-traitement"); }
    finally { setBusy(null); }
  };

  const rerunQc = async () => {
    if (!id) return;
    setBusy("qc");
    try {
      const { data, error } = await supabase.functions.invoke("sicai-postprocess-batch", {
        body: { batch_id: id, limit: 12, qc_only: true },
      });
      if (error) throw new Error(error.message);
      toast.success(`QC relancé sur ${data.processed} jobs · OK ${data.approved} · Review ${data.review} · Failed ${data.failed}`);
      await load();
    } catch (e: any) { toast.error(e?.message ?? "Échec relance QC"); }
    finally { setBusy(null); }
  };

  const republishOrphans = async () => {
    if (!id) return;
    setBusy("republish");
    try {
      const { data, error } = await supabase.functions.invoke("sicai-republish-orphans", { body: { batch_id: id } });
      if (error) throw new Error(error.message);
      toast.success(`Rattrapage : ${data.republished} re-publié(s) sur ${data.orphans_found} orphelin(s)${data.failed ? ` · ${data.failed} échec(s)` : ""}`);
      await load();
    } catch (e: any) { toast.error(e?.message ?? "Échec rattrapage"); }
    finally { setBusy(null); }
  };


  return (
    <>
      <Helmet><title>Batch {batch?.label ?? id} — SICAI</title></Helmet>
      <div className="space-y-4 max-w-[1400px]">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/admin/sicai/templates"><ArrowLeft className="w-4 h-4" /> Retour</Link>
          </Button>
        </div>

        {batch && (
          <Card className="p-4 space-y-2">
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div>
                <h1 className="text-xl font-bold">{batch.label ?? "(sans label)"}</h1>
                <div className="text-xs text-muted-foreground">
                  Créé le {new Date(batch.created_at).toLocaleString("fr-FR")}
                </div>
              </div>
              <div className="flex gap-2">
                {batch.status === "running" && batch.batch_mode === "openai_batch" && (
                  <Button size="sm" onClick={poll} disabled={busy !== null}>
                    {busy === "poll" ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Poll OpenAI
                  </Button>
                )}
                {(batch.status === "qc" || batch.status === "running" || batch.status === "completed") && (
                  <>
                    <Button size="sm" variant="secondary" onClick={runPostprocess} disabled={busy !== null}>
                      {busy === "post" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                      Post-traiter (8)
                    </Button>
                    <Button size="sm" variant="default" onClick={postAll} disabled={busy !== null}>
                      {busy === "postAll" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                      {busy === "postAll" && postAllProgress
                        ? `Post-traitement… ${postAllProgress.done}/${postAllProgress.total}`
                        : "Post-traiter tout"}
                    </Button>
                  </>
                )}
                {(batch.status === "qc" || batch.status === "completed") && (
                  <Button size="sm" variant="outline" onClick={rerunQc} disabled={busy !== null}>
                    {busy === "qc" ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Relancer l'inventaire QC (12)
                  </Button>
                )}
                {(batch.status === "qc" || batch.status === "failed") && (
                  <Button size="sm" variant="outline" onClick={regenFailed} disabled={busy !== null}>
                    <RotateCw className="w-4 h-4" /> Régénérer les échecs
                  </Button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div><span className="text-muted-foreground">Mode :</span> <Badge variant="outline">{batch.batch_mode}</Badge></div>
              <div><span className="text-muted-foreground">Statut :</span> <Badge>{batch.status}</Badge></div>
              <div><span className="text-muted-foreground">Jobs :</span> {batch.request_count}</div>
              <div className="col-span-2"><span className="text-muted-foreground">OK / Review / Failed :</span> <strong>{jobs.filter((j) => j.status === "approved").length}</strong> · <strong>{jobs.filter((j) => j.status === "review_needed").length}</strong> · <strong>{jobs.filter((j) => j.status === "qc_failed").length}</strong></div>
              <div><span className="text-muted-foreground">Coût estimé :</span> {batch.cost_estimate_usd?.toFixed(2) ?? "—"} $</div>
              <div><span className="text-muted-foreground">Coût réel :</span> {batch.cost_actual_usd?.toFixed(2) ?? "—"} $</div>
              {batch.openai_batch_id && (
                <div className="col-span-2"><span className="text-muted-foreground">OpenAI batch :</span> <code className="text-xs">{batch.openai_batch_id}</code></div>
              )}
            </div>
          </Card>
        )}

        <Card className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>custom_id</TableHead>
                <TableHead>illustration_id</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Retry</TableHead>
                <TableHead>Erreur</TableHead>
                <TableHead>Preview</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-6"><Loader2 className="w-4 h-4 animate-spin inline" /></TableCell></TableRow>
              ) : jobs.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Aucun job.</TableCell></TableRow>
              ) : jobs.map((j) => {
                const detailUrl = `/admin/sicai/templates/detail/${j.template_id}?batch=${id}`;
                return (
                  <TableRow key={j.id}>
                    <TableCell className="font-mono text-xs">
                      <Link to={detailUrl} className="hover:underline text-primary">{j.custom_id}</Link>
                    </TableCell>
                    <TableCell className="text-xs">{j.template?.illustration_id ?? "—"}</TableCell>
                    <TableCell><Badge variant={STATUS_COLORS[j.status] ?? "outline"}>{j.status}</Badge></TableCell>
                    <TableCell className="text-xs">{j.retry_count ?? 0}</TableCell>
                    <TableCell className="text-xs max-w-[300px]">
                      {j.error_code && <Badge variant="destructive" className="mr-1 text-[10px]">{j.error_code}</Badge>}
                      <span className="text-muted-foreground line-clamp-2">{j.error_message}</span>
                    </TableCell>
                    <TableCell>
                      {previews[j.id] ? (
                        <Link to={detailUrl} className="block">
                          <img src={previews[j.id]} alt={j.custom_id} className="w-24 h-14 object-cover border rounded hover:opacity-80 transition-opacity" />
                        </Link>
                      ) : (
                        <div className="w-24 h-14 border border-dashed rounded grid place-items-center text-[10px] text-muted-foreground">—</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" asChild>
                        <Link to={detailUrl}>Détail</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      </div>
    </>
  );
}
