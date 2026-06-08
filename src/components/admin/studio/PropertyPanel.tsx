import { useState } from "react";
import { Copy, Trash2, ArrowUp, ArrowDown, Replace } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { IconPickerFull } from "@/components/admin/studio/IconPickerFull";
import type { DecorativeIconWithId } from "@/components/admin/studio/DecorativeIconLayer";

const COLOR_OPTIONS = [
  { label: "Primary", value: "var(--primary)" },
  { label: "Accent", value: "var(--accent)" },
  { label: "Text", value: "var(--text)" },
  { label: "Muted", value: "var(--muted)" },
  { label: "Border", value: "var(--border)" },
];

const STROKE_WIDTHS = [1, 1.5, 2, 2.5, 3];

type Props = {
  icon: DecorativeIconWithId | null;
  onUpdate: (id: string, partial: Partial<DecorativeIconWithId>) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  onReorder: (id: string, dir: 1 | -1) => void;
};

export default function PropertyPanel({ icon, onUpdate, onDuplicate, onRemove, onReorder }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);

  if (!icon) {
    return (
      <Card className="p-4">
        <p className="text-xs text-muted-foreground">
          Sélectionnez un élément pour modifier ses propriétés.
        </p>
      </Card>
    );
  }

  const id = icon._id;
  return (
    <>
      <Card className="p-4 space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Icône décorative</h3>
          <p className="text-xs text-muted-foreground font-mono mt-1">{icon.name}</p>
        </div>

        <Button variant="outline" size="sm" className="w-full" onClick={() => setPickerOpen(true)}>
          <Replace className="h-4 w-4" /> Changer d'icône…
        </Button>

        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Position</Label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="pos-x" className="text-xs">X</Label>
              <Input
                id="pos-x"
                type="number"
                value={Math.round(icon.x)}
                onChange={(e) => onUpdate(id, { x: Number(e.target.value) })}
                className="h-8"
              />
            </div>
            <div>
              <Label htmlFor="pos-y" className="text-xs">Y</Label>
              <Input
                id="pos-y"
                type="number"
                value={Math.round(icon.y)}
                onChange={(e) => onUpdate(id, { y: Number(e.target.value) })}
                className="h-8"
              />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Taille</Label>
            <span className="text-xs font-mono">{icon.size}px</span>
          </div>
          <Slider
            min={16}
            max={128}
            step={2}
            value={[icon.size]}
            onValueChange={([v]) => onUpdate(id, { size: v })}
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Couleur</Label>
          <RadioGroup
            value={icon.stroke}
            onValueChange={(v) => onUpdate(id, { stroke: v })}
            className="grid grid-cols-2 gap-1"
          >
            {COLOR_OPTIONS.map((c) => (
              <div key={c.value} className="flex items-center gap-2">
                <RadioGroupItem value={c.value} id={`color-${c.label}`} />
                <Label htmlFor={`color-${c.label}`} className="text-xs cursor-pointer">{c.label}</Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Épaisseur</Label>
          <RadioGroup
            value={String(icon.stroke_width)}
            onValueChange={(v) => onUpdate(id, { stroke_width: Number(v) })}
            className="flex gap-3"
          >
            {STROKE_WIDTHS.map((w) => (
              <div key={w} className="flex items-center gap-1">
                <RadioGroupItem value={String(w)} id={`sw-${w}`} />
                <Label htmlFor={`sw-${w}`} className="text-xs cursor-pointer">{w}</Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Ordre Z ({icon.z_order})</Label>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={() => onReorder(id, 1)}>
              <ArrowUp className="h-3 w-3" /> Avancer
            </Button>
            <Button variant="outline" size="sm" className="flex-1" onClick={() => onReorder(id, -1)}>
              <ArrowDown className="h-3 w-3" /> Reculer
            </Button>
          </div>
        </div>

        <div className="flex gap-2 pt-2 border-t">
          <Button variant="outline" size="sm" className="flex-1" onClick={() => onDuplicate(id)}>
            <Copy className="h-3 w-3" /> Dupliquer
          </Button>
          <Button variant="destructive" size="sm" className="flex-1" onClick={() => onRemove(id)}>
            <Trash2 className="h-3 w-3" /> Supprimer
          </Button>
        </div>
      </Card>

      <IconPickerFull
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(name) => onUpdate(id, { name })}
      />
    </>
  );
}
