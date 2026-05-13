// Picker contextuel pour les icônes de slot dynamique.
// Propose 5-8 candidats issus du backend (suggest-icon) à partir d'un texte
// d'exemple modifiable par l'admin. Permet aussi le passage au picker complet
// pour un choix totalement libre, ou la suppression du défaut.

import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import * as Lucide from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { suggestIcon, type SuggestIconCandidate } from "@/api/studio";
import { IconPickerFull } from "@/components/admin/studio/IconPickerFull";
import { toast } from "sonner";

type IconPickerContextualProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (iconName: string | null) => void;
  slotKey: string;
  slotPlaceholderText?: string;
};

function toPascalCase(name: string): string {
  return name
    .split(/[-_\s]/)
    .filter(Boolean)
    .map((s) => s[0].toUpperCase() + s.slice(1).toLowerCase())
    .join("");
}

function LucideIcon({ name, size = 48 }: { name: string; size?: number }) {
  const pascal = toPascalCase(name);
  const Cmp = (Lucide as unknown as Record<string, React.ComponentType<{ size?: number }>>)[pascal];
  if (!Cmp) {
    return <div style={{ width: size, height: size }} className="bg-muted rounded" />;
  }
  return <Cmp size={size} />;
}

export default function IconPickerContextual({
  open,
  onClose,
  onSelect,
  slotKey,
  slotPlaceholderText,
}: IconPickerContextualProps) {
  const [text, setText] = useState(slotPlaceholderText ?? "");
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<SuggestIconCandidate[]>([]);
  const [fullOpen, setFullOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setText(slotPlaceholderText ?? "");
      setCandidates([]);
    }
  }, [open, slotPlaceholderText]);

  // Suggestion auto à l'ouverture si on a déjà un texte d'exemple.
  useEffect(() => {
    if (open && (slotPlaceholderText ?? "").trim().length > 0) {
      void runSuggest(slotPlaceholderText ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const runSuggest = async (value: string) => {
    const v = value.trim();
    if (!v) {
      toast.error("Saisis un texte d'exemple avant de demander des suggestions.");
      return;
    }
    setLoading(true);
    try {
      const res = await suggestIcon({ slot_text: v, exclude_icons: [] });
      setCandidates(res.candidates ?? []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Échec de la suggestion";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const headerTitle = useMemo(
    () => `Choisir une icône pour « ${slotKey} »`,
    [slotKey],
  );

  return (
    <>
      <Dialog open={open && !fullOpen} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{headerTitle}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="slot-example">Texte d'exemple</Label>
              <div className="flex gap-2">
                <Input
                  id="slot-example"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Saisis un texte d'exemple pour voir les suggestions"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void runSuggest(text);
                    }
                  }}
                />
                <Button onClick={() => void runSuggest(text)} disabled={loading}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  Suggérer
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                {loading
                  ? "Chargement…"
                  : candidates.length > 0
                    ? `${candidates.length} suggestion${candidates.length > 1 ? "s" : ""}`
                    : "Aucune suggestion pour l'instant. Lance une recherche."}
              </Label>

              {loading && (
                <div className="grid grid-cols-4 gap-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div
                      key={i}
                      className="aspect-square rounded-md border bg-muted/40 animate-pulse"
                    />
                  ))}
                </div>
              )}

              {!loading && candidates.length > 0 && (
                <TooltipProvider delayDuration={300}>
                  <div className="grid grid-cols-4 gap-2">
                    {candidates.slice(0, 8).map((c) => (
                      <Tooltip key={c.name}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => {
                              onSelect(c.name);
                              onClose();
                            }}
                            className="aspect-square rounded-md border hover:border-primary hover:bg-accent flex flex-col items-center justify-center gap-1 p-2 transition-colors"
                          >
                            <LucideIcon name={c.name} size={32} />
                            <span className="text-[10px] font-mono text-muted-foreground truncate w-full text-center">
                              {c.name}
                            </span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <div className="text-xs">
                            <div className="font-mono font-semibold">{c.name}</div>
                            {c.tags && c.tags.length > 0 && (
                              <div className="text-muted-foreground mt-0.5">
                                {c.tags.slice(0, 6).join(", ")}
                              </div>
                            )}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                </TooltipProvider>
              )}
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2 sm:justify-between">
            <Button
              variant="ghost"
              onClick={() => {
                onSelect(null);
                onClose();
              }}
            >
              <X className="w-4 h-4" /> Aucune icône par défaut
            </Button>
            <Button variant="outline" onClick={() => setFullOpen(true)}>
              <Search className="w-4 h-4" /> Recherche manuelle…
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <IconPickerFull
        open={fullOpen}
        onClose={() => setFullOpen(false)}
        onSelect={(name) => {
          onSelect(name);
          setFullOpen(false);
          onClose();
        }}
      />
    </>
  );
}
