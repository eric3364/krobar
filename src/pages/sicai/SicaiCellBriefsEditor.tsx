import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Upload, RotateCcw, Search, Loader2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export type CellBriefs = Record<string, string>;

type NomenclatureRow = {
  illustration_id: string;
  family_code: string;
  cardinality_code: string;
  regime_code: string;
};

const PAGE_SIZE = 24;
const CSV_HEADER = "archetype_id,family_code,cardinality_code,regime_code,brief_override";

/* ---------- BriefRow: memoized, local state, commit on blur ---------- */

type BriefRowProps = {
  row: NomenclatureRow;
  initialValue: string;
  onCommit: (id: string, v: string) => void;
};

const BriefRow = memo(function BriefRow({ row, initialValue, onCommit }: BriefRowProps) {
  const [local, setLocal] = useState(initialValue);
  // Re-sync when initialValue changes from outside (import / reset)
  const lastInitial = useRef(initialValue);
  useEffect(() => {
    if (initialValue !== lastInitial.current) {
      lastInitial.current = initialValue;
      setLocal(initialValue);
    }
  }, [initialValue]);

  const filled = local.trim().length > 0;

  return (
    <TableRow className={filled ? "bg-primary/5" : undefined}>
      <TableCell className="font-mono text-xs whitespace-nowrap">{row.illustration_id}</TableCell>
      <TableCell className="text-xs">{row.family_code}</TableCell>
      <TableCell className="text-xs">{row.cardinality_code}</TableCell>
      <TableCell className="text-xs">{row.regime_code}</TableCell>
      <TableCell>
        <Input
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={() => {
            if (local !== lastInitial.current) {
              lastInitial.current = local;
              onCommit(row.illustration_id, local);
            }
          }}
          placeholder="Brief thématique (vide = pas d'override)"
          className="h-8 text-xs"
        />
      </TableCell>
      <TableCell className="w-16 text-center">
        {filled && <Badge variant="secondary" className="text-[10px]">modifié</Badge>}
      </TableCell>
    </TableRow>
  );
});

/* ---------- CSV helpers ---------- */

function csvEscape(s: string): string {
  if (s == null) return "";
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function buildCsv(nomenclature: NomenclatureRow[], briefs: CellBriefs): string {
  const lines = [CSV_HEADER];
  for (const r of nomenclature) {
    lines.push([
      r.illustration_id, r.family_code, r.cardinality_code, r.regime_code,
      csvEscape(briefs[r.illustration_id] ?? ""),
    ].join(","));
  }
  // UTF-8 BOM for Excel-FR
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}

/** Minimal RFC4180 parser (handles quoted fields, doubled quotes, CRLF). */
function parseCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let i = 0;
  let inQuotes = false;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ",") { cur.push(field); field = ""; i++; continue; }
    if (c === "\r") { i++; continue; }
    if (c === "\n") { cur.push(field); rows.push(cur); cur = []; field = ""; i++; continue; }
    field += c; i++;
  }
  // last field
  if (field.length > 0 || cur.length > 0) { cur.push(field); rows.push(cur); }
  // drop trailing empty rows
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

type ImportDelta = {
  added: Array<{ id: string; value: string }>;
  modified: Array<{ id: string; oldValue: string; value: string }>;
  deleted: Array<{ id: string; oldValue: string }>;
  nextBriefs: CellBriefs;
};

