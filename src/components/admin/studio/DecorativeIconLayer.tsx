import { useEffect, useRef, useState, useMemo } from "react";
import * as LucideIcons from "lucide-react";
import { HelpCircle } from "lucide-react";
import type { DecorativeIcon } from "@/types/template";

export type DecorativeIconWithId = DecorativeIcon & { _id: string };

function toPascalCase(name: string): string {
  return name
    .split("-")
    .map((s) => (s ? s[0].toUpperCase() + s.slice(1) : ""))
    .join("");
}

const componentCache = new Map<string, React.ComponentType<Record<string, unknown>> | null>();

function getLucideComponent(name: string) {
  if (componentCache.has(name)) return componentCache.get(name) ?? null;
  const pascal = toPascalCase(name);
  const Comp =
    (LucideIcons as unknown as Record<string, React.ComponentType<Record<string, unknown>>>)[pascal] ?? null;
  componentCache.set(name, Comp);
  return Comp;
}

type ToImage = (e: PointerEvent | React.PointerEvent) => { x: number; y: number };

type Props = {
  icons: DecorativeIconWithId[];
  setIcons: (next: DecorativeIconWithId[]) => void;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  toImage: ToImage;
  imageWidth: number;
  imageHeight: number;
};

const HANDLE_SIZE = 10;

export default function DecorativeIconLayer({
  icons,
  setIcons,
  selectedId,
  setSelectedId,
  toImage,
  imageWidth,
  imageHeight,
}: Props) {
  const [drag, setDrag] = useState<
    | null
    | { kind: "move"; id: string; offset: { x: number; y: number } }
    | { kind: "resize"; id: string; corner: string; original: DecorativeIconWithId }
  >(null);

  const iconsRef = useRef(icons);
  useEffect(() => {
    iconsRef.current = icons;
  }, [icons]);

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const p = toImage(e);
      const list = iconsRef.current;
      const i = list.findIndex((x) => x._id === drag.id);
      if (i < 0) return;
      const cur = list[i];
      if (drag.kind === "move") {
        const nx = Math.max(0, Math.min(imageWidth - cur.size, p.x - drag.offset.x));
        const ny = Math.max(0, Math.min(imageHeight - cur.size, p.y - drag.offset.y));
        const next = [...list];
        next[i] = { ...cur, x: nx, y: ny };
        setIcons(next);
      } else {
        const o = drag.original;
        const oppX = drag.corner.includes("w") ? o.x + o.size : o.x;
        const oppY = drag.corner.includes("n") ? o.y + o.size : o.y;
        const dx = Math.abs(p.x - oppX);
        const dy = Math.abs(p.y - oppY);
        const newSize = Math.max(12, Math.min(512, Math.round(Math.max(dx, dy))));
        let nx = o.x;
        let ny = o.y;
        if (drag.corner.includes("w")) nx = oppX - newSize;
        if (drag.corner.includes("n")) ny = oppY - newSize;
        const next = [...list];
        next[i] = { ...cur, x: nx, y: ny, size: newSize };
        setIcons(next);
      }
    };
    const onUp = () => setDrag(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [drag, toImage, setIcons, imageWidth, imageHeight]);

  const sorted = useMemo(
    () => [...icons].sort((a, b) => (a.z_order ?? 0) - (b.z_order ?? 0)),
    [icons],
  );

  return (
    <g className="decorative-icon-layer">
      {sorted.map((icon) => {
        const Comp = getLucideComponent(icon.name);
        const isSel = icon._id === selectedId;
        const stroke = icon.stroke;
        return (
          <g
            key={icon._id}
            className="decorative-icon"
            data-icon-name={icon.name}
            transform={`translate(${icon.x}, ${icon.y})`}
            style={{ cursor: "move" }}
            onPointerDown={(e) => {
              e.stopPropagation();
              setSelectedId(icon._id);
              const p = toImage(e);
              setDrag({
                kind: "move",
                id: icon._id,
                offset: { x: p.x - icon.x, y: p.y - icon.y },
              });
            }}
          >
            {Comp ? (
              <Comp
                width={icon.size}
                height={icon.size}
                stroke={stroke}
                strokeWidth={icon.stroke_width}
                fill="none"
              />
            ) : (
              <HelpCircle width={icon.size} height={icon.size} stroke={stroke} />
            )}
            <rect
              x={0}
              y={0}
              width={icon.size}
              height={icon.size}
              fill="transparent"
              pointerEvents="all"
            />
            {isSel && (
              <>
                <rect
                  x={-2}
                  y={-2}
                  width={icon.size + 4}
                  height={icon.size + 4}
                  fill="none"
                  stroke="hsl(217 91% 60%)"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  pointerEvents="none"
                />
                {(["nw", "ne", "se", "sw"] as const).map((corner) => {
                  const cx =
                    corner.includes("w") ? -2 : icon.size + 2;
                  const cy =
                    corner.includes("n") ? -2 : icon.size + 2;
                  return (
                    <rect
                      key={corner}
                      x={cx - HANDLE_SIZE / 2}
                      y={cy - HANDLE_SIZE / 2}
                      width={HANDLE_SIZE}
                      height={HANDLE_SIZE}
                      fill="white"
                      stroke="hsl(217 91% 60%)"
                      strokeWidth={2}
                      style={{ cursor: `${corner}-resize` }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setSelectedId(icon._id);
                        setDrag({
                          kind: "resize",
                          id: icon._id,
                          corner,
                          original: { ...icon },
                        });
                      }}
                    />
                  );
                })}
              </>
            )}
          </g>
        );
      })}
    </g>
  );
}
