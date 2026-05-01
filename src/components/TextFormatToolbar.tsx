import { Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight } from "lucide-react";

export type TextStyleOverride = {
  fontSize?: number;
  fontWeight?: string;
  fontStyle?: string;
  textAlign?: string;
  textDecoration?: string;
  color?: string;
  fontFamily?: string;
};

type Props = {
  rect: { left: number; top: number; width: number; height: number };
  value: TextStyleOverride;
  onChange: (patch: TextStyleOverride) => void;
  /** Number of slots receiving the changes (primary + Shift-co-selected). */
  selectionCount?: number;
};

const FONT_SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64];
const FONT_FAMILIES = [
  { label: "Sans", value: '"Plus Jakarta Sans", system-ui, sans-serif' },
  { label: "Serif", value: 'Georgia, "Times New Roman", serif' },
  { label: "Mono", value: '"JetBrains Mono", "Courier New", monospace' },
  { label: "Display", value: '"Bebas Neue", Impact, sans-serif' },
];

export default function TextFormatToolbar({ rect, value, onChange }: Props) {
  const isBold =
    value.fontWeight === "bold" ||
    value.fontWeight === "700" ||
    value.fontWeight === "600";
  const isItalic = value.fontStyle === "italic";
  const isUnderline = value.textDecoration === "underline";
  const align = value.textAlign || "left";

  const top = Math.max(8, rect.top - 52);
  const left = Math.max(8, rect.left);

  const btn = (active: boolean) =>
    `w-8 h-8 inline-flex items-center justify-center rounded border text-sm transition-colors ${
      active
        ? "bg-foreground text-background border-foreground"
        : "bg-background text-foreground border-border hover:bg-accent"
    }`;

  return (
    <div
      className="fixed z-50 flex items-center gap-1.5 rounded-lg border border-border bg-background px-2 py-1.5 shadow-lg"
      style={{ left, top }}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <select
        className="h-8 rounded border border-border bg-background px-1 text-xs"
        value={
          FONT_FAMILIES.find((f) => value.fontFamily === f.value)?.value ??
          FONT_FAMILIES[0].value
        }
        onChange={(e) => onChange({ fontFamily: e.target.value })}
        title="Police"
      >
        {FONT_FAMILIES.map((f) => (
          <option key={f.label} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>

      <select
        className="h-8 w-16 rounded border border-border bg-background px-1 text-xs"
        value={value.fontSize ?? ""}
        onChange={(e) =>
          onChange({ fontSize: e.target.value ? Number(e.target.value) : undefined })
        }
        title="Taille"
      >
        <option value="">Auto</option>
        {FONT_SIZES.map((s) => (
          <option key={s} value={s}>
            {s}px
          </option>
        ))}
      </select>

      <div className="mx-1 h-6 w-px bg-border" />

      <button
        type="button"
        className={btn(isBold)}
        onClick={() => onChange({ fontWeight: isBold ? "normal" : "bold" })}
        title="Gras (Ctrl+B)"
      >
        <Bold className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={btn(isItalic)}
        onClick={() => onChange({ fontStyle: isItalic ? "normal" : "italic" })}
        title="Italique (Ctrl+I)"
      >
        <Italic className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={btn(isUnderline)}
        onClick={() =>
          onChange({ textDecoration: isUnderline ? "none" : "underline" })
        }
        title="Souligné"
      >
        <Underline className="h-4 w-4" />
      </button>

      <div className="mx-1 h-6 w-px bg-border" />

      <button
        type="button"
        className={btn(align === "left")}
        onClick={() => onChange({ textAlign: "left" })}
        title="Aligner à gauche"
      >
        <AlignLeft className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={btn(align === "center")}
        onClick={() => onChange({ textAlign: "center" })}
        title="Centrer"
      >
        <AlignCenter className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={btn(align === "right")}
        onClick={() => onChange({ textAlign: "right" })}
        title="Aligner à droite"
      >
        <AlignRight className="h-4 w-4" />
      </button>

      <div className="mx-1 h-6 w-px bg-border" />

      <label
        className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded border border-border"
        title="Couleur du texte"
        style={{ background: value.color || "transparent" }}
      >
        <input
          type="color"
          className="h-0 w-0 opacity-0"
          value={toHex(value.color) || "#000000"}
          onChange={(e) => onChange({ color: e.target.value })}
        />
        <span
          className="text-xs font-bold"
          style={{ color: contrastOn(value.color) }}
        >
          A
        </span>
      </label>
    </div>
  );
}

function toHex(c?: string): string | undefined {
  if (!c) return undefined;
  if (c.startsWith("#")) return c;
  // rgb(...) -> #hex
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (!m) return undefined;
  const parts = m[1].split(",").map((s) => parseFloat(s.trim()));
  const [r, g, b] = parts;
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

function contrastOn(c?: string): string {
  const hex = toHex(c);
  if (!hex) return "hsl(var(--foreground))";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#000" : "#fff";
}