function validateAndDiff(
  csvText: string,
  nomenclature: NomenclatureRow[],
  current: CellBriefs,
): { errors: string[]; delta: ImportDelta | null } {
  const errors: string[] = [];
  const rows = parseCsv(csvText);
  if (rows.length === 0) return { errors: ["Fichier vide."], delta: null };

  const header = rows[0].map((h) => h.trim());
  const expected = CSV_HEADER.split(",");
  if (header.length !== expected.length || header.some((h, i) => h !== expected[i])) {
    errors.push(`En-tête invalide. Attendu : ${CSV_HEADER}`);
    return { errors, delta: null };
  }

  const data = rows.slice(1);
  const nomById = new Map(nomenclature.map((r) => [r.illustration_id, r]));
  const seen = new Set<string>();
  const next: CellBriefs = {};

  data.forEach((row, idx) => {
    const lineNo = idx + 2; // 1-based + header
    if (row.length !== expected.length) {
      errors.push(`Ligne ${lineNo} : ${row.length} colonnes (attendu ${expected.length}).`);
      return;
    }
    const [id, fam, card, reg, brief] = row.map((v) => v ?? "");
    const archetypeId = id.trim();
    if (!archetypeId) { errors.push(`Ligne ${lineNo} : archetype_id vide.`); return; }
    if (seen.has(archetypeId)) { errors.push(`Ligne ${lineNo} : archetype_id dupliqué (${archetypeId}).`); return; }
    seen.add(archetypeId);
    const nom = nomById.get(archetypeId);
    if (!nom) { errors.push(`Ligne ${lineNo} : archetype_id "${archetypeId}" absent de la nomenclature.`); return; }
    // Optional sanity check on family/cardinality/regime if filled
    if (fam.trim() && fam.trim() !== nom.family_code)
      errors.push(`Ligne ${lineNo} : family_code "${fam}" ≠ "${nom.family_code}" pour ${archetypeId}.`);
    if (card.trim() && card.trim() !== nom.cardinality_code)
      errors.push(`Ligne ${lineNo} : cardinality_code "${card}" ≠ "${nom.cardinality_code}" pour ${archetypeId}.`);
    if (reg.trim() && reg.trim() !== nom.regime_code)
      errors.push(`Ligne ${lineNo} : regime_code "${reg}" ≠ "${nom.regime_code}" pour ${archetypeId}.`);

    const b = brief.trim();
    if (b) next[archetypeId] = b;
  });

  if (errors.length > 0) return { errors, delta: null };

  // Build diff
  const added: ImportDelta["added"] = [];
  const modified: ImportDelta["modified"] = [];
  const deleted: ImportDelta["deleted"] = [];
  const allIds = new Set<string>([...Object.keys(current), ...Object.keys(next)]);
  allIds.forEach((id) => {
    const oldV = current[id] ?? "";
    const newV = next[id] ?? "";
    if (oldV === newV) return;
    if (oldV && !newV) deleted.push({ id, oldValue: oldV });
    else if (!oldV && newV) added.push({ id, value: newV });
    else modified.push({ id, oldValue: oldV, value: newV });
  });

  return { errors: [], delta: { added, modified, deleted, nextBriefs: next } };
}

/* ---------- Main editor ---------- */

type Props = {
  value: CellBriefs;
  onChange: (next: CellBriefs) => void;
};

