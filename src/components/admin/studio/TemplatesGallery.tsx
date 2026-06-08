import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ImageOff, Loader2, RefreshCw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import {
  templatesLifecycleApi,
  type InventoryResponse,
  type InventoryTemplate,
} from "@/lib/templatesLifecycleApi";

type StatusFilter = "all" | "active" | "disabled";

const SVG_BASE = "https://krobar.online/templates/";

function TemplateThumb({ tpl }: { tpl: InventoryTemplate }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    let alive = true;
    if (!tpl.svg_exists) {
      setState("error");
      return;
    }
    setState("loading");
    setSvg(null);
    fetch(`${SVG_BASE}${tpl.file}`)
      .then((r) => r.ok ? r.text() : Promise.reject(new Error(String(r.status))))
      .then((txt) => {
        if (!alive) return;
        setSvg(txt);
        setState("ok");
      })
      .catch(() => alive && setState("error"));
    return () => { alive = false; };
  }, [tpl.file, tpl.svg_exists]);

  if (state === "loading") {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (state === "error" || !svg) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-muted-foreground">
        <ImageOff className="w-6 h-6" />
        <span className="text-xs">SVG manquant</span>
      </div>
    );
  }
  return (
    <div
      className="w-full h-full [&>svg]:w-full [&>svg]:h-full [&>svg]:block"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export default function TemplatesGallery() {
  const [data, setData] = useState<InventoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<InventoryTemplate | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await templatesLifecycleApi.inventory();
      setData(r);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const tiers = useMemo(() => {
    const s = new Set<string>();
    data?.templates.forEach((t) => s.add(t.tier));
    return Array.from(s).sort();
  }, [data]);

  const categories = useMemo(() => {
    const s = new Set<string>();
    data?.templates.forEach((t) => s.add(t.category));
    return Array.from(s).sort();
  }, [data]);

  const filtered = useMemo(() => {
    const items = data?.templates ?? [];
    const q = search.trim().toLowerCase();
    return items.filter((t) => {
      if (tierFilter !== "all" && t.tier !== tierFilter) return false;
      if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
      if (statusFilter === "active" && t.disabled) return false;
      if (statusFilter === "disabled" && !t.disabled) return false;
      if (q && !t.name.toLowerCase().includes(q) && !t.id.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, search, tierFilter, categoryFilter, statusFilter]);

  const handleToggle = async (tpl: InventoryTemplate, next: boolean) => {
    setTogglingId(tpl.id);
    try {
      await templatesLifecycleApi.setDisabled(tpl.id, next);
      toast.success(next ? `« ${tpl.name} » désactivé` : `« ${tpl.name} » réactivé`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de la bascule");
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await templatesLifecycleApi.remove(deleteTarget.id);
      toast.success(`« ${deleteTarget.name} » supprimé définitivement`);
      setDeleteTarget(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de la suppression");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="text-xs uppercase text-muted-foreground">Total</div>
          <div className="text-2xl font-bold">{data?.total ?? "—"}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase text-muted-foreground">Actifs</div>
          <div className="text-2xl font-bold text-green-600">{data?.active ?? "—"}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase text-muted-foreground">Désactivés</div>
          <div className="text-2xl font-bold text-muted-foreground">{data?.disabled ?? "—"}</div>
        </Card>
      </div>

      <Card className="p-4 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs font-medium text-muted-foreground">Recherche</label>
            <Input
              placeholder="Nom ou identifiant…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block">Tier</label>
            <Select value={tierFilter} onValueChange={setTierFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                {tiers.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block">Catégorie</label>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes</SelectItem>
                {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block">Statut</label>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                <SelectItem value="active">Actifs</SelectItem>
                <SelectItem value="disabled">Désactivés</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Rafraîchir
          </Button>
        </div>

        {loading ? (
          <div className="py-12 text-center"><Loader2 className="animate-spin mx-auto" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            Aucun template ne correspond aux filtres.
          </div>
        ) : (
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}
          >
            {filtered.map((t) => (
              <Card
                key={t.id}
                className={`overflow-hidden flex flex-col ${t.disabled ? "opacity-50 grayscale" : ""}`}
              >
                <div className="aspect-[4/3] w-full bg-muted/30 border-b overflow-hidden">
                  <TemplateThumb tpl={t} />
                </div>
                <div className="p-3 flex-1 flex flex-col gap-2">
                  <div>
                    <div className="font-medium leading-tight line-clamp-2">{t.name}</div>
                    <div className="font-mono text-[11px] text-muted-foreground truncate" title={t.id}>
                      {t.id}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="secondary" className="text-[10px]">{t.category}</Badge>
                    <Badge variant="outline" className="text-[10px]">{t.tier}</Badge>
                    {t.figurative && (
                      <Badge className="text-[10px] bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30">
                        figuratif
                      </Badge>
                    )}
                    {!t.svg_exists && (
                      <Badge variant="destructive" className="text-[10px] gap-1">
                        <AlertTriangle className="w-3 h-3" /> SVG manquant
                      </Badge>
                    )}
                    {t.disabled
                      ? <Badge variant="outline" className="text-[10px] text-muted-foreground">Désactivé</Badge>
                      : <Badge className="text-[10px] bg-green-600 hover:bg-green-600">Actif</Badge>}
                  </div>
                  <div className="mt-auto pt-2 flex items-center justify-between border-t">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={!t.disabled}
                        disabled={togglingId === t.id}
                        onCheckedChange={(v) => handleToggle(t, !v)}
                        aria-label="Activer/désactiver"
                      />
                      <span className="text-xs text-muted-foreground">
                        {t.disabled ? "Off" : "On"}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setDeleteTarget(t)}
                      title="Supprimer définitivement (irréversible)"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Désactiver retire le template du matching sans le supprimer (réversible).
          Supprimer efface le manifest et le SVG : action irréversible.
        </p>
      </Card>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" /> Suppression définitive
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                Vous êtes sur le point de supprimer définitivement{" "}
                <strong>« {deleteTarget?.name} »</strong>.
              </span>
              <span className="block">
                Cette action est <strong>irréversible</strong> : le SVG sera supprimé,
                le manifest mis à jour et le cache vidé. Aucun retour arrière possible.
              </span>
              <span className="block text-xs text-muted-foreground">
                Si vous souhaitez seulement le retirer du matching, utilisez la bascule Activer/Désactiver.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1" />}
              Supprimer définitivement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
