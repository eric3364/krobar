import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft, Loader2, Scissors, AlertTriangle, ListOrdered, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { sicaiApi, type SicaiDocument, type SicaiParagraph } from "@/lib/sicaiApi";

export default function SicaiDocumentPage() {
  const { id = "" } = useParams<{ id: string }>();
  const [doc, setDoc] = useState<SicaiDocument | null>(null);
  const [paragraphs, setParagraphs] = useState<SicaiParagraph[]>([]);
  const [loading, setLoading] = useState(true);
  const [segmenting, setSegmenting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [d, ps] = await Promise.all([
          sicaiApi.getDocument(id),
          sicaiApi.listParagraphs(id),
        ]);
        if (!alive) return;
        setDoc(d);
        setParagraphs(ps);
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

  if (loading) {
    return <div className="py-16 flex justify-center"><Loader2 className="animate-spin" /></div>;
  }
  if (!doc) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin/sicai/library"><ArrowLeft className="h-4 w-4 mr-1" /> Bibliothèque</Link>
        </Button>
        <Card className="p-10 text-center text-muted-foreground">Document introuvable.</Card>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin/sicai/library"><ArrowLeft className="h-4 w-4 mr-1" /> Bibliothèque</Link>
        </Button>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
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
          <Button onClick={onSegmentClick} disabled={segmenting}>
            {segmenting
              ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              : <Scissors className="h-4 w-4 mr-2" />}
            Segmenter en paragraphes
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview"><FileText className="h-4 w-4 mr-1" /> Aperçu</TabsTrigger>
          <TabsTrigger value="paragraphs">
            <ListOrdered className="h-4 w-4 mr-1" /> Paragraphes
            {paragraphs.length > 0 && (
              <span className="ml-1.5 text-xs text-muted-foreground">({paragraphs.length})</span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          {doc.summary && (
            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-1">Résumé</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{doc.summary}</p>
            </Card>
          )}
          <Card className="p-4">
            <h3 className="text-sm font-semibold mb-2">Texte complet</h3>
            <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed max-h-[60vh] overflow-auto">
              {doc.raw_text || <span className="text-muted-foreground">(aucun texte)</span>}
            </pre>
          </Card>
          {doc.internal_notes && (
            <Card className="p-4 border-amber-300 dark:border-amber-700/50">
              <h3 className="text-sm font-semibold mb-1 flex items-center gap-1">
                <AlertTriangle className="h-4 w-4 text-amber-500" /> Notes internes
              </h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{doc.internal_notes}</p>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="paragraphs" className="mt-4">
          {paragraphs.length === 0 ? (
            <Card className="p-10 text-center text-muted-foreground">
              Aucun paragraphe. Cliquez sur <strong>Segmenter en paragraphes</strong> pour découper automatiquement le texte.
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paragraphs.map((p) => (
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
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
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
    </div>
  );
}
