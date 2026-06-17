// Vue A — /admin/library : liste des templates Premium et résumé de la bibliothèque.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, ImageOff, Loader2, RefreshCw, Pencil } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { libraryApi, type LibraryTemplate } from "@/lib/libraryApi";
import { studioV2Api, FAMILY_LABEL, type CoverageCell } from "@/lib/studioV2Api";
import { templatesLifecycleApi, type InventoryTemplate } from "@/lib/templatesLifecycleApi";

type StudioIllustration = {
  id: string;
  file: string;
  cardinality_n: number;
  domain: string;
  cell: CoverageCell;
};

function relativeDate(iso: string | null): string {
  if (!iso) return "aucun";
  try {
    return `il y a ${formatDistanceToNow(new Date(iso), { locale: fr })}`;
  } catch {
    return "—";
  }
}

type ThumbState = { svg?: string; loading: boolean; empty?: boolean };

const sicaiIndexFromTemplateId = (templateId: string): string | null => {
  const match = /^([a-z]{2})(\d+)([csa])(?:_|$)/i.exec(templateId);
  return match ? `${match[1].toUpperCase()}-${match[2]}-${match[3].toUpperCase()}` : null;
};

const cardinalityFromTemplateId = (templateId: string, fallback: number): number => {
  const match = /_(\d+)$/i.exec(templateId);
  return match ? Number(match[1]) : fallback;
};

const inferDomainForTemplateId = (cell: CoverageCell, templateId: string): string => {
  const targetBase = templateId.replace(/_\d+$/i, "");
  const byDomain = cell.production?.by_domain ?? {};
  for (const [domain, dp] of Object.entries(byDomain)) {
    if ((dp.produced ?? []).some((p) => p.id === templateId)) return domain;
  }
  for (const [domain, dp] of Object.entries(byDomain)) {
    if ((dp.produced ?? []).some((p) => p.id.replace(/_\d+$/i, "") === targetBase)) return domain;
  }
  return Object.entries(byDomain).find(([, dp]) => dp.in_grid)?.[0] ?? Object.keys(byDomain)[0] ?? "_none";
};

const buildInventoryIllustration = (
  template: InventoryTemplate,
  cells: CoverageCell[],
): StudioIllustration | null => {
  if (template.disabled || !template.svg_exists || !/^([a-z]{2})\d+[csa]_/i.test(template.id)) return null;
  const index = sicaiIndexFromTemplateId(template.id);
  const cell = index ? cells.find((c) => c.index === index) : null;
  if (!cell) return null;
  return {
    id: template.id,
    file: template.file,
    cardinality_n: cardinalityFromTemplateId(template.id, cell.production?.canonical_cardinality ?? 1),
    domain: inferDomainForTemplateId(cell, template.id),
    cell,
  };
};

