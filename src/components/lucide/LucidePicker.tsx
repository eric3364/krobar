// <LucidePicker> — composant standalone (P2).
// Parcourir les ~1700 icônes Lucide (catalogue backend), recherche fuzzy,
// virtualisation, lazy loading des SVG via IntersectionObserver.
//
// Réutilisable partout (admin Studio, menu user, etc.). Aucune dépendance à
// un contexte parent particulier.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  memo,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { Grid, type CellComponentProps } from "react-window";
import { Loader2, Eraser } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { getLucideCatalog, getLucideIconSvg } from "@/api/lucide";
import { cn } from "@/lib/utils";

export type LucideIcon = {
  name: string;
  tags: string[];
  categories: string[];
};

export type LucidePickerProps = {
  open: boolean;
  onClose: () => void;
  /** Appelé avec le nom choisi, ou `null` si l'utilisateur clique sur "Aucune icône" (allowClear). */
  onSelect: (iconName: string | null) => void;
  initialValue?: string | null;
  allowClear?: boolean;
};

const CELL_W = 88;
const CELL_H = 96;

function useDebounced<T>(value: T, delay: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

/** Cellule d'icône avec lazy-loading IntersectionObserver. */
const IconCell = memo(function IconCell({
  icon,
  selected,
  onPick,
}: {
  icon: LucideIcon;
  selected: boolean;
  onPick: (name: string) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisible(true);
            io.disconnect();
            break;
          }
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible || svg) return;
    let cancelled = false;
    getLucideIconSvg(icon.name)
      .then((s) => {
        if (!cancelled) setSvg(s);
      })
      .catch(() => {
        if (!cancelled) setSvg("");
      });
    return () => {
      cancelled = true;
    };
  }, [visible, svg, icon.name]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          ref={ref}
          type="button"
          data-icon-name={icon.name}
          onClick={() => onPick(icon.name)}
          className={cn(
            "w-full h-full flex flex-col items-center justify-center gap-1 rounded-md p-1 text-center transition-colors focus:outline-none focus:ring-2 focus:ring-ring",
            selected
              ? "bg-primary/10 border border-primary text-primary"
              : "border border-transparent hover:bg-muted text-foreground",
          )}
        >
          <span className="flex items-center justify-center h-8 w-8 [&_svg]:w-7 [&_svg]:h-7 [&_svg]:stroke-current">
            {svg
              ? <span dangerouslySetInnerHTML={{ __html: svg }} className="animate-in fade-in-0 duration-150" />
              : <Skeleton className="h-7 w-7 rounded" />}
          </span>
          <span className="text-[10px] leading-tight text-muted-foreground line-clamp-2 break-all px-0.5">
            {icon.name}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <p className="font-mono text-xs">{icon.name}</p>
        {icon.tags?.length > 0 && (
          <p className="text-[11px] text-muted-foreground mt-1">
            {icon.tags.slice(0, 6).join(", ")}
          </p>
        )}
      </TooltipContent>
    </Tooltip>
  );
});

