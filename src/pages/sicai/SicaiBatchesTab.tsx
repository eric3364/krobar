import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Plus, RefreshCw, Play, X } from "lucide-react";

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
  draft: "outline",
  queued: "secondary",
  running: "secondary",
  qc: "secondary",
  done: "default",
  failed: "destructive",
};

export default function SicaiBatchesTab() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [polling, setPolling] = useState<string | null>(null);
  const [dispatching, setDispatching] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Modal state
  const [label, setLabel] = useState("");
  const [mode, setMode] = useState<"openai_batch" | "sync">("openai_batch");
  const [readyCount, setReadyCount] = useState<number>(0);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("sicai_generation_batches")
      .select("id, label, batch_mode, status, request_count, approved_count, failed_count, cost_estimate_usd, cost_actual_usd, openai_batch_id, created_at")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setBatches((data ?? []) as Batch[]);

    const { count } = await supabase
      .from("sicai_templates")
      .select("*", { count: "exact", head: true })
      .eq("status", "ready");
    setReadyCount(count ?? 0);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const createBatch = async () => {
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("sicai-create-generation-batch", {
        body: {
          label: label || `Batch SICAI ${new Date().toLocaleString("fr-FR")}`,
          batch_mode: mode,
        },
      });
      if (error) throw new Error(error.message);
      toast.success(`Batch créé (${data.request_count} jobs)`);
      setModalOpen(false);
      setLabel("");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Échec création");
    } finally {
      setCreating(false);
    }
  };

  const dispatch = async (batchId: string) => {
    setDispatching(batchId);
    try {
      const { data, error } = await supabase.functions.invoke("sicai-dispatch-openai", {
        body: { batch_id: batchId },
      });
      if (error) throw new Error(error.message);
      toast.success(`Dispatch OK : ${data.status ?? "ok"}`);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Échec dispatch");
    } finally {
      setDispatching(null);
    }
  };

  const poll = async (batchId: string) => {
    setPolling(batchId);
    try {
      const { data, error } = await supabase.functions.invoke("sicai-poll-openai-batch", {
        body: { batch_id: batchId },
      });
      if (error) throw new Error(error.message);
      toast.success(`Poll : ${data.openai_status} (${data.jobs_completed ?? 0} ok / ${data.jobs_failed ?? 0} err)`);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Échec poll");
    } finally {
      setPolling(null);
    }
  };

  const estimate = mode === "sync" ? (readyCount * 0.04).toFixed(2) : (readyCount * 0.02).toFixed(2);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="font-semibold">Batchs de génération</h2>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Rafraîchir
          </Button>
          <Dialog open={modalOpen} onOpenChange={setModalOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="w-4 h-4" /> Créer un batch</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Créer un nouveau batch</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="batch-label">Label</Label>
                  <Input
                    id="batch-label"
                    placeholder={`Batch SICAI ${new Date().toLocaleDateString("fr-FR")}`}
                    value={label} onChange={(e) => setLabel(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Templates à inclure</Label>
                  <p className="text-sm text-muted-foreground">
                    Tous les templates en <code>status='ready'</code> : <strong>{readyCount}</strong>
                  </p>
                </div>
                <div>
                  <Label>Mode de génération</Label>
                  <RadioGroup value={mode} onValueChange={(v) => setMode(v as any)} className="mt-2 space-y-2">
                    <div className="flex items-start gap-2">
                      <RadioGroupItem value="openai_batch" id="m-batch" className="mt-1" />
                      <label htmlFor="m-batch" className="text-sm cursor-pointer">
                        <div className="font-medium">Batch API OpenAI (50% off, max 24h)</div>
                        <div className="text-xs text-muted-foreground">Recommandé pour les 72 templates.</div>
                      </label>
                    </div>
                    <div className="flex items-start gap-2">
                      <RadioGroupItem value="sync" id="m-sync" className="mt-1" />
                      <label htmlFor="m-sync" className="text-sm cursor-pointer">
                        <div className="font-medium">Synchrone (1 par 1, ~0.04 $/image)</div>
                        <div className="text-xs text-muted-foreground">Pour régénérations unitaires.</div>
                      </label>
                    </div>
                  </RadioGroup>
                </div>
                <div className="text-sm">
                  Estimation coût : <strong>{estimate} USD</strong>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setModalOpen(false)}>Annuler</Button>
                <Button onClick={createBatch} disabled={creating || readyCount === 0}>
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Créer le batch
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Label</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Progression</TableHead>
              <TableHead>Coût (est. / réel)</TableHead>
              <TableHead className="w-[260px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {batches.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Aucun batch.</TableCell></TableRow>
            ) : batches.map((b) => {
              const done = b.approved_count ?? 0;
              const failed = b.failed_count ?? 0;
              const total = b.request_count || 1;
              const pct = Math.round(((done + failed) / total) * 100);
              return (
                <TableRow key={b.id}>
                  <TableCell className="text-xs">{new Date(b.created_at).toLocaleString("fr-FR")}</TableCell>
                  <TableCell>
                    <Link to={`/admin/sicai/templates/batches/${b.id}`} className="text-primary hover:underline text-sm">
                      {b.label ?? "(sans label)"}
                    </Link>
                  </TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{b.batch_mode}</Badge></TableCell>
                  <TableCell><Badge variant={STATUS_COLORS[b.status] ?? "outline"}>{b.status}</Badge></TableCell>
                  <TableCell className="min-w-[160px]">
                    <div className="text-xs mb-1">{done}/{total} ok · {failed} err</div>
                    <Progress value={pct} className="h-1.5" />
                  </TableCell>
                  <TableCell className="text-xs">
                    {b.cost_estimate_usd?.toFixed(2) ?? "—"} $ / {b.cost_actual_usd?.toFixed(2) ?? "—"} $
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {(b.status === "queued" || b.status === "draft") && (
                        <Button size="sm" variant="default" disabled={dispatching === b.id}
                          onClick={() => dispatch(b.id)}>
                          {dispatching === b.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                          Dispatch
                        </Button>
                      )}
                      {b.status === "running" && b.batch_mode === "openai_batch" && (
                        <Button size="sm" variant="outline" disabled={polling === b.id}
                          onClick={() => poll(b.id)}>
                          {polling === b.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                          Poll
                        </Button>
                      )}
                      {b.status === "running" && b.batch_mode === "sync" && (
                        <Button size="sm" variant="outline" disabled={dispatching === b.id}
                          onClick={() => dispatch(b.id)}>
                          {dispatching === b.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                          Suivant
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" asChild>
                        <Link to={`/admin/sicai/templates/batches/${b.id}`}>Détail</Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
