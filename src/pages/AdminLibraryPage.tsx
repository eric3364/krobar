// Vue A — /admin/library : liste des templates Premium et résumé de la bibliothèque.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { libraryApi, type LibraryTemplate } from "@/lib/libraryApi";

function relativeDate(iso: string | null): string {
  if (!iso) return "aucun";
  try {
    return `il y a ${formatDistanceToNow(new Date(iso), { locale: fr })}`;
  } catch {
    return "—";
  }
}

export default function AdminLibraryPage() {
  const [templates, setTemplates] = useState<LibraryTemplate[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const res = await libraryApi.listTemplates();
        if (alive) setTemplates(res.templates ?? []);
      } catch (e) {
        if (alive) {
          toast.error(e instanceof Error ? e.message : "Erreur de chargement");
          setTemplates([]);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const sorted = useMemo(() => {
    if (!templates) return [];
    return [...templates].sort((a, b) => {
      if (!a.last_preview_at && !b.last_preview_at) return a.name.localeCompare(b.name);
      if (!a.last_preview_at) return 1;
      if (!b.last_preview_at) return -1;
      return new Date(b.last_preview_at).getTime() - new Date(a.last_preview_at).getTime();
    });
  }, [templates]);

  const validatedTotal = templates?.filter((t) => t.validated_count > 0).length ?? 0;

  return (
    <div className="min-h-screen p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin"><ArrowLeft className="w-4 h-4 mr-1" /> Retour back-office</Link>
        </Button>
        <h1 className="text-3xl font-bold mt-2">Bibliothèque Premium</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {loading
            ? "Chargement…"
            : `${templates?.length ?? 0} templates Premium · ${validatedTotal} ont des aperçus validés`}
        </p>
      </div>

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-44 w-full" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">
          Aucun template Premium n'a encore été créé. Allez dans Studio pour en créer un.
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sorted.map((t) => (
            <Link key={t.id} to={`/admin/library/${encodeURIComponent(t.id)}`} className="block">
              <Card className="p-5 h-full hover:border-primary transition-colors space-y-3">
                <div>
                  <h3 className="font-semibold text-lg leading-tight">{t.name}</h3>
                  <Badge variant="secondary" className="mt-1">{t.category || "—"}</Badge>
                </div>
                {t.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">{t.description}</p>
                )}
                <div className="flex items-baseline gap-2 pt-1">
                  <span className="text-2xl font-bold">{t.preview_count}</span>
                  <span className="text-sm text-muted-foreground">
                    {t.preview_count > 1 ? "aperçus" : "aperçu"}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-sm">
                  {t.validated_count > 0 ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                        {t.validated_count} validé{t.validated_count > 1 ? "s" : ""}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">aucun validé</span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground pt-1 border-t">
                  Dernier : {relativeDate(t.last_preview_at)}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
