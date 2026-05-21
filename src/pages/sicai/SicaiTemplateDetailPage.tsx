import { useEffect, useState, useCallback } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, X, RotateCw, Loader2, Copy } from "lucide-react";
import SvgLayoutEditor from "./SvgLayoutEditor";

type Template = {
  id: string;
  illustration_id: string;
  family_code: string;
  family_label: string | null;
  cardinality_code: string;
  cardinality_label: string | null;
  regime_code: string;
  regime_label: string | null;
  status: string;
  prompt_full: string;
  micro_brief: string | null;
  negative_rules: string | null;
  title_placeholder_count: number;
  verbatim_placeholder_count: number;
  visual_anchor_count: number;
};

type Job = {
  id: string;
  custom_id: string;
  status: string;
  retry_count: number | null;
  error_code: string | null;
  error_message: string | null;
  batch_id: string | null;
  created_at: string;
};

type Asset = { asset_kind: string; storage_path: string };
type Check = { check_name: string; check_status: string; score: number | null; details_json: any };

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  approved: "default",
  review_needed: "secondary",
  qc_failed: "destructive",
  qc_pending: "outline",
  generated: "outline",
  published: "default",
  rejected: "destructive",
};

const CHECK_BADGE: Record<string, string> = {
  pass: "bg-green-500/15 text-green-700 border-green-500/30",
  warn: "bg-orange-500/15 text-orange-700 border-orange-500/30",
  fail: "bg-red-500/15 text-red-700 border-red-500/30",
  skipped: "bg-slate-300/30 text-slate-600 border-slate-400/30",
};

