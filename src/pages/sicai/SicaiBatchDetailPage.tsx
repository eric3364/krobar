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
import { ArrowLeft, Loader2, RefreshCw, RotateCw, Wand2 } from "lucide-react";

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
  qc_failed: "destructive",
};

export default function SicaiBatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [batch, setBatch] = useState<Batch | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

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

      // 3. Signed URLs for png_master previews — parallel, fault-tolerant
      const generatedIds = mapped.filter((j) => j.status === "generated").map((j) => j.id);
      if (generatedIds.length > 0) {
        const { data: assets } = await supabase.from("sicai_assets")
          .select("job_id, storage_path").eq("asset_kind", "png_master").in("job_id", generatedIds);
        const settled = await Promise.allSettled(
          (assets ?? []).map(async (a) => {
            const { data: signed } = await supabase.storage
              .from("sicai-assets").createSignedUrl(a.storage_path, 3600);
            return { job_id: a.job_id, url: signed?.signedUrl };
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
                  <Button size="sm" variant="secondary" onClick={runPostprocess} disabled={busy !== null}>
                    {busy === "post" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                    Post-traiter (8)
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
              <div><span className="text-muted-foreground">OK / Err :</span> {batch.approved_count ?? 0} / {batch.failed_count ?? 0}</div>
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-6"><Loader2 className="w-4 h-4 animate-spin inline" /></TableCell></TableRow>
              ) : jobs.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Aucun job.</TableCell></TableRow>
              ) : jobs.map((j) => (
                <TableRow key={j.id}>
                  <TableCell className="font-mono text-xs">{j.custom_id}</TableCell>
                  <TableCell className="text-xs">{j.template?.illustration_id ?? "—"}</TableCell>
                  <TableCell><Badge variant={STATUS_COLORS[j.status] ?? "outline"}>{j.status}</Badge></TableCell>
                  <TableCell className="text-xs">{j.retry_count ?? 0}</TableCell>
                  <TableCell className="text-xs max-w-[300px]">
                    {j.error_code && <Badge variant="destructive" className="mr-1 text-[10px]">{j.error_code}</Badge>}
                    <span className="text-muted-foreground line-clamp-2">{j.error_message}</span>
                  </TableCell>
                  <TableCell>
                    {previews[j.id] ? (
                      <a href={previews[j.id]} target="_blank" rel="noreferrer" className="block">
                        <img src={previews[j.id]} alt={j.custom_id} className="w-24 h-14 object-cover border rounded" />
                      </a>
                    ) : (
                      <div className="w-24 h-14 border border-dashed rounded grid place-items-center text-[10px] text-muted-foreground">—</div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
    </>
  );
}
