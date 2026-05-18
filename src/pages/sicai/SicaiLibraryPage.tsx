import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Eye, FilePlus2, FileText, ExternalLink, Loader2, Search, Files } from "lucide-react";
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { sicaiApi, type SicaiSource } from "@/lib/sicaiApi";

const ALL = "__all__";

function uniq(arr: (string | null)[]): string[] {
  return Array.from(new Set(arr.filter((v): v is string => Boolean(v)))).sort();
}

export default function SicaiLibraryPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<SicaiSource[] | null>(null);
  const [docCounts, setDocCounts] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);

  // filters
  const [q, setQ] = useState("");
  const [fType, setFType] = useState(ALL);
  const [fName, setFName] = useState(ALL);
  const [fLang, setFLang] = useState(ALL);
  const [fStatus, setFStatus] = useState(ALL);
  const [fProfile, setFProfile] = useState(ALL);

  // dialog
  const [openDetail, setOpenDetail] = useState<SicaiSource | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [data, counts] = await Promise.all([
          sicaiApi.listSources(),
          sicaiApi.countDocumentsBySource(),
        ]);
        if (alive) { setRows(data); setDocCounts(counts); }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur de chargement");
        if (alive) setRows([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const options = useMemo(() => ({
    types: uniq(rows?.map((r) => r.source_type) ?? []),
    names: uniq(rows?.map((r) => r.source_name) ?? []),
    langs: uniq(rows?.map((r) => r.language) ?? []),
    statuses: uniq(rows?.map((r) => r.content_status) ?? []),
    profiles: uniq(rows?.map((r) => r.expected_sicai_profile) ?? []),
  }), [rows]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (fType !== ALL && r.source_type !== fType) return false;
      if (fName !== ALL && r.source_name !== fName) return false;
      if (fLang !== ALL && r.language !== fLang) return false;
      if (fStatus !== ALL && r.content_status !== fStatus) return false;
      if (fProfile !== ALL && r.expected_sicai_profile !== fProfile) return false;
      if (term) {
        const hay = `${r.source_id} ${r.title}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [rows, q, fType, fName, fLang, fStatus, fProfile]);

  const resetFilters = () => {
    setQ(""); setFType(ALL); setFName(ALL); setFLang(ALL); setFStatus(ALL); setFProfile(ALL);
  };

  const goCreateDoc = (s: SicaiSource) =>
    navigate(`/admin/sicai/new?source=${encodeURIComponent(s.id)}`);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Bibliothèque SICAI</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {loading ? "Chargement…" : `${filtered.length} / ${rows?.length ?? 0} sources`}
        </p>
      </div>

      <Card className="p-4 space-y-4">
        {/* Search */}
        <div className="flex gap-2 items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher par titre ou ID SICAI…"
              className="pl-8"
            />
          </div>
          <Button variant="outline" size="sm" onClick={resetFilters}>Réinitialiser</Button>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <FilterSelect label="Type de source" value={fType} onChange={setFType} options={options.types} />
          <FilterSelect label="Source" value={fName} onChange={setFName} options={options.names} />
          <FilterSelect label="Langue" value={fLang} onChange={setFLang} options={options.langs} />
          <FilterSelect label="Statut contenu" value={fStatus} onChange={setFStatus} options={options.statuses} />
          <FilterSelect label="Profil attendu" value={fProfile} onChange={setFProfile} options={options.profiles} />
        </div>
      </Card>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="py-16 flex items-center justify-center">
            <Loader2 className="animate-spin h-5 w-5 text-muted-foreground" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[110px]">ID SICAI</TableHead>
                  <TableHead className="min-w-[280px]">Titre</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="w-[70px]">Langue</TableHead>
                  <TableHead>Profil attendu</TableHead>
                  <TableHead>Intérêt</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="w-[80px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.source_id}</TableCell>
                    <TableCell>
                      <div className="font-medium leading-tight">{r.title}</div>
                      {r.url && (
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary mt-0.5"
                        >
                          <ExternalLink className="h-3 w-3" /> ouvrir la source
                        </a>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.source_type ?? "—"}</TableCell>
                    <TableCell className="text-sm">{r.source_name ?? "—"}</TableCell>
                    <TableCell className="text-xs uppercase">{r.language ?? "—"}</TableCell>
                    <TableCell className="text-xs">{r.expected_sicai_profile ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[260px]">
                      <span className="line-clamp-2">{r.analysis_interest ?? "—"}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.content_status === "metadata_only" ? "outline" : "secondary"}>
                        {r.content_status ?? "—"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">Actions</Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setOpenDetail(r)}>
                            <Eye className="h-4 w-4 mr-2" /> Voir la fiche
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => goCreateDoc(r)}>
                            <FileText className="h-4 w-4 mr-2" /> Ajouter / coller le texte
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => goCreateDoc(r)}>
                            <FilePlus2 className="h-4 w-4 mr-2" /> Créer un document
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">
                      Aucune source ne correspond aux filtres.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <Dialog open={!!openDetail} onOpenChange={(v) => !v && setOpenDetail(null)}>
        <DialogContent className="max-w-2xl">
          {openDetail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">{openDetail.source_id}</span>
                  <span>{openDetail.title}</span>
                </DialogTitle>
                <DialogDescription>Fiche source SICAI</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <Field label="Type">{openDetail.source_type ?? "—"}</Field>
                <Field label="Source">{openDetail.source_name ?? "—"}</Field>
                <Field label="Langue">{openDetail.language ?? "—"}</Field>
                <Field label="Statut">{openDetail.content_status ?? "—"}</Field>
                <Field label="Profil attendu" full>{openDetail.expected_sicai_profile ?? "—"}</Field>
                <Field label="Intérêt" full>{openDetail.analysis_interest ?? "—"}</Field>
                <Field label="URL" full>
                  {openDetail.url ? (
                    <a href={openDetail.url} target="_blank" rel="noreferrer" className="text-primary hover:underline break-all">
                      {openDetail.url}
                    </a>
                  ) : "—"}
                </Field>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setOpenDetail(null)}>Fermer</Button>
                <Button onClick={() => { const s = openDetail; setOpenDetail(null); goCreateDoc(s); }}>
                  <FilePlus2 className="h-4 w-4 mr-2" /> Créer un document
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
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

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}
