import { useEffect, useMemo, useRef, useState } from "react";
import * as LucideIcons from "lucide-react";
import { Input } from "@/components/ui/input";

type IconPickerProps = {
  value?: string;
  onSelect: (iconName: string) => void;
  onCancel: () => void;
  style?: React.CSSProperties;
};

// Build a list of all Lucide icon component names (PascalCase) once.
const ALL_ICON_NAMES: string[] = Object.keys(LucideIcons).filter((name) => {
  if (!/^[A-Z]/.test(name)) return false;
  // Filter out non-icon exports like "createLucideIcon", "Icon", "icons".
  if (name === "Icon" || name === "LucideIcon" || name === "createLucideIcon") return false;
  const candidate = (LucideIcons as Record<string, unknown>)[name];
  return typeof candidate === "object" || typeof candidate === "function";
});

export default function IconPicker({ value, onSelect, onCancel, style }: IconPickerProps) {
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? ALL_ICON_NAMES.filter((n) => n.toLowerCase().includes(q))
      : ALL_ICON_NAMES;
    return list.slice(0, 96);
  }, [query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onCancel();
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [onCancel]);

  return (
    <div
      ref={containerRef}
      className="fixed z-50 w-72 rounded-md border bg-popover p-3 shadow-lg"
      style={style}
    >
      <Input
        autoFocus
        placeholder="Rechercher une icône…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mb-2 h-8 text-sm"
      />
      <div className="grid grid-cols-8 gap-1 max-h-56 overflow-y-auto">
        {results.map((name) => {
          const IconComp = (LucideIcons as Record<string, React.ComponentType<{ size?: number }>>)[
            name
          ];
          if (!IconComp) return null;
          const active = name === value;
          return (
            <button
              key={name}
              type="button"
              title={name}
              onClick={() => onSelect(name)}
              className={`flex items-center justify-center h-7 w-7 rounded hover:bg-accent ${
                active ? "bg-accent ring-1 ring-foreground" : ""
              }`}
            >
              <IconComp size={16} />
            </button>
          );
        })}
        {results.length === 0 && (
          <div className="col-span-8 text-xs text-muted-foreground text-center py-4">
            Aucune icône
          </div>
        )}
      </div>
    </div>
  );
}