export default function SicaiCellBriefsEditor({ value, onChange }: Props) {
  const [nomenclature, setNomenclature] = useState<NomenclatureRow[]>([]);
  const [loading, setLoading] = useState(true);

  // filters
  const [q, setQ] = useState("");
  const [famFilter, setFamFilter] = useState<string>("all");
  const [cardFilter, setCardFilter] = useState<string>("all");
  const [regFilter, setRegFilter] = useState<string>("all");
  const [onlyOverride, setOnlyOverride] = useState(false);
  const [page, setPage] = useState(0);

  // import
  const fileRef = useRef<HTMLInputElement>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importDelta, setImportDelta] = useState<ImportDelta | null>(null);

  // reset confirm
  const [resetOpen, setResetOpen] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("sicai_templates")
          .select("illustration_id, family_code, cardinality_code, regime_code")
          .order("family_code", { ascending: true })
          .order("cardinality_code", { ascending: true })
          .order("regime_code", { ascending: true });
        if (error) throw error;
        setNomenclature((data ?? []) as NomenclatureRow[]);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur de chargement de la nomenclature");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const { families, cardinalities, regimes } = useMemo(() => {
    const f = new Set<string>(), c = new Set<string>(), r = new Set<string>();
    nomenclature.forEach((n) => { f.add(n.family_code); c.add(n.cardinality_code); r.add(n.regime_code); });
    return {
      families: Array.from(f).sort(),
      cardinalities: Array.from(c).sort(),
      regimes: Array.from(r).sort(),
    };
  }, [nomenclature]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return nomenclature.filter((n) => {
      if (famFilter !== "all" && n.family_code !== famFilter) return false;
      if (cardFilter !== "all" && n.cardinality_code !== cardFilter) return false;
      if (regFilter !== "all" && n.regime_code !== regFilter) return false;
      if (onlyOverride && !(value[n.illustration_id] ?? "").trim()) return false;
      if (ql) {
        const hay = `${n.illustration_id} ${n.family_code} ${n.cardinality_code} ${n.regime_code} ${value[n.illustration_id] ?? ""}`.toLowerCase();
        if (!hay.includes(ql)) return false;
      }
      return true;
    });
  }, [nomenclature, q, famFilter, cardFilter, regFilter, onlyOverride, value]);

  // Reset page when filters change
  useEffect(() => { setPage(0); }, [q, famFilter, cardFilter, regFilter, onlyOverride]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const filledCount = useMemo(
    () => Object.values(value).filter((v) => (v ?? "").trim().length > 0).length,
    [value],
  );
  const totalCells = nomenclature.length;

  const commitBrief = (id: string, v: string) => {
    const next = { ...value };
    const trimmed = v.trim();
    if (trimmed) next[id] = v; else delete next[id];
    onChange(next);
  };

  /* ---- Export ---- */
  const onExport = () => {
    const csv = buildCsv(nomenclature, value);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cell_briefs_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  /* ---- Import ---- */
  const onPickFile = () => fileRef.current?.click();
  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-select same file
    if (!file) return;
    try {
      const text = await file.text();
      const { errors, delta } = validateAndDiff(text, nomenclature, value);
      setImportErrors(errors);
      setImportDelta(delta);
      setImportOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur de lecture du fichier");
    }
  };
  const applyImport = () => {
    if (!importDelta) return;
    onChange(importDelta.nextBriefs);
    setImportOpen(false);
    setImportDelta(null);
    setImportErrors([]);
    toast.success(
      `Import : ${importDelta.added.length} ajouts · ${importDelta.modified.length} modifs · ${importDelta.deleted.length} suppressions`,
    );
  };

  /* ---- Reset ---- */
  const doReset = () => { onChange({}); setResetOpen(false); toast.success("Briefs réinitialisés"); };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" /> Chargement de la nomenclature…
      </div>
    );
  }

  if (totalCells === 0) {
    return (
      <div className="text-sm text-muted-foreground py-8 text-center">
        Aucune cellule dans la nomenclature (table sicai_templates vide).
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher (id, code, brief)…" className="h-9 pl-7 text-sm"
          />
        </div>
        <Select value={famFilter} onValueChange={setFamFilter}>
          <SelectTrigger className="h-9 w-[130px] text-xs"><SelectValue placeholder="Famille" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes familles</SelectItem>
            {families.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={cardFilter} onValueChange={setCardFilter}>
          <SelectTrigger className="h-9 w-[130px] text-xs"><SelectValue placeholder="Cardinalité" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes cardinalités</SelectItem>
            {cardinalities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={regFilter} onValueChange={setRegFilter}>
          <SelectTrigger className="h-9 w-[130px] text-xs"><SelectValue placeholder="Régime" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous régimes</SelectItem>
            {regimes.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-1.5 text-xs h-9 px-2">
          <input type="checkbox" checked={onlyOverride} onChange={(e) => setOnlyOverride(e.target.checked)} />
          Avec brief
        </label>
        <div className="flex gap-1.5 ml-auto">
          <Button variant="outline" size="sm" onClick={onPickFile}>
            <Upload className="h-3.5 w-3.5 mr-1" /> Importer CSV
          </Button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFileSelected} />
          <Button variant="outline" size="sm" onClick={onExport}>
            <Download className="h-3.5 w-3.5 mr-1" /> Exporter CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => setResetOpen(true)} disabled={filledCount === 0}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="border rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px]">archetype_id</TableHead>
              <TableHead className="w-[80px]">Famille</TableHead>
              <TableHead className="w-[90px]">Cardinalité</TableHead>
              <TableHead className="w-[80px]">Régime</TableHead>
              <TableHead>Brief override</TableHead>
              <TableHead className="w-16 text-center">État</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-6">
                  Aucune ligne ne correspond aux filtres.
                </TableCell>
              </TableRow>
            ) : pageRows.map((row) => (
              <BriefRow
                key={row.illustration_id}
                row={row}
                initialValue={value[row.illustration_id] ?? ""}
                onCommit={commitBrief}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div>
          Page {page + 1}/{pageCount} · {filtered.length} ligne{filtered.length > 1 ? "s" : ""} affichée{filtered.length > 1 ? "s" : ""} ·{" "}
          <span className="text-foreground font-medium">{filledCount}/{totalCells}</span> briefs renseignés
        </div>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
            Précédent
          </Button>
          <Button variant="outline" size="sm" disabled={page >= pageCount - 1} onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}>
            Suivant
          </Button>
        </div>
      </div>

      {/* Import preview dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import CSV — Aperçu</DialogTitle>
            <DialogDescription>
              {importErrors.length > 0
                ? "Erreurs détectées. Aucun changement ne sera appliqué."
                : "Valide les changements pour les appliquer aux briefs (l'enregistrement persiste via le bouton Enregistrer du thème)."}
            </DialogDescription>
          </DialogHeader>

          {importErrors.length > 0 ? (
            <div className="border border-destructive/40 bg-destructive/5 rounded-md p-3 max-h-[50vh] overflow-auto">
              <div className="flex items-center gap-2 text-destructive font-medium text-sm mb-2">
                <AlertTriangle className="h-4 w-4" /> {importErrors.length} erreur{importErrors.length > 1 ? "s" : ""}
              </div>
              <ul className="text-xs space-y-1">
                {importErrors.map((e, i) => <li key={i} className="font-mono">{e}</li>)}
              </ul>
            </div>
          ) : importDelta ? (
            <div className="grid gap-3 max-h-[60vh] overflow-auto">
              <div className="flex gap-3 text-sm">
                <Badge variant="secondary">+{importDelta.added.length} ajouts</Badge>
                <Badge variant="secondary">~{importDelta.modified.length} modifs</Badge>
                <Badge variant="secondary">−{importDelta.deleted.length} suppressions</Badge>
              </div>
              {importDelta.added.length + importDelta.modified.length + importDelta.deleted.length === 0 ? (
                <div className="text-xs text-muted-foreground">Aucun changement par rapport à l'état actuel.</div>
              ) : (
                <div className="border rounded-md overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-20">Type</TableHead>
                        <TableHead className="w-[180px]">archetype_id</TableHead>
                        <TableHead>Avant</TableHead>
                        <TableHead>Après</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importDelta.added.map((d) => (
                        <TableRow key={`a-${d.id}`}>
                          <TableCell><Badge variant="outline">+ ajout</Badge></TableCell>
                          <TableCell className="font-mono text-xs">{d.id}</TableCell>
                          <TableCell className="text-xs text-muted-foreground italic">—</TableCell>
                          <TableCell className="text-xs">{d.value}</TableCell>
                        </TableRow>
                      ))}
                      {importDelta.modified.map((d) => (
                        <TableRow key={`m-${d.id}`}>
                          <TableCell><Badge variant="outline">~ modif</Badge></TableCell>
                          <TableCell className="font-mono text-xs">{d.id}</TableCell>
                          <TableCell className="text-xs text-muted-foreground line-through">{d.oldValue}</TableCell>
                          <TableCell className="text-xs">{d.value}</TableCell>
                        </TableRow>
                      ))}
                      {importDelta.deleted.map((d) => (
                        <TableRow key={`d-${d.id}`}>
                          <TableCell><Badge variant="outline">− suppr.</Badge></TableCell>
                          <TableCell className="font-mono text-xs">{d.id}</TableCell>
                          <TableCell className="text-xs text-muted-foreground line-through">{d.oldValue}</TableCell>
                          <TableCell className="text-xs italic">—</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>Annuler</Button>
            <Button onClick={applyImport} disabled={importErrors.length > 0 || !importDelta}>
              Appliquer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset confirm */}
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Réinitialiser tous les briefs ?</DialogTitle>
            <DialogDescription>
              Cette action vide les {filledCount} brief{filledCount > 1 ? "s" : ""} renseigné{filledCount > 1 ? "s" : ""}.
              Le changement est appliqué localement ; il sera persisté à l'enregistrement du thème.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetOpen(false)}>Annuler</Button>
            <Button variant="destructive" onClick={doReset}>Réinitialiser</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
