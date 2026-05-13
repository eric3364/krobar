import { useMemo, useState } from "react";
import * as LucideIcons from "lucide-react";
import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconPickerFull } from "@/components/admin/studio/IconPickerFull";
import { useLucideCatalog } from "@/hooks/useLucideCatalog";

function toPascalCase(name: string): string {
  return name
    .split("-")
    .map((s) => (s ? s[0].toUpperCase() + s.slice(1) : ""))
    .join("");
}

export default function AdminIconsDemo() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const { icons } = useLucideCatalog();

  const meta = useMemo(
    () => (selected ? icons.find((i) => i.name === selected) ?? null : null),
    [selected, icons],
  );

  const Comp = selected
    ? ((LucideIcons as unknown as Record<string, React.ComponentType<{ size?: number }>>)[toPascalCase(selected)] ?? null)
    : null;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Démo — Picker d'icônes Lucide</h1>
        <p className="text-sm text-muted-foreground">
          Outil de test du composant <code>IconPickerFull</code> avant intégration au Studio.
        </p>
      </div>

      <Button onClick={() => setOpen(true)}>Ouvrir le picker</Button>

      {selected && (
        <div className="rounded-md border p-6 flex gap-6 items-start">
          <div className="flex items-center justify-center h-24 w-24 rounded-md bg-muted">
            {Comp ? <Comp size={64} /> : <HelpCircle size={64} className="text-muted-foreground" />}
          </div>
          <div className="flex-1 space-y-2">
            <p className="font-mono text-sm font-semibold">{selected}</p>
            <pre className="text-xs bg-muted rounded p-3 overflow-x-auto">
              {JSON.stringify(meta, null, 2)}
            </pre>
          </div>
        </div>
      )}

      <IconPickerFull
        open={open}
        onClose={() => setOpen(false)}
        onSelect={(name) => setSelected(name)}
      />
    </div>
  );
}
