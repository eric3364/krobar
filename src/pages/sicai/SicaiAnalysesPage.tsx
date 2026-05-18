import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowRight, BookOpen, Download, Eye, FileJson, FileSpreadsheet, FileText,
  Loader2, Pencil, Play, Plus, Search, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  sicaiApi, type SicaiAnalysis, type SicaiDocument, type SicaiParagraph, type SicaiSource,
} from "@/lib/sicaiApi";
import {
  analysesToCSV, analysesToJSON, analysesToMarkdown, analysesToFullReport,
  analysesToParagraphCatalog, paragraphCatalogToCSV, downloadFile,
} from "@/lib/sicaiExports";

const ALL = "__all__";

function pickStr(o: unknown, key: string): string {
  if (o && typeof o === "object" && !Array.isArray(o)) {
    const v = (o as Record<string, unknown>)[key];
    if (typeof v === "string") return v;
  }
  return "";
}

export default function SicaiAnalysesPage() {
  const navigate = useNavigate();
  const [pickDocId, setPickDocId] = useState<string>("");
  const [libOpen, setLibOpen] = useState(false);
  const [libSearch, setLibSearch] = useState("");
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [analyses, setAnalyses] = useState<SicaiAnalysis[]>([]);
  const [documents, setDocuments] = useState<Map<string, SicaiDocument>>(new Map());
  const [paragraphs, setParagraphs] = useState<Map<string, SicaiParagraph>>(new Map());
  const [sources, setSources] = useState<Map<string, SicaiSource>>(new Map());
  const [loading, setLoading] = useState(true);
  const [toDelete, setToDelete] = useState<SicaiAnalysis | null>(null);

  // filters
  const [search, setSearch] = useState("");
  const [fDoc, setFDoc] = useState(ALL);
  const [fLevel, setFLevel] = useState(ALL);
  const [fFunc, setFFunc] = useState(ALL);
  const [fFamily, setFFamily] = useState(ALL);
  const [fArch, setFArch] = useState(ALL);
  const [fClass, setFClass] = useState(ALL);

  const load = async () => {
    setLoading(true);
    try {
      const [a, docs, paras, src] = await Promise.all([
        sicaiApi.listAnalyses(),
        sicaiApi.listDocumentsMap(),
        sicaiApi.listParagraphsMap(),
        sicaiApi.listSources(),
      ]);
      setAnalyses(a);
      setDocuments(docs);
      setParagraphs(paras);
      const sMap = new Map<string, SicaiSource>();
      for (const s of src) sMap.set(s.id, s);
      setSources(sMap);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const ctx = useMemo(() => ({ documents, paragraphs, sources }), [documents, paragraphs, sources]);

  const options = useMemo(() => ({
    docs: Array.from(documents.values()).sort((a, b) => (a.title ?? "").localeCompare(b.title ?? "")),
    funcs: uniq(analyses.map((a) => a.dominant_textual_function)),
    families: uniq(analyses.map((a) => a.graphic_family)),
    archs: uniq(analyses.map((a) => a.sicai_archetype_id)),
    classes: uniq(analyses.map((a) => a.classification_status)),
  }), [analyses, documents]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return analyses.filter((a) => {
      if (fDoc !== ALL && a.document_id !== fDoc) return false;
      if (fLevel !== ALL && a.analysis_level !== fLevel) return false;
      if (fFunc !== ALL && a.dominant_textual_function !== fFunc) return false;
      if (fFamily !== ALL && a.graphic_family !== fFamily) return false;
      if (fArch !== ALL && a.sicai_archetype_id !== fArch) return false;
      if (fClass !== ALL && a.classification_status !== fClass) return false;
      if (q) {
        const doc = a.document_id ? documents.get(a.document_id) : null;
        const fields = [
          doc?.title, a.dominant_textual_function, a.graphic_family,
          a.sicai_archetype_id, a.classification_status, a.tension,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!fields.includes(q)) return false;
      }
      return true;
    });
  }, [analyses, documents, search, fDoc, fLevel, fFunc, fFamily, fArch, fClass]);

  const stamp = () => new Date().toISOString().slice(0, 10);
  const exportAll = (format: "json" | "csv" | "md" | "report") => {
    if (filtered.length === 0) return toast.error("Aucune analyse à exporter");
    const base = `sicai-analyses-${stamp()}`;
    if (format === "json") downloadFile(`${base}.json`, analysesToJSON(filtered, ctx), "application/json");
    else if (format === "csv") downloadFile(`${base}.csv`, analysesToCSV(filtered, ctx), "text/csv");
    else if (format === "report") downloadFile(`sicai-rapport-global-${stamp()}.md`, analysesToFullReport(filtered, ctx), "text/markdown");
    else downloadFile(`${base}.md`, analysesToMarkdown(filtered, ctx), "text/markdown");
    toast.success(`Export ${format.toUpperCase()} : ${filtered.length} analyse(s)`);
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await sicaiApi.deleteAnalysis(toDelete.id);
      setAnalyses((prev) => prev.filter((x) => x.id !== toDelete.id));
      toast.success("Analyse supprimée");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur à la suppression");
    } finally {
      setToDelete(null);
    }
  };

  const isEmpty = !loading && analyses.length === 0;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Analyses SICAI</h1>
          <p className="text-sm text-muted-foreground">
            Cartes d'identité Sémantique / Intensité / Cardinalité / Affordance Iconique.
            Filtres, export et édition manuelle.
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button disabled={filtered.length === 0}>
              <Download className="h-4 w-4 mr-2" />
              Exporter ({filtered.length})
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => exportAll("json")}>
              <FileJson className="h-4 w-4 mr-2" /> JSON
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => exportAll("csv")}>
              <FileSpreadsheet className="h-4 w-4 mr-2" /> CSV
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => exportAll("md")}>
              <FileText className="h-4 w-4 mr-2" /> Markdown
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => exportAll("report")}>
              <BookOpen className="h-4 w-4 mr-2" /> Rapport global (textes + caractéristiques)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {isEmpty ? (
        <Card className="p-12 text-center space-y-6">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">Aucune analyse pour le moment</h2>
            <p className="text-sm text-muted-foreground max-w-xl mx-auto">
              Pour produire une analyse SICAI : choisissez un document existant ci-dessous,
              ou créez-en un nouveau depuis la bibliothèque.
            </p>
          </div>

          {options.docs.length > 0 && (
            <div className="max-w-xl mx-auto w-full space-y-2 text-left">
              <label className="text-xs uppercase tracking-wide text-muted-foreground">
                Choisir un document de la bibliothèque
              </label>
              <div className="flex gap-2">
                <Select value={pickDocId} onValueChange={setPickDocId}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Sélectionner un document…" />
                  </SelectTrigger>
                  <SelectContent>
                    {options.docs.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  disabled={!pickDocId}
                  onClick={() => navigate(`/admin/sicai/documents/${pickDocId}`)}
                >
                  Ouvrir <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Vous lancerez l'analyse globale ou par paragraphe depuis la fiche du document.
              </p>
            </div>
          )}

          <div className="flex flex-wrap justify-center gap-2 pt-2">
            <Button onClick={() => setLibOpen(true)}>
              <BookOpen className="h-4 w-4 mr-2" /> Bibliothèque
            </Button>
            <Button asChild variant="outline">
              <Link to="/admin/sicai/documents"><FileText className="h-4 w-4 mr-2" /> Documents</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/admin/sicai/new"><Plus className="h-4 w-4 mr-2" /> Nouveau texte</Link>
            </Button>
          </div>
        </Card>
      ) : (
        <>
          <Card className="p-4 space-y-3">
            <Input
              placeholder="Rechercher (document, fonction, famille, archétype, tension…)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-md"
            />
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <FSelect label="Document" value={fDoc} onChange={setFDoc}
                items={options.docs.map((d) => ({ value: d.id, label: d.title }))} />
              <FSelect label="Niveau" value={fLevel} onChange={setFLevel}
                items={[{ value: "global", label: "global" }, { value: "paragraph", label: "paragraph" }]} />
              <FSelect label="Fonction" value={fFunc} onChange={setFFunc}
                items={options.funcs.map((v) => ({ value: v, label: v }))} />
              <FSelect label="Famille" value={fFamily} onChange={setFFamily}
                items={options.families.map((v) => ({ value: v, label: v }))} />
              <FSelect label="Archétype" value={fArch} onChange={setFArch}
                items={options.archs.map((v) => ({ value: v, label: v }))} />
              <FSelect label="Classification" value={fClass} onChange={setFClass}
                items={options.classes.map((v) => ({ value: v, label: v }))} />
            </div>
          </Card>

          {loading ? (
            <div className="py-16 flex justify-center"><Loader2 className="animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <Card className="p-10 text-center text-muted-foreground">
              Aucune analyse ne correspond aux filtres.
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Document</TableHead>
                      <TableHead className="w-24">Niveau</TableHead>
                      <TableHead>Fonction</TableHead>
                      <TableHead>Famille</TableHead>
                      <TableHead>Archétype</TableHead>
                      <TableHead>Classif.</TableHead>
                      <TableHead className="w-20 text-right">Confiance</TableHead>
                      <TableHead className="w-28">Date</TableHead>
                      <TableHead className="w-32 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((a) => {
                      const doc = a.document_id ? documents.get(a.document_id) : null;
                      const para = a.paragraph_id ? paragraphs.get(a.paragraph_id) : null;
                      const conf = pickStr(
                        (a.ai_raw_response as Record<string, unknown> | null)?.confidence,
                        "score",
                      );
                      const confNum = typeof ((a.ai_raw_response as { confidence?: { score?: unknown } } | null)?.confidence?.score) === "number"
                        ? ((a.ai_raw_response as { confidence: { score: number } }).confidence.score)
                        : null;
                      return (
                        <TableRow key={a.id}>
                          <TableCell>
                            <div className="font-medium text-sm">{doc?.title ?? "—"}</div>
                            {para && (
                              <div className="text-xs text-muted-foreground">
                                Paragraphe {para.paragraph_index}
                              </div>
                            )}
                          </TableCell>
                          <TableCell><Badge variant="outline">{a.analysis_level}</Badge></TableCell>
                          <TableCell className="text-sm">{a.dominant_textual_function ?? "—"}</TableCell>
                          <TableCell className="text-xs">{a.graphic_family ?? "—"}</TableCell>
                          <TableCell className="text-xs font-mono">{a.sicai_archetype_id ?? "—"}</TableCell>
                          <TableCell>
                            {a.classification_status
                              ? <Badge variant="secondary" className="text-[10px]">{a.classification_status}</Badge>
                              : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="text-right text-xs font-mono">
                            {confNum ?? conf ?? "—"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {new Date(a.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button asChild size="sm" variant="ghost" title="Voir la carte SICAI">
                                <Link to={`/admin/sicai/analyses/${a.id}`}>
                                  <Eye className="h-4 w-4" />
                                </Link>
                              </Button>
                              <Button asChild size="sm" variant="ghost" title="Éditer">
                                <Link to={`/admin/sicai/analyses/${a.id}?tab=edit`}>
                                  <Pencil className="h-4 w-4" />
                                </Link>
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                title="Supprimer"
                                onClick={() => setToDelete(a)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}
        </>
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(v) => !v && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette analyse ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. La carte SICAI et la réponse IA brute seront supprimées.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={libOpen} onOpenChange={setLibOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Choisir un document de la bibliothèque</DialogTitle>
            <DialogDescription>
              Sélectionnez un document existant pour lancer son analyse globale,
              ou ouvrez sa fiche pour l'analyse par paragraphe.
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={libSearch}
              onChange={(e) => setLibSearch(e.target.value)}
              placeholder="Rechercher par titre ou source…"
              className="pl-8"
            />
          </div>

          <div className="max-h-[55vh] overflow-y-auto border rounded-md divide-y">
            {(() => {
              const q = libSearch.trim().toLowerCase();
              const list = Array.from(documents.values())
                .filter((d) => {
                  if (!q) return true;
                  const src = d.source_id ? sources.get(d.source_id) : null;
                  return [d.title, src?.source_id, src?.source_name]
                    .filter(Boolean).join(" ").toLowerCase().includes(q);
                })
                .sort((a, b) => (a.title ?? "").localeCompare(b.title ?? ""));
              if (list.length === 0) {
                const totalDocs = documents.size;
                return (
                  <div className="p-8 text-center space-y-4">
                    <p className="text-sm text-muted-foreground">
                      {totalDocs === 0
                        ? "La bibliothèque ne contient encore aucun document analysable. Créez un nouveau texte ou attachez du contenu à une source existante."
                        : "Aucun document ne correspond à votre recherche."}
                    </p>
                    {totalDocs === 0 && (
                      <div className="flex flex-wrap justify-center gap-2">
                        <Button asChild size="sm" onClick={() => setLibOpen(false)}>
                          <Link to="/admin/sicai/new">
                            <Plus className="h-4 w-4 mr-1" /> Nouveau texte
                          </Link>
                        </Button>
                        <Button asChild size="sm" variant="outline" onClick={() => setLibOpen(false)}>
                          <Link to="/admin/sicai/library">
                            <BookOpen className="h-4 w-4 mr-1" /> Ouvrir la bibliothèque
                          </Link>
                        </Button>
                      </div>
                    )}
                  </div>
                );
              }
              return list.map((d) => {
                const src = d.source_id ? sources.get(d.source_id) : null;
                const canAnalyze = !!d.raw_text && d.raw_text.trim().length > 0;
                const launching = launchingId === d.id;
                return (
                  <div key={d.id} className="flex items-center gap-3 p-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{d.title}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {src ? `${src.source_id} · ${src.source_name ?? "—"}` : "Sans source"}
                        {" · "}
                        <Badge variant="outline" className="text-[10px]">{d.document_status ?? "draft"}</Badge>
                        {" · "}{d.word_count ?? 0} mots
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { setLibOpen(false); navigate(`/admin/sicai/documents/${d.id}`); }}
                    >
                      Ouvrir
                    </Button>
                    <Button
                      size="sm"
                      disabled={!canAnalyze || launching}
                      onClick={async () => {
                        if (!d.raw_text) return;
                        setLaunchingId(d.id);
                        try {
                          await sicaiApi.runAnalysis({
                            document_id: d.id,
                            analysis_level: "global",
                            text_to_analyze: d.raw_text,
                          });
                          toast.success(`Analyse lancée : ${d.title}`);
                          setLibOpen(false);
                          await load();
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Erreur d'analyse");
                        } finally {
                          setLaunchingId(null);
                        }
                      }}
                    >
                      {launching
                        ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        : <Play className="h-4 w-4 mr-1" />}
                      Lancer l'analyse
                    </Button>
                  </div>
                );
              });
            })()}
          </div>

          <DialogFooter className="flex sm:justify-between gap-2">
            <Button variant="ghost" asChild>
              <Link to="/admin/sicai/library">
                <BookOpen className="h-4 w-4 mr-2" /> Gérer la bibliothèque
              </Link>
            </Button>
            <Button asChild>
              <Link to="/admin/sicai/new"><Plus className="h-4 w-4 mr-2" /> Nouveau texte</Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function uniq(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((v): v is string => !!v))).sort();
}

function FSelect({
  label, value, onChange, items,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  items: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Tous" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Tous</SelectItem>
          {items.map((it) => <SelectItem key={it.value} value={it.value}>{it.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
