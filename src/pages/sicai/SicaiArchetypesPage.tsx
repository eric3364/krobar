import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Pencil, Save, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { sicaiApi, type SicaiArchetype } from "@/lib/sicaiApi";

const ALL = "__all__";
const EXPECTED_TOTAL = 72;

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x));
  return [];
}
function listToText(v: unknown): string {
  return asStringArray(v).join("\n");
}
function textToList(s: string): string[] {
  return s.split("\n").map((l) => l.trim()).filter(Boolean);
}

export default function SicaiArchetypesPage() {
  const [items, setItems] = useState<SicaiArchetype[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [fFamily, setFFamily] = useState(ALL);
  const [fCard, setFCard] = useState(ALL);
  const [fReg, setFReg] = useState(ALL);
  const [editing, setEditing] = useState<SicaiArchetype | null>(null);

  const reload = async () => {
    setLoading(true);
    try {
      const data = await sicaiApi.listArchetypes();
      setItems(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);

  const options = useMemo(() => ({
    families: Array.from(new Set(items.map((i) => i.graphic_family))).sort(),
    cards: Array.from(new Set(items.map((i) => i.cardinality))).sort(),
    regs: Array.from(new Set(items.map((i) => i.representation_regime))).sort(),
  }), [items]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return items.filter((i) => {
      if (fFamily !== ALL && i.graphic_family !== fFamily) return false;
      if (fCard !== ALL && i.cardinality !== fCard) return false;
      if (fReg !== ALL && i.representation_regime !== fReg) return false;
      if (term && !i.archetype_id.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [items, q, fFamily, fCard, fReg]);

  const incomplete = items.length < EXPECTED_TOTAL;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Archétypes graphiques SICAI</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {loading
              ? "Chargement…"
              : `${items.length} / ${EXPECTED_TOTAL} archétypes — ${filtered.length} affiché${filtered.length > 1 ? "s" : ""}`}
          </p>
        </div>
      </div>

      {!loading && incomplete && (
        <Card className="p-4 border-amber-400/60 bg-amber-50/40 dark:bg-amber-900/10">
          <p className="text-sm">
            Bibliothèque incomplète : {items.length}/{EXPECTED_TOTAL}. La régénération du catalogue se fait
            via la migration de seed côté base. Contactez le superadmin.
          </p>
        </Card>
      )}

      <Card className="p-4 space-y-3">
        <div className="relative max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un archetype_id…" className="pl-8" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <FilterSelect label="Famille graphique" value={fFamily} onChange={setFFamily} options={options.families} />
          <FilterSelect label="Cardinalité" value={fCard} onChange={setFCard} options={options.cards} />
          <FilterSelect label="Régime" value={fReg} onChange={setFReg} options={options.regs} />
        </div>
      </Card>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>archetype_id</TableHead>
                  <TableHead>Famille</TableHead>
                  <TableHead>Cardinalité</TableHead>
                  <TableHead>Régime</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Motifs</TableHead>
                  <TableHead>Tons</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono text-[11px]">{a.archetype_id}</TableCell>
                    <TableCell className="text-xs">{a.graphic_family}</TableCell>
                    <TableCell><Badge variant="outline">{a.cardinality}</Badge></TableCell>
                    <TableCell><Badge variant="secondary">{a.representation_regime}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[260px]">
                      <span className="line-clamp-2">{a.description ?? "—"}</span>
                    </TableCell>
                    <TableCell className="text-xs">{asStringArray(a.visual_motifs).join(", ") || "—"}</TableCell>
                    <TableCell className="text-xs">{asStringArray(a.possible_tones).join(", ") || "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(a)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                      Aucun archétype ne correspond aux filtres.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <EditDialog
        archetype={editing}
        onClose={() => setEditing(null)}
        onSaved={(updated) => {
          setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
          setEditing(null);
        }}
      />
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

function EditDialog({
  archetype, onClose, onSaved,
}: {
  archetype: SicaiArchetype | null;
  onClose: () => void;
  onSaved: (a: SicaiArchetype) => void;
}) {
  const [description, setDescription] = useState("");
  const [principle, setPrinciple] = useState("");
  const [motifs, setMotifs] = useState("");
  const [tones, setTones] = useState("");
  const [bestFor, setBestFor] = useState("");
  const [avoidFor, setAvoidFor] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!archetype) return;
    setDescription(archetype.description ?? "");
    setPrinciple(archetype.composition_principle ?? "");
    setMotifs(listToText(archetype.visual_motifs));
    setTones(listToText(archetype.possible_tones));
    setBestFor(listToText(archetype.best_for));
    setAvoidFor(listToText(archetype.avoid_for));
  }, [archetype]);

  if (!archetype) return null;

  const save = async () => {
    setSaving(true);
    try {
      const updated = await sicaiApi.updateArchetype(archetype.id, {
        description,
        composition_principle: principle,
        visual_motifs: textToList(motifs),
        possible_tones: textToList(tones),
        best_for: textToList(bestFor),
        avoid_for: textToList(avoidFor),
      });
      toast.success("Archétype mis à jour");
      onSaved(updated);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur à l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm break-all">{archetype.archetype_id}</DialogTitle>
          <DialogDescription>
            {archetype.graphic_family} · {archetype.cardinality} · {archetype.representation_regime}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field id="desc" label="Description">
            <Textarea id="desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <Field id="prin" label="Principe de composition">
            <Textarea id="prin" rows={2} value={principle} onChange={(e) => setPrinciple(e.target.value)} />
          </Field>
          <Field id="motifs" label="Motifs visuels (un par ligne)">
            <Textarea id="motifs" rows={3} value={motifs} onChange={(e) => setMotifs(e.target.value)} />
          </Field>
          <Field id="tones" label="Tons possibles (un par ligne)">
            <Textarea id="tones" rows={3} value={tones} onChange={(e) => setTones(e.target.value)} />
          </Field>
          <Field id="best" label="Best for (un par ligne)">
            <Textarea id="best" rows={3} value={bestFor} onChange={(e) => setBestFor(e.target.value)} />
          </Field>
          <Field id="avoid" label="Avoid for (un par ligne)">
            <Textarea id="avoid" rows={3} value={avoidFor} onChange={(e) => setAvoidFor(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
