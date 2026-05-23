import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, Plus, Pencil, Copy, Archive, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const EXPECTED_TOTAL = 72;

type Theme = {
  id: string;
  code: string;
  label_fr: string;
  description: string | null;
  status: string;
  is_protected: boolean;
  version: number;
  updated_at: string;
};

type StatusFilter = "all" | "draft" | "active" | "archived";

const STATUS_VARIANT: Record<string, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-muted text-muted-foreground" },
  active: { label: "Active", cls: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" },
  archived: { label: "Archivé", cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
};

export default function SicaiThemesPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Theme[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const reload = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("sicai_themes")
        .select("id,code,label_fr,description,status,is_protected,version,updated_at");
      if (error) throw error;
      const themes = (data ?? []) as Theme[];
      setItems(themes);

      // Fetch published archetype counts per theme
      const { data: arch, error: aErr } = await supabase
        .from("sicai_archetypes")
        .select("theme_id")
        .eq("is_published", true);
      if (aErr) throw aErr;
      const c: Record<string, number> = {};
      for (const r of (arch ?? []) as { theme_id: string | null }[]) {
        if (!r.theme_id) continue;
        c[r.theme_id] = (c[r.theme_id] ?? 0) + 1;
      }
      setCounts(c);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);

  const filtered = useMemo(() => {
    const f = statusFilter === "all" ? items : items.filter((t) => t.status === statusFilter);
    return [...f].sort((a, b) => {
      if (a.is_protected !== b.is_protected) return a.is_protected ? -1 : 1;
      return b.updated_at.localeCompare(a.updated_at);
    });
  }, [items, statusFilter]);

  const onDuplicate = async (t: Theme) => {
    try {
      const { data: full, error } = await supabase
        .from("sicai_themes").select("*").eq("id", t.id).single();
      if (error) throw error;
      let newCode = `${t.code}_copy`;
      // ensure unique
      for (let i = 2; i < 50; i++) {
        const { data: ex } = await supabase.from("sicai_themes").select("id").eq("code", newCode).maybeSingle();
        if (!ex) break;
        newCode = `${t.code}_copy${i}`;
      }
      const { id: _id, created_at: _c, updated_at: _u, is_protected: _p, ...rest } = full as Record<string, unknown>;
      void _id; void _c; void _u; void _p;
      const { data: inserted, error: insErr } = await supabase
        .from("sicai_themes")
        .insert({ ...rest, code: newCode, is_protected: false, status: "draft", label_fr: `${t.label_fr} (copie)` })
        .select("id")
        .single();
      if (insErr) throw insErr;
      toast.success("Thème dupliqué");
      navigate(`/admin/sicai/themes/${inserted.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur de duplication");
    }
  };

  const onArchive = async (t: Theme) => {
    if (t.is_protected) return;
    if (!confirm(`Archiver le thème "${t.label_fr}" ?`)) return;
    try {
      const { error } = await supabase
        .from("sicai_themes")
        .update({ status: "archived" })
        .eq("id", t.id);
      if (error) throw error;
      toast.success("Thème archivé");
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur d'archivage");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div>
            <div className="text-xs text-muted-foreground">
              <Link to="/admin/sicai" className="hover:underline">SICAI</Link> / Thèmes
            </div>
            <h1 className="text-2xl font-semibold">Thèmes SICAI</h1>
          </div>
          <Button onClick={() => navigate("/admin/sicai/themes/new")}>
            <Plus className="mr-2 h-4 w-4" /> Nouveau thème
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        <div className="flex flex-wrap gap-2">
          {([
            ["all", "Tous"],
            ["draft", "Draft"],
            ["active", "Active"],
            ["archived", "Archivé"],
          ] as [StatusFilter, string][]).map(([k, label]) => (
            <Button
              key={k}
              variant={statusFilter === k ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(k)}
            >
              {label}
            </Button>
          ))}
          <div className="ml-auto text-sm text-muted-foreground self-center">
            {filtered.length} thème{filtered.length > 1 ? "s" : ""}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            Aucun thème pour ce filtre.
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((t) => {
              const sv = STATUS_VARIANT[t.status] ?? STATUS_VARIANT.draft;
              const n = counts[t.id] ?? 0;
              return (
                <Card key={t.id} className="p-4 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="text-xs font-mono bg-muted px-2 py-0.5 rounded">{t.code}</code>
                      <Badge className={sv.cls} variant="secondary">{sv.label}</Badge>
                      {t.is_protected && (
                        <Badge variant="outline" className="gap-1">
                          <Shield className="h-3 w-3" /> Protégé
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="font-medium">{t.label_fr}</div>
                    {t.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                        {t.description}
                      </p>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {n} archétype{n > 1 ? "s" : ""} publié{n > 1 ? "s" : ""} / {EXPECTED_TOTAL}
                  </div>
                  <div className="flex gap-2 mt-auto pt-2 border-t">
                    <Button size="sm" variant="outline" onClick={() => navigate(`/admin/sicai/themes/${t.id}`)}>
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Éditer
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => onDuplicate(t)}>
                      <Copy className="h-3.5 w-3.5 mr-1" /> Dupliquer
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={t.is_protected || t.status === "archived"}
                      onClick={() => onArchive(t)}
                      title={t.is_protected ? "Thème protégé" : ""}
                    >
                      <Archive className="h-3.5 w-3.5 mr-1" /> Archiver
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
