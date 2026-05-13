// Menu contextuel utilisateur affiché lors d'un clic sur une icône dynamique
// (slot-icon) du rendu Premium. Propose 4 alternatives + bouton "Plus d'options".

import { useEffect, useRef, useState } from "react";
import * as Lucide from "lucide-react";
import { Loader2, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";

function toPascalCase(name: string): string {
  return name
    .split(/[-_\s]/)
    .filter(Boolean)
    .map((s) => s[0].toUpperCase() + s.slice(1).toLowerCase())
    .join("");
}

function LucideGlyph({ name, size = 28 }: { name: string; size?: number }) {
  const Cmp = (Lucide as unknown as Record<string, React.ComponentType<{ size?: number }>>)[
    toPascalCase(name)
  ];
  if (!Cmp) return <div style={{ width: size, height: size }} className="bg-muted rounded" />;
  return <Cmp size={size} />;
}

export type IconContextMenuProps = {
  open: boolean;
  anchorPosition: { x: number; y: number };
  currentIconName: string;
  alternatives: string[];
  slotText: string;
  onSelect: (iconName: string) => void;
  onRequestMore: (excludeIcons: string[]) => Promise<string[]>;
  onClose: () => void;
};

export default function IconContextMenu({
  open,
  anchorPosition,
  currentIconName,
  alternatives,
  onSelect,
  onRequestMore,
  onClose,
}: IconContextMenuProps) {
  const [items, setItems] = useState<string[]>(alternatives);
  const [loadingMore, setLoadingMore] = useState(false);
  const seenRef = useRef<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setItems(alternatives);
      seenRef.current = new Set([currentIconName, ...alternatives]);
    }
  }, [open, alternatives, currentIconName]);

  // Fermeture sur clic extérieur + Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    // Léger délai pour ne pas attraper le clic d'ouverture.
    const t = setTimeout(() => window.addEventListener("mousedown", onDown), 0);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
      clearTimeout(t);
    };
  }, [open, onClose]);

  // Focus initial pour la navigation clavier.
  useEffect(() => {
    if (open && containerRef.current) {
      const firstBtn = containerRef.current.querySelector("button");
      (firstBtn as HTMLButtonElement | null)?.focus();
    }
  }, [open]);

  if (!open) return null;

  const handleMore = async () => {
    setLoadingMore(true);
    try {
      const next = await onRequestMore(Array.from(seenRef.current));
      if (next.length === 0) {
        toast.info("Plus d'alternatives disponibles.");
        return;
      }
      next.forEach((n) => seenRef.current.add(n));
      setItems(next.slice(0, 4));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Échec du chargement des alternatives";
      toast.error(msg);
    } finally {
      setLoadingMore(false);
    }
  };

  const PAD = 8;
  const W = 280;
  const left = Math.max(PAD, Math.min(window.innerWidth - W - PAD, anchorPosition.x));
  const top = Math.max(PAD, anchorPosition.y);

  return (
    <div
      ref={containerRef}
      role="menu"
      aria-label="Choisir une autre icône"
      className="fixed z-50 rounded-md border bg-popover text-popover-foreground shadow-lg p-3 space-y-3 animate-in fade-in-0 zoom-in-95"
      style={{ left, top, width: W }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <p className="text-xs font-medium text-muted-foreground">Choisir une autre icône :</p>
      <TooltipProvider delayDuration={300}>
        <div className="grid grid-cols-4 gap-2">
          {items.length === 0 && (
            <p className="col-span-4 text-xs text-muted-foreground italic">
              Aucune alternative disponible.
            </p>
          )}
          {items.map((name) => (
            <Tooltip key={name}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onSelect(name);
                    onClose();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      onSelect(name);
                      onClose();
                    }
                  }}
                  className="aspect-square rounded-md border hover:border-primary hover:bg-accent flex flex-col items-center justify-center gap-1 p-1 transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <LucideGlyph name={name} size={28} />
                  <span className="text-[10px] font-mono text-muted-foreground truncate w-full text-center">
                    {name}
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <span className="font-mono text-xs">{name}</span>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </TooltipProvider>
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={handleMore}
        disabled={loadingMore}
      >
        {loadingMore ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <MoreHorizontal className="w-4 h-4" />
        )}
        Plus d'options…
      </Button>
    </div>
  );
}
