import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Download, FileJson, FileSpreadsheet, FileText, Loader2, Pencil } from "lucide-react";
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
  sicaiApi, type SicaiAnalysis, type SicaiDocument, type SicaiParagraph, type SicaiSource,
} from "@/lib/sicaiApi";
import {
  analysesToCSV, analysesToJSON, analysesToMarkdown, downloadFile,
} from "@/lib/sicaiExports";

export default function SicaiAnalysesPage() {
  const [analyses, setAnalyses] = useState<SicaiAnalysis[]>([]);
  const [documents, setDocuments] = useState<Map<string, SicaiDocument>>(new Map());
  const [paragraphs, setParagraphs] = useState<Map<string, SicaiParagraph>>(new Map());
  const [sources, setSources] = useState<Map<string, SicaiSource>>(new Map());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
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
    })();
  }, []);

  const ctx = useMemo(() => ({ documents, paragraphs, sources }), [documents, paragraphs, sources]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return analyses;
    return analyses.filter((a) => {
      const doc = a.document_id ? documents.get(a.document_id) : null;
      const fields = [
        doc?.title, a.dominant_textual_function, a.graphic_family,
        a.sicai_archetype_id, a.classification_status,
      ].filter(Boolean).join(" ").toLowerCase();
      return fields.includes(q);
    });
  }, [analyses, documents, search]);

  const stamp = () => new Date().toISOString().slice(0, 10);

  const exportAll = (format: "json" | "csv" | "md") => {
    if (filtered.length === 0) {
      toast.error("Aucune analyse à exporter");
      return;
    }
    if (format === "json") {
      downloadFile(`sicai-analyses-${stamp()}.json`, analysesToJSON(filtered, ctx), "application/json");
    } else if (format === "csv") {
      downloadFile(`sicai-analyses-${stamp()}.csv`, analysesToCSV(filtered, ctx), "text/csv");
    } else {
      downloadFile(`sicai-analyses-${stamp()}.md`, analysesToMarkdown(filtered, ctx), "text/markdown");
    }
    toast.success(`Export ${format.toUpperCase()} : ${filtered.length} analyse(s)`);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Analyses SICAI</h1>
          <p className="text-sm text-muted-foreground">
            Résultats Sémantique / Intensité / Cardinalité / Affordance Iconique.
            Export JSON / CSV / Markdown et édition manuelle.
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button>
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
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Input
        placeholder="Rechercher (document, fonction, famille, archétype…)"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-md"
      />

      {loading ? (
        <div className="py-16 flex justify-center"><Loader2 className="animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">
          {analyses.length === 0
            ? "Aucune analyse SICAI pour le moment. Les analyses apparaîtront ici une fois le pipeline IA exécuté."
            : "Aucune analyse ne correspond à votre recherche."}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document</TableHead>
                <TableHead className="w-24">Niveau</TableHead>
                <TableHead>Fonction dominante</TableHead>
                <TableHead>Famille</TableHead>
                <TableHead>Archétype</TableHead>
                <TableHead className="w-28">Statut</TableHead>
                <TableHead className="w-20 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((a) => {
                const doc = a.document_id ? documents.get(a.document_id) : null;
                const para = a.paragraph_id ? paragraphs.get(a.paragraph_id) : null;
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
                    <TableCell>
                      <Badge variant="outline">{a.analysis_level}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{a.dominant_textual_function ?? "—"}</TableCell>
                    <TableCell className="text-sm">{a.graphic_family ?? "—"}</TableCell>
                    <TableCell className="text-sm font-mono text-xs">{a.sicai_archetype_id ?? "—"}</TableCell>
                    <TableCell>
                      {a.classification_status
                        ? <Badge variant="secondary">{a.classification_status}</Badge>
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="ghost">
                        <Link to={`/admin/sicai/analyses/${a.id}`}>
                          <Pencil className="h-4 w-4" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
