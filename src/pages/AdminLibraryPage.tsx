// Vue A — /admin/library : liste des templates Premium et résumé de la bibliothèque.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, ImageOff, Loader2 } from "lucide-react";
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

type ThumbState = { svg?: string; loading: boolean; empty?: boolean };

export default function AdminLibraryPage() {
  const [templates, setTemplates] = useState<LibraryTemplate[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [thumbs, setThumbs] = useState<Record<string, ThumbState>>({});

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

  // Lazy-load une miniature (dernier aperçu) pour chaque template ayant au moins 1 aperçu.
  useEffect(() => {
    if (!templates) return;
    let cancelled = false;
    (async () => {
      for (const t of templates) {
        if (cancelled) return;
        if (thumbs[t.id]) continue;
        if (t.preview_count === 0) {
          setThumbs((s) => ({ ...s, [t.id]: { loading: false, empty: true } }));
          continue;
        }
        setThumbs((s) => ({ ...s, [t.id]: { loading: true } }));
        try {
          const list = await libraryApi.listPreviews(t.id);
          const first = list.previews?.[0];
          if (!first) {
            if (!cancelled) setThumbs((s) => ({ ...s, [t.id]: { loading: false, empty: true } }));
            continue;
          }
          const full = await libraryApi.getPreview(first.id);
          if (!cancelled) setThumbs((s) => ({ ...s, [t.id]: { loading: false, svg: full.rendered_svg } }));
        } catch {
          if (!cancelled) setThumbs((s) => ({ ...s, [t.id]: { loading: false, empty: true } }));
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates]);

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
          {sorted.map((t) => {
            const th = thumbs[t.id];
            return (
              <Link key={t.id} to={`/admin/library/${encodeURIComponent(t.id)}`} className="block">
                <Card className="h-full hover:border-primary transition-colors overflow-hidden flex flex-col">
                  <div className="aspect-[16/10] w-full bg-muted/30 border-b flex items-center justify-center overflow-hidden">
                    {th?.svg ? (
                      <div
                        className="w-full h-full [&>svg]:w-full [&>svg]:h-full [&>svg]:block"
                        dangerouslySetInnerHTML={{ __html: th.svg }}
                      />
                    ) : th?.empty ? (
                      <div className="flex flex-col items-center gap-1 text-muted-foreground">
                        <ImageOff className="w-6 h-6" />
                        <span className="text-xs">aucun aperçu</span>
                      </div>
                    ) : (
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    )}
                  </div>
                  <div className="p-5 space-y-3 flex-1">
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
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
