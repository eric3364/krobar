import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft, Loader2, Scissors, AlertTriangle, ListOrdered, FileText,
  Sparkles, Download, Eye, Save, ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { sicaiApi, type SicaiAnalysis, type SicaiDocument, type SicaiParagraph, countWords } from "@/lib/sicaiApi";
import { SicaiIdentityCard } from "@/components/SicaiIdentityCard";

const AI_DISABLED_MSG = "Pipeline IA non encore configuré.";

export default function SicaiDocumentPage() {
  const { id = "" } = useParams<{ id: string }>();
  const [doc, setDoc] = useState<SicaiDocument | null>(null);
  const [paragraphs, setParagraphs] = useState<SicaiParagraph[]>([]);
  const [loading, setLoading] = useState(true);
  const [segmenting, setSegmenting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Editable text state
  const [editText, setEditText] = useState("");
  const [savingText, setSavingText] = useState(false);
  const [confirmEditOpen, setConfirmEditOpen] = useState(false);

  const [analyses, setAnalyses] = useState<SicaiAnalysis[]>([]);
  const [confirmReanalyze, setConfirmReanalyze] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);

  const reloadAnalyses = async (docId: string) => {
    try {
      const list = await sicaiApi.listAnalysesByDocument(docId);
      setAnalyses(list);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur de chargement des analyses");
    }
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [d, ps, ans] = await Promise.all([
          sicaiApi.getDocument(id),
          sicaiApi.listParagraphs(id),
          sicaiApi.listAnalysesByDocument(id),
        ]);
        if (!alive) return;
        setDoc(d);
        setParagraphs(ps);
        setAnalyses(ans);
        setEditText(d?.raw_text ?? "");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur de chargement");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id]);

  const runSegmentation = async () => {
    if (!doc) return;
    setSegmenting(true);
    try {
      const ps = await sicaiApi.segmentDocument(doc.id, doc.raw_text ?? "");
      setParagraphs(ps);
      setDoc({ ...doc, paragraph_count: ps.length, document_status: "segmented" });
      toast.success(`${ps.length} paragraphe${ps.length > 1 ? "s" : ""} créé${ps.length > 1 ? "s" : ""}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur de segmentation");
    } finally {
      setSegmenting(false);
      setConfirmOpen(false);
    }
  };

  const onSegmentClick = () => {
    if (paragraphs.length > 0) setConfirmOpen(true);
    else runSegmentation();
  };

  const canEdit = doc?.document_status !== "analyzed";

  const onSaveText = async () => {
    if (!doc) return;
    if (paragraphs.length > 0 && editText !== doc.raw_text) {
      setConfirmEditOpen(true);
      return;
    }
    await persistText();
  };

  const persistText = async () => {
    if (!doc) return;
    setSavingText(true);
    try {
      const newWordCount = countWords(editText);
      const patch: Parameters<typeof sicaiApi.updateDocument>[1] = {
        raw_text: editText,
        word_count: newWordCount,
      };
      if (paragraphs.length > 0) {
        patch.document_status = "draft";
        patch.paragraph_count = 0;
        await sicaiApi.deleteParagraphs(doc.id);
        setParagraphs([]);
      }
      const updated = await sicaiApi.updateDocument(doc.id, patch);
      setDoc(updated);
      toast.success("Texte enregistré");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur à l'enregistrement");
    } finally {
      setSavingText(false);
      setConfirmEditOpen(false);
    }
  };

  const [analyzing, setAnalyzing] = useState<"global" | "all" | string | null>(null);

  const existingGlobal = analyses.find((a) => a.analysis_level === "global") ?? null;
  const paragraphAnalyses = new Map(
    analyses.filter((a) => a.analysis_level === "paragraph" && a.paragraph_id)
      .map((a) => [a.paragraph_id as string, a] as const),
  );

  const runGlobalCore = async () => {
    if (!doc?.raw_text?.trim()) return toast.error("Le document n'a pas de texte.");
    setAnalyzing("global");
    setConfirmReanalyze(false);
    try {
      await sicaiApi.runAnalysis({
        document_id: doc.id,
        analysis_level: "global",
        text_to_analyze: doc.raw_text,
      });
      toast.success("Analyse globale terminée");
      const [fresh] = await Promise.all([sicaiApi.getDocument(doc.id), reloadAnalyses(doc.id)]);
      setDoc(fresh);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de l'analyse");
    } finally {
      setAnalyzing(null);
    }
  };

  const runGlobal = () => {
    if (existingGlobal) setConfirmReanalyze(true);
    else void runGlobalCore();
  };

  const runParagraph = async (p: SicaiParagraph) => {
    if (!doc) return;
    setAnalyzing(p.id);
    try {
      await sicaiApi.runAnalysis({
        document_id: doc.id,
        analysis_level: "paragraph",
        paragraph_id: p.id,
        text_to_analyze: p.paragraph_text,
      });
      await reloadAnalyses(doc.id);
      toast.success(`Paragraphe ${p.paragraph_index} analysé`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de l'analyse");
    } finally {
      setAnalyzing(null);
    }
  };

  const runAllParagraphs = async () => {
    if (!doc || paragraphs.length === 0) return toast.error("Aucun paragraphe à analyser.");
    setAnalyzing("all");
    setBatchProgress({ done: 0, total: paragraphs.length });
    let ok = 0;
    try {
      for (const p of paragraphs) {
        try {
          await sicaiApi.runAnalysis({
            document_id: doc.id,
            analysis_level: "paragraph",
            paragraph_id: p.id,
            text_to_analyze: p.paragraph_text,
          });
          ok += 1;
        } catch (e) {
          toast.error(`Paragraphe ${p.paragraph_index} : ${e instanceof Error ? e.message : "échec"}`);
        }
        setBatchProgress({ done: ok, total: paragraphs.length });
      }
      await reloadAnalyses(doc.id);
      toast.success(`${ok}/${paragraphs.length} paragraphes analysés`);
    } finally {
      setAnalyzing(null);
      setTimeout(() => setBatchProgress(null), 2500);
    }
  };

  if (loading) {
    return <div className="py-16 flex justify-center"><Loader2 className="animate-spin" /></div>;
  }
  if (!doc) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin/sicai/documents"><ArrowLeft className="h-4 w-4 mr-1" /> Documents</Link>
        </Button>
        <Card className="p-10 text-center text-muted-foreground">Document introuvable.</Card>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin/sicai/documents"><ArrowLeft className="h-4 w-4 mr-1" /> Documents</Link>
        </Button>
        <div className="mt-2">
          <h1 className="text-2xl font-bold leading-tight">{doc.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="secondary">{doc.document_status ?? "draft"}</Badge>
            <Badge variant="outline">{doc.language ?? "—"}</Badge>
            <span className="text-muted-foreground">{doc.word_count ?? 0} mots</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">{doc.paragraph_count ?? 0} paragraphes</span>
            {doc.url && (
              <a href={doc.url} target="_blank" rel="noreferrer"
                className="text-xs text-primary hover:underline ml-2">URL source</a>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={onSegmentClick} disabled={segmenting} size="sm">
            {segmenting
              ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              : <Scissors className="h-4 w-4 mr-2" />}
            Segmenter en paragraphes
          </Button>
          <Button onClick={runGlobal} variant="outline" size="sm" disabled={analyzing !== null}>
            {analyzing === "global"
              ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              : <Sparkles className="h-4 w-4 mr-2" />}
            {existingGlobal ? "Réanalyser le document global" : "Analyser le document global"}
          </Button>
          <Button
            onClick={runAllParagraphs}
            variant="outline"
            size="sm"
            disabled={analyzing !== null || paragraphs.length === 0}
          >
            {analyzing === "all"
              ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              : <Sparkles className="h-4 w-4 mr-2" />}
            Analyser tous les paragraphes
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link to={`/admin/sicai/analyses?document=${doc.id}`}>
              <Eye className="h-4 w-4 mr-2" /> Voir les analyses
            </Link>
          </Button>
          <Button
            onClick={() => toast.info("Export disponible depuis la liste des analyses.")}
            variant="ghost"
            size="sm"
          >
            <Download className="h-4 w-4 mr-2" /> Exporter
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview"><FileText className="h-4 w-4 mr-1" /> Aperçu</TabsTrigger>
          <TabsTrigger value="text">Texte complet</TabsTrigger>
          <TabsTrigger value="paragraphs">
            <ListOrdered className="h-4 w-4 mr-1" /> Paragraphes
            {paragraphs.length > 0 && (
              <span className="ml-1.5 text-xs text-muted-foreground">({paragraphs.length})</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="global"><Sparkles className="h-4 w-4 mr-1" /> Analyse globale</TabsTrigger>
          <TabsTrigger value="per-para">Analyses par paragraphes</TabsTrigger>
          <TabsTrigger value="briefs"><ImageIcon className="h-4 w-4 mr-1" /> Briefs visuels</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <Card className="p-4 grid md:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <Meta label="Titre">{doc.title}</Meta>
            <Meta label="Langue">{doc.language ?? "—"}</Meta>
            <Meta label="Statut">{doc.document_status ?? "draft"}</Meta>
            <Meta label="Type de source">{doc.source_type ?? "—"}</Meta>
            <Meta label="Mots">{doc.word_count ?? 0}</Meta>
            <Meta label="Paragraphes">{doc.paragraph_count ?? 0}</Meta>
            <Meta label="Créé le">{new Date(doc.created_at).toLocaleString()}</Meta>
            <Meta label="Modifié le">{new Date(doc.updated_at).toLocaleString()}</Meta>
            <Meta label="URL" full>
              {doc.url
                ? <a href={doc.url} target="_blank" rel="noreferrer" className="text-primary hover:underline break-all">{doc.url}</a>
                : "—"}
            </Meta>
          </Card>
          {doc.summary && (
            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-1">Résumé</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{doc.summary}</p>
            </Card>
          )}
          {doc.internal_notes && (
            <Card className="p-4 border-amber-300 dark:border-amber-700/50">
              <h3 className="text-sm font-semibold mb-1 flex items-center gap-1">
                <AlertTriangle className="h-4 w-4 text-amber-500" /> Notes internes
              </h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{doc.internal_notes}</p>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="text" className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {canEdit ? "Édition autorisée tant que le document n'est pas analysé." : "Document analysé : édition désactivée."}
            </p>
            <span className="text-xs text-muted-foreground">{countWords(editText)} mots</span>
          </div>
          <Textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            disabled={!canEdit}
            rows={20}
            className="font-mono text-sm"
          />
          <div className="flex justify-end">
            <Button
              onClick={onSaveText}
              disabled={!canEdit || savingText || editText === (doc.raw_text ?? "")}
            >
              {savingText ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Enregistrer le texte
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="paragraphs" className="mt-4">
          {paragraphs.length === 0 ? (
            <Card className="p-10 text-center text-muted-foreground space-y-3">
              <p>Ce document n'a pas encore été segmenté.</p>
              <Button onClick={onSegmentClick} disabled={segmenting}>
                <Scissors className="h-4 w-4 mr-2" /> Segmenter en paragraphes
              </Button>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Extrait</TableHead>
                    <TableHead className="w-20 text-right">Mots</TableHead>
                    <TableHead className="w-20 text-center">Liste</TableHead>
                    <TableHead className="w-20 text-right">Items</TableHead>
                    <TableHead className="w-24 text-center">Analyse</TableHead>
                    <TableHead className="w-44 text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paragraphs.map((p) => {
                    const an = paragraphAnalyses.get(p.id);
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono text-xs">{p.paragraph_index}</TableCell>
                        <TableCell>
                          <p className="text-sm line-clamp-3">{p.paragraph_text}</p>
                        </TableCell>
                        <TableCell className="text-right text-sm">{p.word_count ?? 0}</TableCell>
                        <TableCell className="text-center">
                          {p.has_list ? <Badge variant="secondary">oui</Badge> : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-right text-sm">{p.detected_items_count ?? 0}</TableCell>
                        <TableCell className="text-center">
                          {an
                            ? <Badge variant="secondary">analysé</Badge>
                            : <span className="text-xs text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {an && (
                              <Button asChild size="sm" variant="ghost" title="Voir la carte SICAI">
                                <Link to={`/admin/sicai/analyses/${an.id}`}>
                                  <Eye className="h-4 w-4" />
                                </Link>
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => runParagraph(p)}
                              disabled={analyzing !== null}
                            >
                              {analyzing === p.id
                                ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                : <Sparkles className="h-4 w-4 mr-1" />}
                              {an ? "Réanalyser" : "Analyser"}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="global" className="mt-4">
          <Card className="p-10 text-center text-muted-foreground">
            Aucune analyse globale. {AI_DISABLED_MSG}
          </Card>
        </TabsContent>

        <TabsContent value="per-para" className="mt-4">
          <Card className="p-10 text-center text-muted-foreground">
            Aucune analyse par paragraphe. {AI_DISABLED_MSG}
          </Card>
        </TabsContent>

        <TabsContent value="briefs" className="mt-4">
          <Card className="p-10 text-center text-muted-foreground">
            Aucun brief visuel généré. {AI_DISABLED_MSG}
          </Card>
        </TabsContent>
      </Tabs>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Régénérer la segmentation ?</AlertDialogTitle>
            <AlertDialogDescription>
              Ce document a déjà {paragraphs.length} paragraphe{paragraphs.length > 1 ? "s" : ""}.
              Les paragraphes existants seront supprimés et remplacés. Les analyses paragraphes associées
              seront supprimées en cascade.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={runSegmentation}>Régénérer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmEditOpen} onOpenChange={setConfirmEditOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Modifier le texte ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le document a {paragraphs.length} paragraphe{paragraphs.length > 1 ? "s" : ""}. Modifier le texte
              supprimera les paragraphes existants et repassera le statut à <strong>draft</strong>.
              Vous devrez relancer la segmentation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={persistText}>Confirmer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Meta({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}
