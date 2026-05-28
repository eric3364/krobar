import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import matricesData from "@/data/matrices.json";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Sparkles, Check, X, ZoomIn, Trash2 } from "lucide-react";
import KrobarSvg from "@/components/KrobarSvg";
import {
  getAllStates, getState, setState, subscribe, removeFromLibrary,
} from "@/lib/matriceLibrary";

type Matrice = {
  id: string;
  category: string;
  name: string;
  usage: string;
  components?: string[];
  components_status?: "verified" | "to_verify";
};

const CATALOG = matricesData as Matrice[];
const ALL_CATEGORIES = Array.from(new Set(CATALOG.map((m) => m.category)));

export default function AdminMatricePage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [states, setStates] = useState(getAllStates());
  const [zoomId, setZoomId] = useState<string | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);
  const [lexicons, setLexicons] = useState<Record<string, string>>({});
  const cancelRef = useRef(false);
  const tableScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => subscribe(() => setStates(getAllStates())), []);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("matrice_trigger_lexicon")
        .select("matrice_id, lexicon_yaml");
      if (error) return;
      const map: Record<string, string> = {};
      (data ?? []).forEach((r: any) => { map[r.matrice_id] = r.lexicon_yaml ?? ""; });
      setLexicons(map);
    })();
  }, []);

  const saveLexicon = useCallback(async (matriceId: string, yaml: string) => {
    setLexicons((prev) => ({ ...prev, [matriceId]: yaml }));
    const { error } = await supabase
      .from("matrice_trigger_lexicon")
      .upsert({ matrice_id: matriceId, lexicon_yaml: yaml }, { onConflict: "matrice_id" });
    if (error) toast.error(`Sauvegarde lexicon : ${error.message}`);
  }, []);

  useEffect(() => {
    const resetHorizontalScroll = () => {
      const node = tableScrollRef.current;
      if (!node) return;
      node.scrollLeft = 0;
    };

    resetHorizontalScroll();

    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        requestAnimationFrame(resetHorizontalScroll);
      }
    };

    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return CATALOG.filter((m) => {
      if (category !== "all" && m.category !== category) return false;
      if (q && !`${m.name} ${m.usage} ${m.category}`.toLowerCase().includes(q)) return false;
      const st = states[m.id]?.status ?? "idle";
      const inProd = states[m.id]?.inProduction;
      if (statusFilter === "production" && !inProd) return false;
      if (statusFilter === "library" && !states[m.id]?.validatedSvg) return false;
      if (statusFilter === "pending" && st !== "pending") return false;
      if (statusFilter === "untouched" && st !== "idle") return false;
      return true;
    });
  }, [search, category, statusFilter, states]);

  const generate = useCallback(async (m: Matrice) => {
    const s = getState(m.id);
    setState(m.id, { status: "generating" });
    try {
      const { data, error } = await supabase.functions.invoke("generate-matrix-svg", {
        body: {
          name: m.name, category: m.category, usage: m.usage, comment: s.comment ?? "",
        },
      });
      if (error) throw new Error(error.message);
      if (!data?.svg) throw new Error("Pas de SVG retourné");
      setState(m.id, { svg: data.svg, status: "pending" });
    } catch (e: any) {
      setState(m.id, { status: "idle" });
      toast.error(`${m.name} : ${e?.message ?? "échec"}`);
    }
  }, []);

  const validate = (id: string) => {
    const s = getState(id);
    if (!s.svg) return;
    setState(id, { validatedSvg: s.svg, status: "validated" });
    toast.success("Ajouté à la bibliothèque académique");
  };

  const reject = (id: string) => {
    setState(id, { svg: undefined, status: "idle" });
  };

  const runBatch = async () => {
    if (selected.size === 0) {
      toast.error("Sélectionnez au moins une matrice");
      return;
    }
    setBatchRunning(true);
    cancelRef.current = false;
    const items = CATALOG.filter((m) => selected.has(m.id));
    let done = 0;
    for (const m of items) {
      if (cancelRef.current) break;
      await generate(m);
      done++;
      toast.message(`Batch ${done}/${items.length}`);
    }
    setBatchRunning(false);
    toast.success("Batch terminé");
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    const allIds = filtered.map((m) => m.id);
    const allSelected = allIds.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) allIds.forEach((id) => next.delete(id));
      else allIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const zoomMatrice = zoomId ? CATALOG.find((m) => m.id === zoomId) : null;
  const zoomSvg = zoomId ? (states[zoomId]?.svg ?? states[zoomId]?.validatedSvg) : null;

  return (
    <>
      <Helmet><title>Matrice — Admin Krobar</title></Helmet>
      <div className="space-y-6 max-w-[1400px]">
        <div>
          <h1 className="text-3xl font-bold">Matrice</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Catalogue de {CATALOG.length} matrices et modèles. Génère, valide, et publie dans la bibliothèque académique.
          </p>
        </div>

        <Card className="p-4 flex flex-wrap items-center gap-3">
          <Input
            placeholder="Rechercher…" value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-[260px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes catégories</SelectItem>
              {ALL_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous statuts</SelectItem>
              <SelectItem value="untouched">Non générées</SelectItem>
              <SelectItem value="pending">À valider</SelectItem>
              <SelectItem value="library">En bibliothèque</SelectItem>
              <SelectItem value="production">En production</SelectItem>
            </SelectContent>
          </Select>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{selected.size} sélectionnée(s)</span>
            {batchRunning ? (
              <Button variant="destructive" size="sm" onClick={() => { cancelRef.current = true; }}>
                Annuler
              </Button>
            ) : (
              <Button size="sm" onClick={runBatch} disabled={selected.size === 0}>
                <Sparkles className="w-4 h-4" /> Générer la sélection
              </Button>
            )}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <Table
            containerRef={tableScrollRef}
            containerClassName="w-full overflow-x-auto"
            className="min-w-[1120px]"
          >
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={filtered.length > 0 && filtered.every((m) => selected.has(m.id))}
                    onCheckedChange={toggleAllVisible}
                  />
                </TableHead>
                <TableHead>Matrice</TableHead>
                <TableHead>Catégorie</TableHead>
                <TableHead className="w-[260px]">Commentaire IA</TableHead>
                <TableHead className="w-[120px]">Miniature</TableHead>
                <TableHead className="w-[180px]">Actions</TableHead>
                <TableHead className="w-[120px]">Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.slice(0, 200).map((m) => {
                const st = states[m.id] ?? { status: "idle" as const };
                const thumb = st.svg ?? st.validatedSvg;
                return (
                  <TableRow key={m.id}>
                    <TableCell>
                      <Checkbox
                        checked={selected.has(m.id)}
                        onCheckedChange={() => toggleSelect(m.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{m.name}</div>
                      <div className="text-xs text-muted-foreground line-clamp-1">{m.usage}</div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{m.category}</TableCell>
                    <TableCell>
                      <Textarea
                        rows={2}
                        placeholder="Indications de style, composition…"
                        defaultValue={st.comment ?? ""}
                        onBlur={(e) => {
                          if (e.target.value !== (st.comment ?? "")) {
                            setState(m.id, { comment: e.target.value });
                          }
                        }}
                        className="text-xs min-h-[44px]"
                      />
                    </TableCell>
                    <TableCell>
                      {thumb ? (
                        <button
                          onDoubleClick={() => setZoomId(m.id)}
                          onClick={() => setZoomId(m.id)}
                          className="block w-24 h-14 border rounded overflow-hidden bg-white hover:ring-2 hover:ring-primary"
                          title="Double-cliquer pour agrandir"
                        >
                          <KrobarSvg svg={thumb} className="w-full h-full [&>svg]:w-full [&>svg]:h-full" />
                        </button>
                      ) : (
                        <div className="w-24 h-14 border border-dashed rounded grid place-items-center text-[10px] text-muted-foreground">
                          —
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Button
                          size="sm" variant="outline"
                          disabled={st.status === "generating"}
                          onClick={() => generate(m)}
                        >
                          {st.status === "generating"
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <Sparkles className="w-3 h-3" />}
                          {st.validatedSvg ? "Régénérer" : "Générer"}
                        </Button>
                        {st.status === "pending" && (
                          <>
                            <Button size="sm" variant="default" onClick={() => validate(m.id)}>
                              <Check className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => reject(m.id)}>
                              <X className="w-3 h-3" />
                            </Button>
                          </>
                        )}
                        {thumb && (
                          <Button size="sm" variant="ghost" onClick={() => setZoomId(m.id)}>
                            <ZoomIn className="w-3 h-3" />
                          </Button>
                        )}
                        {st.validatedSvg && (
                          <Button size="sm" variant="ghost" onClick={() => removeFromLibrary(m.id)} title="Retirer de la bibliothèque">
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {st.inProduction && <Badge variant="default">En production</Badge>}
                        {st.validatedSvg && !st.inProduction && <Badge variant="secondary">Bibliothèque</Badge>}
                        {st.status === "pending" && <Badge variant="outline">À valider</Badge>}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {filtered.length > 200 && (
            <p className="p-3 text-xs text-muted-foreground text-center">
              {filtered.length - 200} lignes supplémentaires masquées — affinez la recherche.
            </p>
          )}
        </Card>
      </div>

      <Dialog open={!!zoomId} onOpenChange={(o) => !o && setZoomId(null)}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>{zoomMatrice?.name}</DialogTitle>
          </DialogHeader>
          {zoomSvg && (
            <div className="bg-white rounded p-4">
              <KrobarSvg svg={zoomSvg} className="w-full [&>svg]:w-full [&>svg]:h-auto" />
            </div>
          )}
          {zoomId && (states[zoomId]?.status === "pending") && (
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { reject(zoomId); setZoomId(null); }}>
                <X className="w-4 h-4" /> Refuser
              </Button>
              <Button onClick={() => { validate(zoomId); setZoomId(null); }}>
                <Check className="w-4 h-4" /> Valider et ajouter
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
