import { useEffect, useState } from "react";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export type DetailLevel = "summary" | "auto" | "detailed";

export const PREFS_STORAGE_KEY = "krobar-user-preferences";

type StoredPrefs = {
  detailLevel: DetailLevel;
  remember: boolean;
};

export function loadStoredDetailLevel(): DetailLevel {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) return "auto";
    const parsed = JSON.parse(raw) as Partial<StoredPrefs>;
    if (parsed.remember && parsed.detailLevel) {
      return parsed.detailLevel;
    }
    return "auto";
  } catch {
    return "auto";
  }
}

const OPTIONS: { value: DetailLevel; label: string; desc: string }[] = [
  {
    value: "summary",
    label: "Résumé",
    desc: "Formules courtes, max 3 mots par champ. Templates simples.",
  },
  {
    value: "auto",
    label: "Auto",
    desc: "Comportement standard, équilibré.",
  },
  {
    value: "detailed",
    label: "Détaillé",
    desc: "Formules riches, jusqu'à 10 mots par champ. Templates riches privilégiés.",
  },
];

type Props = {
  detailLevel: DetailLevel;
  onApply: (level: DetailLevel) => void;
};

export default function CustomizePanel({ detailLevel, onApply }: Props) {
  const [open, setOpen] = useState(false);
  const [draftLevel, setDraftLevel] = useState<DetailLevel>(detailLevel);
  const [remember, setRemember] = useState(true);

  // Sync draft + remember when panel opens
  useEffect(() => {
    if (!open) return;
    setDraftLevel(detailLevel);
    try {
      const raw = localStorage.getItem(PREFS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<StoredPrefs>;
        setRemember(parsed.remember ?? true);
      } else {
        setRemember(true);
      }
    } catch {
      setRemember(true);
    }
  }, [open, detailLevel]);

  const handleSave = () => {
    if (remember) {
      const data: StoredPrefs = { detailLevel: draftLevel, remember: true };
      localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(data));
    } else {
      localStorage.removeItem(PREFS_STORAGE_KEY);
    }
    onApply(draftLevel);
    setOpen(false);
  };

  const handleCancel = () => {
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings2 className="w-4 h-4 sm:mr-2" />
          <span className="hidden sm:inline">Personnaliser</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold">Personnaliser</h3>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Niveau de détail
            </Label>
            <div className="grid grid-cols-3 gap-1 rounded-md border border-input p-1">
              {OPTIONS.map((opt) => {
                const active = draftLevel === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setDraftLevel(opt.value)}
                    className={`text-xs font-medium rounded px-2 py-1.5 transition-colors ${
                      active
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-accent hover:text-accent-foreground"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground leading-snug min-h-[2.5rem]">
              {OPTIONS.find((o) => o.value === draftLevel)?.desc}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="remember-prefs"
              checked={remember}
              onCheckedChange={(v) => setRemember(v === true)}
            />
            <Label htmlFor="remember-prefs" className="text-sm cursor-pointer">
              Mémoriser mes choix
            </Label>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={handleCancel}>
              Annuler
            </Button>
            <Button size="sm" onClick={handleSave}>
              Enregistrer et appliquer
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