export default function AdminLibraryPage() {
  const [templates, setTemplates] = useState<LibraryTemplate[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [thumbs, setThumbs] = useState<Record<string, ThumbState>>({});
  const [illustrations, setIllustrations] = useState<StudioIllustration[] | null>(null);
  const [illustrationsLoading, setIllustrationsLoading] = useState(true);
  const [illustrationsError, setIllustrationsError] = useState<string | null>(null);
  const [illustrationSearch, setIllustrationSearch] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [newCount, setNewCount] = useState(0);
  const prevIdsRef = useRef<Set<string> | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

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

  // Récupère toutes les illustrations produites via le Studio (coverage SICAI).
  const fetchIllustrations = useCallback(async (opts?: { initial?: boolean; manual?: boolean }) => {
    if (opts?.initial) setIllustrationsLoading(true);
    if (opts?.manual) setRefreshing(true);
    try {
      const res = await studioV2Api.coverage();
      // Regroupe les variantes (id sans suffixe _N) et garde la plus grande cardinalité.
      const bestByKey = new Map<string, StudioIllustration>();
      for (const cell of res.cells ?? []) {
        const byDomain = cell.production?.by_domain ?? {};
        for (const [domain, dp] of Object.entries(byDomain)) {
          for (const p of dp.produced ?? []) {
            const baseId = p.id.replace(/_\d+$/, "");
            const key = `${cell.index}::${domain}::${baseId}`;
            const candidate: StudioIllustration = {
              id: p.id,
              file: p.file,
              cardinality_n: p.cardinality,
              domain,
              cell,
            };
            const prev = bestByKey.get(key);
            if (!prev || candidate.cardinality_n > prev.cardinality_n) {
              bestByKey.set(key, candidate);
            }
          }
        }
      }
      const out = Array.from(bestByKey.values());
      out.sort((a, b) => a.id.localeCompare(b.id));

      // Détection des nouvelles vignettes (clé = id+file).
      const keyOf = (it: StudioIllustration) => `${it.id}::${it.file}`;
      const currentKeys = new Set(out.map(keyOf));
      const prevKeys = prevIdsRef.current;
      if (prevKeys && !opts?.initial) {
        const fresh = new Set<string>();
        for (const k of currentKeys) if (!prevKeys.has(k)) fresh.add(k);
        if (fresh.size > 0) {
          setNewIds(fresh);
          setNewCount((c) => c + fresh.size);
          if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
          highlightTimerRef.current = setTimeout(() => setNewIds(new Set()), 6000);
        }
      }
      prevIdsRef.current = currentKeys;

      setIllustrations(out);
      setIllustrationsError(null);
    } catch (e) {
      setIllustrationsError(e instanceof Error ? e.message : "Erreur de chargement");
      if (opts?.initial) setIllustrations([]);
    } finally {
      if (opts?.initial) setIllustrationsLoading(false);
      if (opts?.manual) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchIllustrations({ initial: true });
  }, [fetchIllustrations]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => {
      fetchIllustrations();
    }, 5000);
    return () => clearInterval(id);
  }, [autoRefresh, fetchIllustrations]);

  useEffect(() => () => {
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
  }, []);

  // Au retour depuis l'éditeur Studio (state.refreshTemplateId), rafraîchit l'inventaire
  // pour refléter le nouveau placement de la vignette éditée.
  useEffect(() => {
    const state = location.state as { refreshTemplateId?: string } | null;
    if (state?.refreshTemplateId) {
      fetchIllustrations({ manual: true });
      // nettoie le state pour ne pas reboucler si l'utilisateur navigue
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location, navigate, fetchIllustrations]);

  // Ouvre la vignette dans l'éditeur de placement du Studio.
  const openInEditor = useCallback((it: StudioIllustration) => {
    navigate(`/admin/studio?templateId=${encodeURIComponent(it.id)}&returnTo=library`, {
      state: { fromLibrary: true, templateId: it.id },
    });
  }, [navigate]);




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

  const filteredIllustrations = useMemo(() => {
    if (!illustrations) return [];
    const q = illustrationSearch.trim().toLowerCase();
    if (!q) return illustrations;
    return illustrations.filter((it) =>
      it.id.toLowerCase().includes(q) ||
      it.file.toLowerCase().includes(q) ||
      it.domain.toLowerCase().includes(q) ||
      it.cell.index.toLowerCase().includes(q) ||
      it.cell.family.toLowerCase().includes(q),
    );
  }, [illustrations, illustrationSearch]);


  return (
    <div className="min-h-screen p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin"><ArrowLeft className="w-4 h-4 mr-1" /> Retour back-office</Link>
        </Button>
        <h1 className="text-3xl font-bold mt-2">Bibliothèque</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {loading
            ? "Chargement…"
            : `${templates?.length ?? 0} templates · ${validatedTotal} ont des aperçus validés`}
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
          Aucun template n'a encore été créé. Allez dans Studio pour en créer un.
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

      {/* ------- Illustrations produites via le Studio ------- */}
      <div className="pt-6 border-t">
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold">Illustrations Studio</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {illustrationsLoading
                ? "Chargement…"
                : illustrationsError
                ? `Erreur : ${illustrationsError}`
                : `${illustrations?.length ?? 0} illustration${(illustrations?.length ?? 0) > 1 ? "s" : ""} générée${(illustrations?.length ?? 0) > 1 ? "s" : ""} via le Studio`}
              {newCount > 0 && (
                <span className="ml-2 inline-flex items-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 px-2 py-0.5 text-xs font-medium">
                  +{newCount} nouvelle{newCount > 1 ? "s" : ""}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Switch
                id="auto-refresh"
                checked={autoRefresh}
                onCheckedChange={setAutoRefresh}
              />
              <Label htmlFor="auto-refresh" className="text-xs cursor-pointer">
                Rafraîchissement auto
              </Label>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setNewCount(0);
                fetchIllustrations({ manual: true });
              }}
              disabled={refreshing}
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1 ${refreshing ? "animate-spin" : ""}`} />
              Rafraîchir maintenant
            </Button>
            <Input
              placeholder="Rechercher (id, fichier, domaine, cellule…)"
              value={illustrationSearch}
              onChange={(e) => setIllustrationSearch(e.target.value)}
              className="max-w-xs"
            />
          </div>
        </div>


        {illustrationsLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-56 w-full" />
            ))}
          </div>
        ) : filteredIllustrations.length === 0 ? (
          <Card className="p-10 text-center text-muted-foreground mt-4">
            {illustrationSearch
              ? "Aucune illustration ne correspond à la recherche."
              : "Aucune illustration n'a encore été produite via le Studio."}
          </Card>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-4">
            {filteredIllustrations.map((it) => {
              const familyLabel = FAMILY_LABEL[it.cell.family] ?? it.cell.family;
              const isNew = newIds.has(`${it.id}::${it.file}`);
              return (
                <Card
                  key={`${it.id}-${it.file}`}
                  onDoubleClick={() => openInEditor(it)}
                  title="Double-cliquez pour éditer le placement"
                  className={`group relative overflow-hidden flex flex-col transition-all cursor-pointer select-none ${
                    isNew ? "ring-2 ring-emerald-500/60 shadow-lg" : ""
                  }`}
                >
                  <div className="aspect-[4/3] w-full bg-muted/30 border-b flex items-center justify-center overflow-hidden relative">
                    <img
                      src={`https://krobar.online/templates/${it.file}`}
                      alt={it.id}
                      className="w-full h-full object-contain"
                      loading="lazy"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity shadow-md h-7 px-2 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        openInEditor(it);
                      }}
                    >
                      <Pencil className="w-3 h-3 mr-1" />
                      Éditer le placement
                    </Button>
                  </div>
                  <div className="p-4 space-y-2 flex-1">
                    <div>
                      <h3 className="font-semibold text-sm leading-tight break-words" title={it.id}>
                        {it.id}
                      </h3>
                      <div className="font-mono text-[11px] text-muted-foreground truncate" title={it.file}>
                        {it.file}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="secondary" className="text-[10px]">{it.cell.index}</Badge>
                      <Badge variant="outline" className="text-[10px]">{familyLabel}</Badge>
                      <Badge variant="outline" className="text-[10px]">{it.cell.cardinality}</Badge>
                      <Badge variant="outline" className="text-[10px]">{it.cell.regime}</Badge>
                      <Badge className="text-[10px] bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30">
                        n={it.cardinality_n}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Domaine : <span className="font-medium text-foreground">{it.domain}</span>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
