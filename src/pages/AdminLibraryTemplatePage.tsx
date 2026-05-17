// Vue B + Vue C — /admin/library/:templateId
// Liste des aperçus d'un template Premium + modal plein écran.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Download, Eye, Loader2, Trash2, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  libraryApi,
  type LibraryPreviewFull,
  type LibraryPreviewSummary,
  type LibraryTemplate,
} from "@/lib/libraryApi";

function relative(iso: string | null): string {
  if (!iso) return "—";
  try { return `il y a ${formatDistanceToNow(new Date(iso), { locale: fr })}`; }
  catch { return "—"; }
}

function formatLatency(ms: number): string {
  if (!ms) return "—";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

function downloadSvg(svg: string, filename: string) {
  const blob = new Blob([svg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function AdminLibraryTemplatePage() {
  const { templateId = "" } = useParams<{ templateId: string }>();
  const [template, setTemplate] = useState<LibraryTemplate | null>(null);
  const [previews, setPreviews] = useState<LibraryPreviewSummary[] | null>(null);
  const [loading, setLoading] = useState(true);

  // Modal Vue C
  const [openId, setOpenId] = useState<number | null>(null);
  const [openPreview, setOpenPreview] = useState<LibraryPreviewFull | null>(null);
  const [openLoading, setOpenLoading] = useState(false);

  // Confirm suppression
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  // Thumbnails (svg cache id -> svg)
  const [thumbCache, setThumbCache] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tplRes, prevRes] = await Promise.all([
        libraryApi.listTemplates(),
        libraryApi.listPreviews(templateId),
      ]);
      const tpl = tplRes.templates.find((t) => t.id === templateId) ?? null;
      setTemplate(tpl);
      setPreviews(prevRes.previews ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur de chargement");
      setPreviews([]);
    } finally {
      setLoading(false);
    }
  }, [templateId]);

  useEffect(() => { load(); }, [load]);

  // Lazy-load thumbs after list is ready
  useEffect(() => {
    if (!previews) return;
    let cancelled = false;
    (async () => {
      for (const p of previews) {
        if (cancelled) return;
        if (thumbCache[p.id]) continue;
        try {
          const full = await libraryApi.getPreview(p.id);
          if (cancelled) return;
          setThumbCache((c) => ({ ...c, [p.id]: full.rendered_svg }));
        } catch { /* silencieux */ }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previews]);

  const sorted = useMemo(() => {
    if (!previews) return [];
    return [...previews].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [previews]);

  const openModal = async (id: number) => {
    setOpenId(id);
    setOpenPreview(null);
    setOpenLoading(true);
    try {
      // Si déjà en cache thumbnail on l'utilise déjà mais on récupère les meta fraîches
      const full = await libraryApi.getPreview(id);
      setOpenPreview(full);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Impossible de charger l'aperçu");
      setOpenId(null);
    } finally {
      setOpenLoading(false);
    }
  };

  const handleValidate = async (id: number, currentlyValidated: boolean) => {
    setBusy(id);
    try {
      if (currentlyValidated) {
        await libraryApi.unvalidate(id);
        toast.success("Aperçu dé-validé");
      } else {
        await libraryApi.validate(id);
        toast.success("Aperçu validé");
      }
      await load();
      if (openId === id) {
        const fresh = await libraryApi.getPreview(id);
        setOpenPreview(fresh);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async (id: number) => {
    setBusy(id);
    try {
      await libraryApi.deletePreview(id);
      toast.success("Aperçu supprimé");
      setConfirmDeleteId(null);
      if (openId === id) { setOpenId(null); setOpenPreview(null); }
      setThumbCache((c) => { const n = { ...c }; delete n[id]; return n; });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-screen p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin/library"><ArrowLeft className="w-4 h-4 mr-1" /> Retour</Link>
        </Button>
        <h1 className="text-3xl font-bold mt-2">{template?.name ?? templateId}</h1>
        <div className="flex items-center gap-2 mt-1">
          {template?.category && <Badge variant="secondary">{template.category}</Badge>}
          <Badge>Premium</Badge>
        </div>
        {template?.description && (
          <p className="text-sm text-muted-foreground mt-2 italic">"{template.description}"</p>
        )}
        {template && (
          <p className="text-sm text-muted-foreground mt-3">
            {template.preview_count} aperçus · {template.validated_count} validés
          </p>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
      ) : sorted.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">
          Aucun aperçu pour ce template. Allez générer un premier aperçu via Studio.
        </Card>
      ) : (
        <div className="space-y-3">
          {sorted.map((p) => {
            const validated = !!p.validated_at;
            const thumb = thumbCache[p.id];
            return (
              <Card key={p.id} className="p-4">
                <div className="flex gap-4">
                  <div className="w-[200px] h-[120px] flex-shrink-0 border rounded bg-muted/30 overflow-hidden flex items-center justify-center">
                    {thumb ? (
                      <div
                        className="w-full h-full [&>svg]:w-full [&>svg]:h-full"
                        dangerouslySetInnerHTML={{ __html: thumb }}
                      />
                    ) : (
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-sm" title={p.test_text}>
                      <span className="text-muted-foreground">Texte : </span>
                      {p.test_text.length > 80 ? `${p.test_text.slice(0, 80)}…` : p.test_text}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Généré {relative(p.created_at)} · {formatLatency(p.latency_ms)} · SVG {(p.svg_size / 1024).toFixed(1)} Ko
                    </p>
                    <p className="text-sm">
                      {validated ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="w-4 h-4" />
                          Validé le {new Date(p.validated_at!).toLocaleDateString("fr-FR")}
                          {p.validation_note && <span className="text-muted-foreground"> · Note : "{p.validation_note}"</span>}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Non validé</span>
                      )}
                    </p>
                    <div className="flex gap-2 pt-2">
                      <Button size="sm" variant="outline" onClick={() => openModal(p.id)}>
                        <Eye className="w-4 h-4 mr-1" /> Voir
                      </Button>
                      <Button
                        size="sm"
                        variant={validated ? "secondary" : "default"}
                        disabled={busy === p.id}
                        onClick={() => handleValidate(p.id, validated)}
                      >
                        {busy === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : validated ? "Dé-valider" : "Valider"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setConfirmDeleteId(p.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Vue C — Modal plein écran */}
      <Dialog open={openId !== null} onOpenChange={(o) => { if (!o) { setOpenId(null); setOpenPreview(null); } }}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>
              Aperçu #{openId} — {template?.name ?? templateId}
            </DialogTitle>
          </DialogHeader>
          {openLoading || !openPreview ? (
            <div className="py-20 flex justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Texte de test :</p>
                <Textarea readOnly value={openPreview.test_text} className="text-sm" rows={3} />
              </div>
              <div className="w-full border rounded bg-muted/20 overflow-auto" style={{ maxHeight: 500 }}>
                <div
                  className="w-full [&>svg]:w-full [&>svg]:h-auto [&>svg]:block"
                  dangerouslySetInnerHTML={{ __html: openPreview.rendered_svg }}
                />
              </div>
              <div className="text-sm space-y-1">
                <p className="font-medium">Métadonnées</p>
                <ul className="text-muted-foreground space-y-0.5 text-xs">
                  <li>Créé le {new Date(openPreview.created_at).toLocaleString("fr-FR")}</li>
                  <li>Latence : {formatLatency(openPreview.latency_ms)}</li>
                  {(openPreview.analyst_model || openPreview.writer_model) && (
                    <li>Modèles : {[openPreview.analyst_model, openPreview.writer_model].filter(Boolean).join(" + ") || "—"}</li>
                  )}
                  <li>
                    Validation : {openPreview.validated_at
                      ? `✓ Validé le ${new Date(openPreview.validated_at).toLocaleDateString("fr-FR")}`
                      : "Non validé"}
                  </li>
                  {openPreview.validation_note && <li>Note : "{openPreview.validation_note}"</li>}
                </ul>
              </div>
              <DialogFooter className="flex-wrap gap-2 sm:justify-between">
                <div className="flex gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => downloadSvg(openPreview.rendered_svg, `${templateId}_preview_${openPreview.id}.svg`)}
                  >
                    <Download className="w-4 h-4 mr-1" /> Télécharger SVG
                  </Button>
                  <Button variant="outline" size="sm" disabled title="À venir">
                    <Download className="w-4 h-4 mr-1" /> Télécharger PNG
                  </Button>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant={openPreview.validated_at ? "secondary" : "default"}
                    disabled={busy === openPreview.id}
                    onClick={() => handleValidate(openPreview.id, !!openPreview.validated_at)}
                  >
                    {openPreview.validated_at ? "Dé-valider" : "Valider"}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => setConfirmDeleteId(openPreview.id)}
                  >
                    <Trash2 className="w-4 h-4 mr-1" /> Supprimer
                  </Button>
                </div>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirm suppression */}
      <AlertDialog open={confirmDeleteId !== null} onOpenChange={(o) => !o && setConfirmDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cet aperçu ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. L'aperçu et son SVG seront définitivement supprimés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirmDeleteId !== null && handleDelete(confirmDeleteId)}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