export default function SicaiTemplateDetailPage() {
  const { templateId } = useParams<{ templateId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const batchIdParam = searchParams.get("batch");
  const [tpl, setTpl] = useState<Template | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [currentJob, setCurrentJob] = useState<Job | null>(null);
  const [assets, setAssets] = useState<Record<string, string>>({});
  const [checks, setChecks] = useState<Check[]>([]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenPrompt, setRegenPrompt] = useState("");
  const [regenUsePrompt, setRegenUsePrompt] = useState(false);
  const [nextTemplateId, setNextTemplateId] = useState<string | null>(null);
  const [loadingNext, setLoadingNext] = useState(false);
  const [layoutEditing, setLayoutEditing] = useState(false);

  const load = useCallback(async () => {
    if (!templateId) return;
    const { data: t } = await supabase.from("sicai_templates")
      .select("*").eq("id", templateId).maybeSingle();
    setTpl((t as Template) ?? null);

    const { data: js } = await supabase.from("sicai_generation_jobs")
      .select("id, custom_id, status, retry_count, error_code, error_message, batch_id, created_at")
      .eq("template_id", templateId).order("created_at", { ascending: false });
    const list = (js as Job[]) ?? [];
    setJobs(list);

    // Most recent job that has assets (not rejected/queued)
    const current = list.find((j) => !["rejected", "queued", "generating"].includes(j.status)) ?? list[0] ?? null;
    setCurrentJob(current);

    if (current) {
      const { data: a } = await supabase.from("sicai_assets")
        .select("asset_kind, storage_path").eq("job_id", current.id);
      const map: Record<string, string> = {};
      for (const x of (a as Asset[]) ?? []) {
        const { data: signed } = await supabase.storage.from("sicai-assets")
          .createSignedUrl(x.storage_path, 3600);
        if (!signed?.signedUrl) continue;
        if (x.asset_kind === "svg_final") {
          // Re-wrap as blob with explicit svg mime type so the browser renders inline
          // (storage may serve it as application/octet-stream, which triggers download).
          try {
            const res = await fetch(signed.signedUrl);
            const text = await res.text();
            const blob = new Blob([text], { type: "image/svg+xml" });
            map[x.asset_kind] = URL.createObjectURL(blob);
          } catch {
            map[x.asset_kind] = signed.signedUrl;
          }
        } else {
          map[x.asset_kind] = signed.signedUrl;
        }
      }
      setAssets(map);

      const { data: c } = await supabase.from("sicai_qc_checks")
        .select("check_name, check_status, score, details_json").eq("job_id", current.id);
      setChecks((c as Check[]) ?? []);
    } else {
      setAssets({});
      setChecks([]);
    }
  }, [templateId]);

  useEffect(() => { load(); }, [load]);

  // Compute next template to review within the same batch (status à valider, ordre custom_id)
  useEffect(() => {
    const batchId = batchIdParam ?? currentJob?.batch_id ?? null;
    if (!batchId || !currentJob) { setNextTemplateId(null); return; }
    let cancelled = false;
    (async () => {
      setLoadingNext(true);
      const { data } = await supabase
        .from("sicai_generation_jobs")
        .select("template_id, custom_id, status")
        .eq("batch_id", batchId)
        .in("status", ["review_needed", "qc_failed", "generated", "qc_pending"])
        .order("custom_id", { ascending: true });
      if (cancelled) return;
      const rows = (data as { template_id: string; custom_id: string; status: string }[]) ?? [];
      const others = rows.filter((r) => r.template_id !== templateId);
      const after = others.find((r) => r.custom_id > (currentJob.custom_id ?? ""));
      setNextTemplateId((after ?? others[0])?.template_id ?? null);
      setLoadingNext(false);
    })();
    return () => { cancelled = true; };
  }, [batchIdParam, currentJob, templateId]);


  const run = async (fn: string, body: any, key: string) => {
    setBusy(key);
    try {
      const { data, error } = await supabase.functions.invoke(fn, { body });
      if (error) throw new Error(error.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("OK");
      await load();
      return data;
    } catch (e: any) {
      toast.error(e?.message ?? "Échec");
    } finally { setBusy(null); }
  };

  const approve = () => {
    if (!currentJob) return;
    run("sicai-approve-job", { job_id: currentJob.id, notes }, "approve");
  };
  const reject = () => {
    if (!currentJob) return;
    if (!notes.trim()) { toast.error("Notes obligatoires pour rejeter"); return; }
    run("sicai-reject-job", { job_id: currentJob.id, notes }, "reject");
  };
  const regen = async () => {
    if (!currentJob) return;
    if (!notes.trim()) { toast.error("Notes obligatoires pour régénérer"); return; }
    const res = await run("sicai-regenerate-job", {
      job_id: currentJob.id,
      notes,
      prompt_override: regenUsePrompt ? regenPrompt : null,
    }, "regen");
    if (res) setRegenOpen(false);
  };

  const copyPrompt = () => {
    if (!tpl) return;
    navigator.clipboard.writeText(tpl.prompt_full);
    toast.success("Prompt copié");
  };

  if (!tpl) {
    return <div className="p-6"><Loader2 className="w-5 h-5 animate-spin" /></div>;
  }

  return (
    <>
      <Helmet><title>{tpl.illustration_id} — SICAI</title></Helmet>
      <div className="space-y-4 max-w-[1400px]">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/admin/sicai/templates/qc-dashboard"><ArrowLeft className="w-4 h-4" /> Retour</Link>
        </Button>

        <Card className="p-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h1 className="font-mono text-lg font-bold break-all">{tpl.illustration_id}</h1>
              <div className="text-xs text-muted-foreground mt-1">
                {tpl.family_code} · {tpl.cardinality_code} · {tpl.regime_code}
                {" — "}1 titre + {tpl.verbatim_placeholder_count} verbatim + {tpl.visual_anchor_count} ancres
              </div>
            </div>
            <div className="flex gap-2 items-center">
              <Badge variant={STATUS_VARIANT[tpl.status] ?? "outline"}>Template : {tpl.status}</Badge>
              {currentJob && (
                <Badge variant={STATUS_VARIANT[currentJob.status] ?? "outline"}>Job : {currentJob.status}</Badge>
              )}
              <Button
                size="sm"
                variant="outline"
                disabled={!nextTemplateId || loadingNext}
                onClick={() => {
                  if (!nextTemplateId) return;
                  const batchId = batchIdParam ?? currentJob?.batch_id;
                  navigate(`/admin/sicai/templates/detail/${nextTemplateId}${batchId ? `?batch=${batchId}` : ""}`);
                }}
                title={nextTemplateId ? "Passer au suivant à valider" : "Aucun job suivant à valider dans ce batch"}
              >
                Suivant <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left: metadata + prompt + jobs */}
          <div className="space-y-4">
            {tpl.micro_brief && (
              <Card className="p-4">
                <h2 className="text-sm font-semibold mb-2">Micro brief</h2>
                <p className="text-sm">{tpl.micro_brief}</p>
              </Card>
            )}
            <Card className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold">Prompt full</h2>
                <Button size="sm" variant="ghost" onClick={copyPrompt}>
                  <Copy className="w-3 h-3 mr-1" /> Copier
                </Button>
              </div>
              <pre className="text-[10px] bg-muted p-2 rounded max-h-72 overflow-auto whitespace-pre-wrap font-mono">
                {tpl.prompt_full}
              </pre>
            </Card>
            {tpl.negative_rules && (
              <Card className="p-4">
                <h2 className="text-sm font-semibold mb-2">Negative rules</h2>
                <pre className="text-[10px] bg-muted p-2 rounded max-h-40 overflow-auto whitespace-pre-wrap">
                  {tpl.negative_rules}
                </pre>
              </Card>
            )}
            <Card className="p-4">
              <h2 className="text-sm font-semibold mb-2">Historique des jobs ({jobs.length})</h2>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>custom_id</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Retry</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.map((j) => (
                    <TableRow key={j.id} className={j.id === currentJob?.id ? "bg-muted/50" : ""}>
                      <TableCell className="font-mono text-[10px]">{j.custom_id}</TableCell>
                      <TableCell><Badge variant={STATUS_VARIANT[j.status] ?? "outline"} className="text-[10px]">{j.status}</Badge></TableCell>
                      <TableCell className="text-xs">{j.retry_count ?? 0}</TableCell>
                      <TableCell className="text-[10px]">{new Date(j.created_at).toLocaleString("fr-FR")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </div>

          {/* Right: visuals + QC */}
          <div className="space-y-4">
            <Card className="p-4">
              <Tabs defaultValue="svg">
                <TabsList>
                  <TabsTrigger value="master">PNG Master</TabsTrigger>
                  <TabsTrigger value="norm">PNG Normalized</TabsTrigger>
                  <TabsTrigger value="svg">SVG Final</TabsTrigger>
                </TabsList>
                {(["master", "norm", "svg"] as const).map((k) => {
                  const key = k === "master" ? "png_master" : k === "norm" ? "png_normalized" : "svg_final";
                  const url = assets[key];
                  return (
                    <TabsContent key={k} value={k}>
                      {url ? (
                        <div className="space-y-2">
                          {key === "svg_final" && layoutEditing ? (
                            <SvgLayoutEditor
                              svgUrl={url}
                              jobId={currentJob!.id}
                              cardinality={tpl.cardinality_code}
                              onClose={() => setLayoutEditing(false)}
                              onSaved={async () => { await load(); }}
                            />
                          ) : key === "svg_final" ? (
                            <img src={url} alt="svg_final" className="w-full border rounded bg-muted" style={{ aspectRatio: "16 / 9", objectFit: "contain" }} />
                          ) : (
                            <img src={url} alt={key} className="w-full border rounded bg-muted" />
                          )}
                          {!(key === "svg_final" && layoutEditing) && (
                            <div className="flex gap-2 flex-wrap">
                              <Button size="sm" variant="outline" asChild>
                                <a href={url} target="_blank" rel="noreferrer" download>Télécharger</a>
                              </Button>
                              {key === "svg_final" && currentJob && (
                                <Button size="sm" variant="secondary" onClick={() => setLayoutEditing(true)}>
                                  Éditer les coordonnées de layout
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground py-8 text-center">Asset non disponible.</div>
                      )}
                    </TabsContent>
                  );
                })}
              </Tabs>
            </Card>

            <Card className="p-4 space-y-3">
              <h2 className="text-sm font-semibold">Actions de revue</h2>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes de revue (obligatoires pour rejet/régénération)"
                rows={3}
              />
              <div className="flex gap-2 flex-wrap">
                <Button onClick={approve} disabled={busy !== null || !currentJob}>
                  {busy === "approve" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Approuver et publier
                </Button>
                <Button variant="destructive" onClick={reject} disabled={busy !== null || !currentJob}>
                  {busy === "reject" ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                  Rejeter
                </Button>
                <Button variant="outline" onClick={() => { setRegenPrompt(tpl.prompt_full); setRegenOpen(true); }} disabled={busy !== null || !currentJob}>
                  <RotateCw className="w-4 h-4" /> Régénérer…
                </Button>
              </div>
            </Card>

            <Card className="p-4">
              <h2 className="text-sm font-semibold mb-2">Contrôles QC</h2>
              {checks.length === 0 ? (
                <p className="text-xs text-muted-foreground">Aucun check enregistré.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Check</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead>Score</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {checks.map((c) => (
                      <TableRow key={c.check_name}>
                        <TableCell className="font-mono text-[11px]">{c.check_name}</TableCell>
                        <TableCell><Badge variant="outline" className={`text-[10px] ${CHECK_BADGE[c.check_status] ?? ""}`}>{c.check_status}</Badge></TableCell>
                        <TableCell className="text-[10px]">{c.score?.toFixed(3) ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          </div>
        </div>
      </div>

      <Dialog open={regenOpen} onOpenChange={setRegenOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Régénérer ce template</DialogTitle>
            <DialogDescription>
              Un nouveau job sera créé en <code>queued</code>. L'ancien sera marqué <code>rejected</code>. Lancez ensuite le dispatch depuis le batch.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={regenUsePrompt} onChange={(e) => setRegenUsePrompt(e.target.checked)} />
              Modifier le prompt avant régénération
            </label>
            {regenUsePrompt && (
              <Textarea value={regenPrompt} onChange={(e) => setRegenPrompt(e.target.value)} rows={10} className="font-mono text-[10px]" />
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRegenOpen(false)}>Annuler</Button>
            <Button onClick={regen} disabled={busy !== null}>
              {busy === "regen" ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Lancer la régénération
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
