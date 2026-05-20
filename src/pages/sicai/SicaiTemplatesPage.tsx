import { useEffect, useState, useCallback } from "react";
import { Helmet } from "react-helmet-async";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Upload, FileCheck2, AlertTriangle, XCircle } from "lucide-react";

type Tpl = {
  id: string;
  illustration_id: string;
  family_code: string;
  cardinality_code: string;
  regime_code: string;
  status: string;
  validation_errors: string[] | null;
};

type ImportResult = {
  imported: number;
  valid_structure: number;
  warnings: { row: number; field: string; issue: string }[];
  errors: { row: number; issue: string }[];
};

type ValidationResult = {
  total: number;
  valid: number;
  invalid: number;
  templates_invalid: { id: string; illustration_id: string; errors: string[] }[];
};

const STATUSES = ["imported", "ready", "invalid", "generated", "validated"];

export default function SicaiTemplatesPage() {
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [validating, setValidating] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);

  const [templates, setTemplates] = useState<Tpl[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [familyFilter, setFamilyFilter] = useState<string>("all");

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("sicai_templates")
      .select("id, illustration_id, family_code, cardinality_code, regime_code, status, validation_errors")
      .order("illustration_id", { ascending: true });
    if (error) toast.error(error.message);
    else setTemplates((data ?? []) as Tpl[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  const counts = STATUSES.reduce<Record<string, number>>((acc, s) => {
    acc[s] = templates.filter((t) => t.status === s).length;
    return acc;
  }, {});

  const families = Array.from(new Set(templates.map((t) => t.family_code))).filter(Boolean);
  const filtered = templates.filter((t) =>
    (statusFilter === "all" || t.status === statusFilter) &&
    (familyFilter === "all" || t.family_code === familyFilter)
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) setFile(f);
  };

  const doImport = async () => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Fichier > 2 Mo");
      return;
    }
    setImporting(true);
    setImportResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data, error } = await supabase.functions.invoke("sicai-import-xlsx", { body: fd });
      if (error) throw new Error(error.message);
      setImportResult(data as ImportResult);
      toast.success(`${(data as ImportResult).imported} templates importés`);
      await loadTemplates();
    } catch (e: any) {
      toast.error(e?.message ?? "Échec import");
    } finally {
      setImporting(false);
    }
  };

  const doValidate = async () => {
    setValidating(true);
    setValidationResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("sicai-validate-templates", { body: {} });
      if (error) throw new Error(error.message);
      setValidationResult(data as ValidationResult);
      toast.success(`${(data as ValidationResult).valid} templates passés à 'ready'`);
      await loadTemplates();
    } catch (e: any) {
      toast.error(e?.message ?? "Échec validation");
    } finally {
      setValidating(false);
    }
  };

  return (
    <>
      <Helmet><title>Templates SICAI — Admin Krobar</title></Helmet>
      <div className="space-y-6 max-w-[1400px]">
        <div>
          <h1 className="text-3xl font-bold">Templates SICAI</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Catalogue des 72 templates SICAI : import du tableau Excel, validation, génération.
          </p>
        </div>

        {/* Global progress */}
        <Card className="p-4">
          <div className="flex flex-wrap gap-6 text-sm">
            <div><span className="font-semibold">Total :</span> {templates.length} / 72</div>
            <div><span className="text-muted-foreground">Imported :</span> {counts.imported ?? 0}</div>
            <div><span className="text-green-700">Ready :</span> {counts.ready ?? 0}</div>
            <div><span className="text-destructive">Invalid :</span> {counts.invalid ?? 0}</div>
            <div><span className="text-muted-foreground">Generated :</span> {counts.generated ?? 0}</div>
          </div>
        </Card>

        <Tabs defaultValue="import">
          <TabsList>
            <TabsTrigger value="import">Import</TabsTrigger>
            <TabsTrigger value="list">Liste</TabsTrigger>
            <TabsTrigger value="batches">Batchs</TabsTrigger>
          </TabsList>

          <TabsContent value="import" className="space-y-4">
            <Card
              className="p-8 border-dashed"
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
            >
              <div className="flex flex-col items-center gap-3 text-center">
                <Upload className="w-10 h-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Glissez-déposez le fichier <code>.xlsx</code> ici, ou choisissez-le ci-dessous (max 2 Mo).
                </p>
                <Input
                  type="file"
                  accept=".xlsx"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="max-w-sm"
                />
                {file && <div className="text-xs">Sélection : <strong>{file.name}</strong> ({Math.round(file.size / 1024)} Ko)</div>}
                <Button disabled={!file || importing} onClick={doImport}>
                  {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  Importer
                </Button>
              </div>
            </Card>

            {importResult && (
              <Card className="p-4 space-y-3">
                <div className="font-semibold">
                  {importResult.imported} / 72 templates importés (structure valide : {importResult.valid_structure})
                </div>
                {importResult.warnings.length > 0 && (
                  <div className="rounded-md border border-yellow-300 bg-yellow-50 p-3">
                    <div className="flex items-center gap-2 font-medium text-yellow-800">
                      <AlertTriangle className="w-4 h-4" />
                      {importResult.warnings.length} avertissement(s)
                    </div>
                    <ul className="mt-2 text-xs text-yellow-900 space-y-1 max-h-40 overflow-auto">
                      {importResult.warnings.map((w, i) => (
                        <li key={i}>Ligne {w.row} — <code>{w.field}</code> : {w.issue}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {importResult.errors.length > 0 && (
                  <div className="rounded-md border border-destructive bg-destructive/10 p-3">
                    <div className="flex items-center gap-2 font-medium text-destructive">
                      <XCircle className="w-4 h-4" />
                      {importResult.errors.length} erreur(s)
                    </div>
                    <ul className="mt-2 text-xs space-y-1 max-h-40 overflow-auto">
                      {importResult.errors.map((er, i) => (
                        <li key={i}>Ligne {er.row} : {er.issue}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>
            )}

            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold">Validation complète</h2>
                  <p className="text-xs text-muted-foreground">
                    Applique les règles métier (cardinalité, énums, complétude, couleurs N&B) et fait passer les templates en <code>ready</code> ou <code>invalid</code>.
                  </p>
                </div>
                <Button onClick={doValidate} disabled={validating}>
                  {validating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCheck2 className="w-4 h-4" />}
                  Lancer la validation
                </Button>
              </div>

              {validationResult && (
                <div className="text-sm space-y-2">
                  <div>
                    {validationResult.valid} valides · {validationResult.invalid} invalides (sur {validationResult.total})
                  </div>
                  {validationResult.templates_invalid.length > 0 && (
                    <div className="rounded-md border p-3 max-h-72 overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>illustration_id</TableHead>
                            <TableHead>Erreurs</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {validationResult.templates_invalid.map((t) => (
                            <TableRow key={t.id}>
                              <TableCell className="font-mono text-xs">{t.illustration_id}</TableCell>
                              <TableCell className="text-xs">
                                <ul className="list-disc pl-4">
                                  {t.errors.map((e, i) => <li key={i}>{e}</li>)}
                                </ul>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="list" className="space-y-4">
            <Card className="p-4 flex flex-wrap gap-3 items-center">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous statuts</SelectItem>
                  {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={familyFilter} onValueChange={setFamilyFilter}>
                <SelectTrigger className="w-[280px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes familles</SelectItem>
                  {families.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="ml-auto text-sm text-muted-foreground">
                {filtered.length} / {templates.length}
              </div>
            </Card>

            <Card className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>illustration_id</TableHead>
                    <TableHead>family_code</TableHead>
                    <TableHead>cardinality_code</TableHead>
                    <TableHead>regime_code</TableHead>
                    <TableHead>status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-6"><Loader2 className="w-4 h-4 animate-spin inline" /></TableCell></TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Aucun template.</TableCell></TableRow>
                  ) : filtered.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-mono text-xs">{t.illustration_id}</TableCell>
                      <TableCell className="text-xs">{t.family_code}</TableCell>
                      <TableCell className="text-xs">{t.cardinality_code}</TableCell>
                      <TableCell className="text-xs">{t.regime_code}</TableCell>
                      <TableCell>
                        <Badge variant={t.status === "ready" ? "default" : t.status === "invalid" ? "destructive" : "secondary"}>
                          {t.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          <TabsContent value="batches">
            <SicaiBatchesTab />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
