import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Eye, FilePlus2, Loader2, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { sicaiApi, type SicaiDocument, type SicaiSource } from "@/lib/sicaiApi";

const ALL = "__all__";

function uniq(arr: (string | null)[]): string[] {
  return Array.from(new Set(arr.filter((v): v is string => Boolean(v)))).sort();
}

export default function SicaiDocumentsPage() {
  const [params, setParams] = useSearchParams();
  const sourceFilter = params.get("source");
  const [docs, setDocs] = useState<SicaiDocument[]>([]);
  const [sources, setSources] = useState<Map<string, SicaiSource>>(new Map());
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState("");
  const [fStatus, setFStatus] = useState(ALL);
  const [fLang, setFLang] = useState(ALL);
  const [fType, setFType] = useState(ALL);

  const [toDelete, setToDelete] = useState<SicaiDocument | null>(null);

  const reload = async () => {
    setLoading(true);
    try {
      const [d, s] = await Promise.all([sicaiApi.listDocuments(), sicaiApi.listSources()]);
      setDocs(d);
      const m = new Map<string, SicaiSource>();
      for (const x of s) m.set(x.id, x);
      setSources(m);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);

  const options = useMemo(() => ({
    statuses: uniq(docs.map((d) => d.document_status)),
    langs: uniq(docs.map((d) => d.language)),
    types: uniq(docs.map((d) => d.source_type)),
  }), [docs]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return docs.filter((d) => {
      if (sourceFilter && d.source_id !== sourceFilter) return false;
      if (fStatus !== ALL && d.document_status !== fStatus) return false;
      if (fLang !== ALL && d.language !== fLang) return false;
      if (fType !== ALL && d.source_type !== fType) return false;
      if (term && !d.title.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [docs, q, fStatus, fLang, fType, sourceFilter]);

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await sicaiApi.deleteDocument(toDelete.id);
      toast.success("Document supprimé");
      setToDelete(null);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur à la suppression");
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Documents SICAI</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {loading ? "Chargement…" : `${filtered.length} / ${docs.length} documents`}
          </p>
        </div>
        <Button asChild>
          <Link to="/admin/sicai/new"><FilePlus2 className="h-4 w-4 mr-2" /> Nouveau texte</Link>
        </Button>
      </div>

      {sourceFilter && (
        <Card className="p-3 flex items-center justify-between bg-muted/30">
          <div className="text-sm">
            Filtré sur la source{" "}
            <span className="font-mono text-xs">{sources.get(sourceFilter)?.source_id ?? sourceFilter}</span>
            {" — "}{sources.get(sourceFilter)?.title}
          </div>
          <Button size="sm" variant="ghost" onClick={() => { params.delete("source"); setParams(params); }}>
            Retirer le filtre
          </Button>
        </Card>
      )}

        <div className="relative max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher par titre…" className="pl-8" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <FilterSelect label="Statut" value={fStatus} onChange={setFStatus} options={options.statuses} />
          <FilterSelect label="Langue" value={fLang} onChange={setFLang} options={options.langs} />
          <FilterSelect label="Type de source" value={fType} onChange={setFType} options={options.types} />
        </div>
      </Card>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            {docs.length === 0
              ? "Aucun document SICAI. Créez-en un depuis la Bibliothèque ou via « Nouveau texte »."
              : "Aucun document ne correspond aux filtres."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Titre</TableHead>
                  <TableHead>Source liée</TableHead>
                  <TableHead className="w-16">Lang</TableHead>
                  <TableHead className="w-24">Statut</TableHead>
                  <TableHead className="w-20 text-right">Mots</TableHead>
                  <TableHead className="w-20 text-right">¶</TableHead>
                  <TableHead className="w-32">Créé</TableHead>
                  <TableHead className="w-32 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((d) => {
                  const src = d.source_id ? sources.get(d.source_id) : null;
                  return (
                    <TableRow key={d.id}>
                      <TableCell>
                        <Link to={`/admin/sicai/documents/${d.id}`} className="font-medium hover:underline">
                          {d.title}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {src ? (
                          <span className="font-mono text-xs">{src.source_id}</span>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-xs uppercase">{d.language ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={d.document_status === "analyzed" ? "default" : d.document_status === "segmented" ? "secondary" : "outline"}>
                          {d.document_status ?? "draft"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{d.word_count ?? 0}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{d.paragraph_count ?? 0}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(d.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant="ghost">
                          <Link to={`/admin/sicai/documents/${d.id}`}><Eye className="h-4 w-4" /></Link>
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setToDelete(d)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <AlertDialog open={!!toDelete} onOpenChange={(v) => !v && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce document ?</AlertDialogTitle>
            <AlertDialogDescription>
              « {toDelete?.title} » et tous ses paragraphes et analyses associés seront supprimés. Action irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function FilterSelect({
  label, value, onChange, options,
}: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9"><SelectValue placeholder="Tous" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Tous</SelectItem>
          {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
