import { useEffect, useMemo, useRef, useState } from "react";
import * as LucideIcons from "lucide-react";
import { Grid, type CellComponentProps } from "react-window";
import { HelpCircle, Loader2, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useLucideCatalog } from "@/hooks/useLucideCatalog";
import type { LucideIconMetadata } from "@/types/lucide";
import { cn } from "@/lib/utils";

export type IconPickerFullProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (iconName: string) => void;
  keepOpenAfterSelect?: boolean;
};

const CELL_W = 88;
const CELL_H = 96;

function toPascalCase(name: string): string {
  return name
    .split("-")
    .map((s) => (s ? s[0].toUpperCase() + s.slice(1) : ""))
    .join("");
}

const componentCache = new Map<string, React.ComponentType<{ size?: number; className?: string }> | null>();

function getLucideComponent(name: string) {
  if (componentCache.has(name)) return componentCache.get(name) ?? null;
  const pascal = toPascalCase(name);
  const Comp = (LucideIcons as unknown as Record<string, React.ComponentType<{ size?: number; className?: string }>>)[pascal] ?? null;
  componentCache.set(name, Comp);
  return Comp;
}

function useDebounced<T>(value: T, delay: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

export function IconPickerFull({ open, onClose, onSelect, keepOpenAfterSelect = false }: IconPickerFullProps) {
  const { icons, isLoading, error, search, filterByCategory } = useLucideCatalog();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [keepOpen, setKeepOpen] = useState(keepOpenAfterSelect);
  const debouncedQuery = useDebounced(query, 150);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(720);

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery("");
      setCategory("all");
    }
  }, [open]);

  // Track width for column count
  useEffect(() => {
    if (!open) return;
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setContainerWidth(el.clientWidth);
    });
    ro.observe(el);
    setContainerWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [open]);

  const categories = useMemo<string[]>(() => {
    const set = new Set<string>();
    for (const ic of icons) ic.categories?.forEach((c) => set.add(c));
    return Array.from(set).sort();
  }, [icons]);

  const filtered = useMemo<LucideIconMetadata[]>(() => {
    let base = debouncedQuery.trim() ? search(debouncedQuery) : icons;
    if (category !== "all") {
      base = base.filter((ic) => ic.categories?.includes(category));
    }
    return base;
  }, [debouncedQuery, category, icons, search]);

  const columnCount = Math.max(1, Math.floor(containerWidth / CELL_W));
  const rowCount = Math.ceil(filtered.length / columnCount);

  const handlePick = (name: string) => {
    onSelect(name);
    if (!keepOpen) onClose();
  };

  const Cell = ({ columnIndex, rowIndex, style }: CellComponentProps) => {
    const idx = rowIndex * columnCount + columnIndex;
    const icon = filtered[idx];
    if (!icon) return <div style={style} />;
    const Comp = getLucideComponent(icon.name);
    return (
      <div style={style} className="p-1">
        <TooltipProvider delayDuration={500}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => handlePick(icon.name)}
                className="w-full h-full flex flex-col items-center justify-center gap-1 rounded-md hover:bg-muted transition-colors p-1 text-center"
              >
                <span className="flex items-center justify-center h-10 w-10 text-foreground">
                  {Comp ? <Comp size={28} /> : <HelpCircle size={28} className="text-muted-foreground" />}
                </span>
                <span className={cn("text-[11px] leading-tight text-muted-foreground line-clamp-2 break-all px-0.5")}>
                  {icon.name}
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <p className="font-mono text-xs">{icon.name}</p>
              {icon.tags?.length > 0 && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  {icon.tags.slice(0, 5).join(", ")}
                </p>
              )}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl p-0 gap-0" style={{ width: "min(800px, 95vw)" }}>
        <DialogHeader className="p-4 border-b">
          <div className="flex items-center justify-between">
            <DialogTitle>Choisir une icône</DialogTitle>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fermer">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="p-4 space-y-3 border-b">
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher : nom, sujet, tag…"
          />
          <div className="flex gap-1 overflow-x-auto pb-1">
            <CategoryTab active={category === "all"} onClick={() => setCategory("all")}>
              Toutes ({icons.length})
            </CategoryTab>
            {categories.map((c) => (
              <CategoryTab key={c} active={category === c} onClick={() => setCategory(c)}>
                {c}
              </CategoryTab>
            ))}
          </div>
        </div>

        <div ref={containerRef} className="relative" style={{ height: "55vh" }}>
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
              <p className="text-sm text-destructive">Impossible de charger les icônes.</p>
              <p className="text-xs text-muted-foreground">{error.message}</p>
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
              defaultHeight={Math.floor(window.innerHeight * 0.55)}
              defaultWidth={containerWidth}
              style={{ height: "100%", width: "100%" }}
              overscanCount={2}
            />
          )}
        </div>

        <div className="p-4 border-t flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Checkbox
              id="keep-open"
              checked={keepOpen}
              onCheckedChange={(v) => setKeepOpen(Boolean(v))}
            />
            <Label htmlFor="keep-open" className="text-sm cursor-pointer">
              Garder ouvert après ajout
            </Label>
          </div>
          <p className="text-xs text-muted-foreground">{filtered.length} icône{filtered.length > 1 ? "s" : ""}</p>
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