export function LucidePicker({
  open,
  onClose,
  onSelect,
  initialValue,
  allowClear,
}: LucidePickerProps) {
  // Catalogue chargé via React Query (cache 24 h).
  const { data, isLoading, error } = useQuery({
    queryKey: ["lucide-catalog"],
    queryFn: getLucideCatalog,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    enabled: open,
  });

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const debouncedQuery = useDebounced(query, 150);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(720);
  const [focusedIdx, setFocusedIdx] = useState(0);

  // Reset au ré-open.
  useEffect(() => {
    if (open) {
      setQuery("");
      setCategory("all");
      setFocusedIdx(0);
    }
  }, [open]);

  // Largeur courante pour calculer le nombre de colonnes.
  useEffect(() => {
    if (!open) return;
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setContainerWidth(el.clientWidth));
    ro.observe(el);
    setContainerWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [open]);

  const allIcons = useMemo<LucideIcon[]>(() => {
    if (!data?.icons) return [];
    return Object.values(data.icons).map((i) => ({
      name: i.name,
      tags: i.tags ?? [],
      categories: i.categories ?? [],
    }));
  }, [data]);

  const categories = useMemo<string[]>(() => {
    const set = new Set<string>();
    for (const ic of allIcons) ic.categories.forEach((c) => set.add(c));
    return Array.from(set).sort();
  }, [allIcons]);

  const filtered = useMemo<LucideIcon[]>(() => {
    const q = debouncedQuery.trim().toLowerCase();
    let base = allIcons;
    if (q) {
      base = base.filter((ic) => {
        if (ic.name.toLowerCase().includes(q)) return true;
        if (ic.tags.some((t) => t.toLowerCase().includes(q))) return true;
        return false;
      });
    }
    if (category !== "all") {
      base = base.filter((ic) => ic.categories.includes(category));
    }
    return base;
  }, [debouncedQuery, category, allIcons]);

  const columnCount = Math.max(1, Math.floor(containerWidth / CELL_W));
  const rowCount = Math.ceil(filtered.length / columnCount);

  const handlePick = useCallback(
    (name: string) => {
      onSelect(name);
      onClose();
    },
    [onSelect, onClose],
  );

  // Navigation clavier dans la grille (flèches + Enter).
  const onGridKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (filtered.length === 0) return;
    let next = focusedIdx;
    if (e.key === "ArrowRight") next = Math.min(filtered.length - 1, focusedIdx + 1);
    else if (e.key === "ArrowLeft") next = Math.max(0, focusedIdx - 1);
    else if (e.key === "ArrowDown") next = Math.min(filtered.length - 1, focusedIdx + columnCount);
    else if (e.key === "ArrowUp") next = Math.max(0, focusedIdx - columnCount);
    else if (e.key === "Enter") {
      const ic = filtered[focusedIdx];
      if (ic) handlePick(ic.name);
      return;
    } else return;
    e.preventDefault();
    setFocusedIdx(next);
  };

  const Cell = ({ columnIndex, rowIndex, style }: CellComponentProps) => {
    const idx = rowIndex * columnCount + columnIndex;
    const ic = filtered[idx];
    if (!ic) return <div style={style} />;
    return (
      <div style={style} className="p-1">
        <IconCell
          icon={ic}
          selected={ic.name === initialValue || idx === focusedIdx}
          onPick={handlePick}
        />
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="p-0 gap-0 overflow-hidden w-[95vw] sm:max-w-[820px] max-h-[90vh] flex flex-col">
        <DialogHeader className="p-4 border-b shrink-0">
          <DialogTitle>Choisir une icône</DialogTitle>
        </DialogHeader>

        <div className="p-4 space-y-3 border-b shrink-0">
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher : nom, tag…"
          />
          {categories.length > 0 && (
            <div className="flex gap-1 overflow-x-auto pb-1">
              <CategoryTab active={category === "all"} onClick={() => setCategory("all")}>
                Toutes ({allIcons.length})
              </CategoryTab>
              {categories.map((c) => (
                <CategoryTab key={c} active={category === c} onClick={() => setCategory(c)}>
                  {c}
                </CategoryTab>
              ))}
            </div>
          )}
        </div>

        <TooltipProvider delayDuration={400}>
          <div
            ref={containerRef}
            tabIndex={0}
            onKeyDown={onGridKeyDown}
            className="relative flex-1 min-h-[300px] overflow-hidden focus:outline-none"
          >
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
            {error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
                <p className="text-sm text-destructive">Impossible de charger les icônes.</p>
                <p className="text-xs text-muted-foreground">{(error as Error).message}</p>
              </div>
            )}
            {!isLoading && !error && filtered.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                Aucune icône trouvée.
              </div>
            )}
            {!isLoading && !error && filtered.length > 0 && containerWidth > 0 && (
              <Grid
                cellComponent={Cell}
                cellProps={{}}
                columnCount={columnCount}
                columnWidth={Math.floor(containerWidth / columnCount)}
                rowCount={rowCount}
                rowHeight={CELL_H}
                defaultHeight={420}
                defaultWidth={containerWidth}
                style={{ height: "100%", width: "100%" }}
                overscanCount={2}
              />
            )}
          </div>
        </TooltipProvider>

        <div className="p-4 border-t flex items-center justify-between shrink-0 gap-2">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>Annuler</Button>
            {allowClear && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => { onSelect(null); onClose(); }}
              >
                <Eraser className="w-4 h-4" /> Aucune icône
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {filtered.length} icône{filtered.length > 1 ? "s" : ""}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CategoryTab({
  active,
  onClick,
  children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 px-3 py-1 rounded-full text-xs font-medium border transition-colors capitalize",
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background text-muted-foreground border-border hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

export default LucidePicker;
