import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Loader2, AlertTriangle, Trash2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
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

export default function AdminTemplatesLifecyclePage() {
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
      const r = await templatesLifecycleApi.setDisabled(tpl.id, next);
      setData((prev) => prev ? {
        ...prev,
        active: prev.active + (next ? -1 : 1),
        disabled: prev.disabled + (next ? 1 : -1),
        templates: prev.templates.map((x) => x.id === tpl.id ? { ...x, disabled: r.disabled } : x),
      } : prev);
      toast.success(next ? `« ${tpl.name} » désactivé` : `« ${tpl.name} » réactivé`);
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
      setData((prev) => prev ? {
        ...prev,
        total: prev.total - 1,
        active: prev.active - (deleteTarget.disabled ? 0 : 1),
        disabled: prev.disabled - (deleteTarget.disabled ? 1 : 0),
        templates: prev.templates.filter((x) => x.id !== deleteTarget.id),
      } : prev);
      toast.success(`« ${deleteTarget.name} » supprimé définitivement`);
      setDeleteTarget(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de la suppression");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-screen p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/admin"><ArrowLeft className="w-4 h-4" /> Retour</Link>
          </Button>
          <h1 className="text-3xl font-bold mt-2">Cycle de vie des templates</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Inventaire complet : activer / désactiver (réversible) ou supprimer définitivement.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Rafraîchir
        </Button>
      </div>

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
        </div>

        {loading ? (
          <div className="py-12 text-center"><Loader2 className="animate-spin mx-auto" /></div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Catégorie</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Figuratif</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((t) => (
                  <TableRow key={t.id} className={t.disabled ? "opacity-60" : ""}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div>
                          <div className="font-medium">{t.name}</div>
                          <div className="font-mono text-[11px] text-muted-foreground">{t.id}</div>
                        </div>
                        {!t.svg_exists && (
                          <Badge variant="destructive" className="gap-1">
                            <AlertTriangle className="w-3 h-3" /> SVG manquant
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{t.category}</TableCell>
                    <TableCell><Badge variant="outline">{t.tier}</Badge></TableCell>
                    <TableCell>
                      {t.figurative
                        ? <Badge variant="secondary">Oui</Badge>
                        : <span className="text-muted-foreground text-xs">—</span>}
                    </TableCell>
                    <TableCell>
                      {t.disabled
                        ? <Badge variant="outline" className="text-muted-foreground">Désactivé</Badge>
                        : <Badge className="bg-green-600 hover:bg-green-600">Actif</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {t.disabled ? "Off" : "On"}
                          </span>
                          <Switch
                            checked={!t.disabled}
                            disabled={togglingId === t.id}
                            onCheckedChange={(v) => handleToggle(t, !v)}
                            aria-label="Activer/désactiver"
                          />
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
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      Aucun template ne correspond aux filtres.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
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
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Supprimer définitivement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
