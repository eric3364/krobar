import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, AlertTriangle, Info } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type TemplateFamily = {
  id: string;
  name: string;
  description: string;
  template_count: number;
  enabled: boolean;
};

type FamiliesResponse = {
  families: TemplateFamily[];
  total_enabled_templates?: number;
  total_templates?: number;
};

async function callProxy<T>(path: string, method: "GET" | "PUT", payload?: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke("krobar-proxy", {
    body: { path, method, payload },
  });
  if (error) {
    const ctx = (error as unknown as { context?: Response }).context;
    let detail = error.message;
    if (ctx instanceof Response) {
      try {
        const body = (await ctx.clone().json()) as { error?: string };
        if (body?.error) detail = body.error;
      } catch {
        /* ignore */
      }
    }
    throw new Error(detail || "Erreur backend");
  }
  if (data && typeof data === "object" && "error" in data) {
    const err = (data as { error?: string; status?: number }).error;
    if (err) {
      const e = new Error(err) as Error & { status?: number };
      e.status = (data as { status?: number }).status;
      throw e;
    }
  }
  return data as T;
}

export default function AdminFamiliesPage() {
  const [families, setFamilies] = useState<TemplateFamily[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notReady, setNotReady] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotReady(false);
    try {
      const data = await callProxy<FamiliesResponse>("/admin/template-families", "GET");
      setFamilies(data.families ?? []);
    } catch (e) {
      const err = e as Error & { status?: number };
      if (err.status === 404 || /404|introuvable|not found/i.test(err.message)) {
        setNotReady(true);
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const totals = useMemo(() => {
    const total = families.reduce((s, f) => s + f.template_count, 0);
    const enabled = families
      .filter((f) => f.enabled)
      .reduce((s, f) => s + f.template_count, 0);
    return { total, enabled };
  }, [families]);

  const disabledFamilies = families.filter((f) => !f.enabled);
  const allDisabled = families.length > 0 && disabledFamilies.length === families.length;

  const toggleFamily = async (family: TemplateFamily, enabled: boolean) => {
    setBusyId(family.id);
    const previous = family.enabled;
    setFamilies((prev) => prev.map((f) => (f.id === family.id ? { ...f, enabled } : f)));
    try {
      await callProxy(`/admin/template-families/${family.id}`, "PUT", { enabled });
      toast.success(
        enabled
          ? `Famille « ${family.name} » activée`
          : `Famille « ${family.name} » désactivée. ${family.template_count} templates exclus du matching.`,
      );
    } catch (e) {
      setFamilies((prev) => prev.map((f) => (f.id === family.id ? { ...f, enabled: previous } : f)));
      toast.error(e instanceof Error ? e.message : "Erreur lors de la mise à jour");
    } finally {
      setBusyId(null);
    }
  };

  const bulkSet = async (enabled: boolean) => {
    const targets = families.filter((f) => f.enabled !== enabled);
    if (targets.length === 0) return;
    setBusyId("__bulk__");
    const snapshot = families;
    setFamilies((prev) => prev.map((f) => ({ ...f, enabled })));
    try {
      const results = await Promise.allSettled(
        targets.map((f) =>
          callProxy(`/admin/template-families/${f.id}`, "PUT", { enabled }),
        ),
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) {
        toast.error(`${failed} famille(s) n'ont pas pu être mises à jour. Rechargement.`);
        await load();
      } else {
        toast.success(enabled ? "Toutes les familles ont été activées" : "Toutes les familles ont été désactivées");
      }
    } catch (e) {
      setFamilies(snapshot);
      toast.error(e instanceof Error ? e.message : "Erreur lors de la mise à jour");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="min-h-screen p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/admin"><ArrowLeft className="w-4 h-4" /> Retour</Link>
          </Button>
          <h1 className="text-3xl font-bold mt-2">Familles de templates</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Activez ou désactivez des familles entières pour adapter le matching et les tests à votre contexte.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
          Chargement des familles…
        </div>
      ) : notReady ? (
        <Card className="p-6 space-y-3">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-muted-foreground mt-0.5" />
            <div className="space-y-1">
              <p className="font-medium">Fonctionnalité en cours de déploiement</p>
              <p className="text-sm text-muted-foreground">
                L'API d'administration des familles n'est pas encore disponible côté backend.
                Reviens dans quelques minutes.
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={load}>Réessayer</Button>
        </Card>
      ) : error ? (
        <Card className="p-6 space-y-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive mt-0.5" />
            <div>
              <p className="font-medium">Erreur de chargement</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={load}>Réessayer</Button>
        </Card>
      ) : (
        <>
          <Card className="p-5 flex items-center justify-between flex-wrap gap-4">
            <div>
              <p className="text-2xl font-semibold tabular-nums">
                {totals.enabled} <span className="text-muted-foreground">/ {totals.total}</span>
              </p>
              <p className="text-sm text-muted-foreground">templates actifs</p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={busyId !== null || families.every((f) => f.enabled)}
                onClick={() => bulkSet(true)}
              >
                Tout activer
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={busyId !== null || families.every((f) => !f.enabled)}
                  >
                    Tout désactiver
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Désactiver toutes les familles ?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Tu vas désactiver toutes les familles. Le matching ne fonctionnera plus jusqu'à
                      réactivation d'au moins une famille.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction onClick={() => bulkSet(false)}>Confirmer</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </Card>

          {allDisabled && (
            <Card className="p-4 border-destructive/50 bg-destructive/5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-destructive mt-0.5" />
                <div>
                  <p className="font-medium text-destructive">Aucun template disponible</p>
                  <p className="text-sm text-muted-foreground">
                    Le matching ne fonctionnera pas. Réactive au moins une famille.
                  </p>
                </div>
              </div>
            </Card>
          )}

          {!allDisabled && disabledFamilies.length > 0 && (
            <Card className="p-4 border-amber-500/40 bg-amber-500/5">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-amber-600 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium">
                    {disabledFamilies.length} famille{disabledFamilies.length > 1 ? "s" : ""} désactivée
                    {disabledFamilies.length > 1 ? "s" : ""}
                  </p>
                  <p className="text-muted-foreground">
                    {disabledFamilies.map((f) => f.name).join(" · ")} — leurs templates ne sont plus suggérés
                    ni testés.
                  </p>
                </div>
              </div>
            </Card>
          )}

          <div className="space-y-3">
            {families.map((family) => (
              <Card key={family.id} className="p-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold">{family.name}</h3>
                      <span className="text-sm text-muted-foreground tabular-nums">
                        ({family.template_count})
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{family.description}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`text-xs font-medium ${family.enabled ? "text-foreground" : "text-muted-foreground"}`}>
                      {family.enabled ? "Actif" : "Inactif"}
                    </span>
                    <Switch
                      checked={family.enabled}
                      disabled={busyId !== null}
                      onCheckedChange={(v) => toggleFamily(family, v)}
                    />
                  </div>
                </div>
              </Card>
            ))}
            {families.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">Aucune famille retournée par le backend.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
