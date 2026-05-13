import { useMemo, useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import type { FeatureFlagMeta } from "@/types/featureFlags";

const KEY_TO_LABEL: Record<string, string> = {
  lucide_enabled: "Lucide — Activation globale",
  icon_resolver_mode: "IconResolver — Mode de fonctionnement",
};

const ENUM_OPTION_DESCRIPTIONS: Record<string, Record<string, string>> = {
  icon_resolver_mode: {
    algo_only: "Présélection par tags Lucide uniquement. Rapide et gratuit, pertinence moyenne.",
    algo_plus_llm: "Présélection puis reclassement par Haiku 4.5. +$0.001 et +1.5s par requête, meilleure pertinence.",
  },
};

function humanLabel(key: string): string {
  return KEY_TO_LABEL[key] ?? key;
}

export function FeatureFlagsPanel() {
  const { flags, meta, isLoading, error, refresh, update } = useFeatureFlags();
  const [pendingChanges, setPendingChanges] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);

  const orderedKeys = useMemo(() => Object.keys(flags ?? {}).sort(), [flags]);
  const hasChanges = Object.keys(pendingChanges).length > 0;

  const valueFor = (key: string): unknown =>
    key in pendingChanges ? pendingChanges[key] : flags?.[key];

  const setPending = (key: string, value: unknown) => {
    setPendingChanges((prev) => {
      const next = { ...prev };
      if (flags?.[key] === value) {
        delete next[key];
      } else {
        next[key] = value;
      }
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await update(pendingChanges);
      setPendingChanges({});
      toast.success("Modifications appliquées");
    } catch (e) {
      toast.error((e as Error).message ?? "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => setPendingChanges({});

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-6 flex flex-col items-start gap-3">
        <div className="flex items-center gap-2 text-destructive">
          <AlertCircle className="h-4 w-4" />
          <span className="font-medium">Impossible de charger les feature flags</span>
        </div>
        <p className="text-sm text-muted-foreground">{error.message}</p>
        <Button variant="outline" size="sm" onClick={() => refresh()}>Réessayer</Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Feature flags</h1>
        <p className="text-sm text-muted-foreground">Configuration dynamique du backend Krobar.</p>
      </div>

      <Separator />

      <div className="space-y-8">
        {orderedKeys.map((key, idx) => {
          const m: FeatureFlagMeta | undefined = meta[key];
          const type = m?.type ?? (typeof flags[key] === "boolean" ? "boolean" : "string");
          const current = valueFor(key);

          return (
            <div key={key} className="space-y-3">
              {idx > 0 && <Separator className="mb-8" />}
              <div className="space-y-1">
                <h2 className="text-base font-semibold">{humanLabel(key)}</h2>
                {m?.description && (
                  <p className="text-sm text-muted-foreground">{m.description}</p>
                )}
              </div>

              {type === "boolean" && (
                <div className="flex items-center gap-3 pt-1">
                  <Switch
                    id={`flag-${key}`}
                    checked={Boolean(current)}
                    onCheckedChange={(v) => setPending(key, v)}
                  />
                  <Label htmlFor={`flag-${key}`} className="text-sm">
                    {Boolean(current) ? "Activé" : "Désactivé"}
                  </Label>
                </div>
              )}

              {type === "enum" && Array.isArray(m?.values) && (
                <RadioGroup
                  value={String(current ?? "")}
                  onValueChange={(v) => setPending(key, v)}
                  className="gap-3 pt-1"
                >
                  {m!.values!.map((opt) => {
                    const desc = ENUM_OPTION_DESCRIPTIONS[key]?.[opt];
                    return (
                      <div key={opt} className="flex items-start gap-3">
                        <RadioGroupItem value={opt} id={`flag-${key}-${opt}`} className="mt-1" />
                        <div className="space-y-0.5">
                          <Label htmlFor={`flag-${key}-${opt}`} className="font-mono text-sm">{opt}</Label>
                          {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
                        </div>
                      </div>
                    );
                  })}
                </RadioGroup>
              )}
            </div>
          );
        })}
      </div>

      <Separator />

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={handleCancel} disabled={!hasChanges || saving}>
          Annuler
        </Button>
        <Button onClick={handleSave} disabled={!hasChanges || saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Enregistrer
        </Button>
      </div>
    </div>
  );
}
