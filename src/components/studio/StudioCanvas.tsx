// Canvas SVG d'édition des ancres pour Krobar Studio (phase 2).
// Coordonnées stockées dans le repère image original (imageWidth × imageHeight).

import { useCallback, useEffect, useRef, useState } from "react";

export type Anchor = {
  id: string;
  slotName: string;
  bbox: { x: number; y: number; w: number; h: number };
};

export type Tool = "rect" | "select";

const SLOT_PALETTE = [
  "hsl(217 91% 60%)", "hsl(0 84% 60%)", "hsl(142 71% 45%)", "hsl(38 92% 50%)",
  "hsl(280 75% 60%)", "hsl(190 90% 45%)", "hsl(330 80% 55%)", "hsl(20 90% 55%)",
  "hsl(160 70% 40%)", "hsl(260 70% 60%)",
];

export function colorForSlot(name: string, allNames: string[]): string {
  const idx = allNames.indexOf(name);
  return SLOT_PALETTE[Math.max(0, idx) % SLOT_PALETTE.length];
}

type Props = {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  anchors: Anchor[];
  setAnchors: (a: Anchor[]) => void;
  tool: Tool;
  setTool: (t: Tool) => void;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  snap: boolean;
  zoom: number;
  onPromptName: (cb: (name: string | null) => void, suggestion?: string) => void;
};

const HANDLE = 8;

export default function StudioCanvas({
  imageUrl, imageWidth, imageHeight, anchors, setAnchors,
  tool, setTool, selectedId, setSelectedId, snap, zoom, onPromptName,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<
    | null
    | { kind: "draw"; start: { x: number; y: number }; current: { x: number; y: number } }
    | { kind: "move"; id: string; offset: { x: number; y: number } }
    | { kind: "resize"; id: string; handle: string; original: Anchor["bbox"] }
  >(null);

  const allNames = Array.from(new Set(anchors.map((a) => a.slotName)));

  const toImage = useCallback(
    (e: React.PointerEvent | PointerEvent): { x: number; y: number } => {
      const svg = svgRef.current!;
      const rect = svg.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * imageWidth;
      const y = ((e.clientY - rect.top) / rect.height) * imageHeight;
      const round = (v: number) => (snap ? Math.round(v / 10) * 10 : Math.round(v));
      return {
        x: Math.max(0, Math.min(imageWidth, round(x))),
        y: Math.max(0, Math.min(imageHeight, round(y))),
      };
    },
    [imageWidth, imageHeight, snap],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as Element).getAttribute("data-handle")) return; // handled by handle pointerdown
    const target = e.target as Element;
    const anchorId = target.getAttribute("data-anchor-id");
    if (tool === "select" || anchorId) {
      if (anchorId) {
        const a = anchors.find((x) => x.id === anchorId);
        if (a) {
          setSelectedId(anchorId);
          const p = toImage(e);
          setDrag({ kind: "move", id: anchorId, offset: { x: p.x - a.bbox.x, y: p.y - a.bbox.y } });
          (e.target as Element).setPointerCapture?.(e.pointerId);
          return;
        }
      }
      setSelectedId(null);
      return;
    }
    // tool === rect
    const p = toImage(e);
    setDrag({ kind: "draw", start: p, current: p });
    setSelectedId(null);
    svgRef.current?.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const p = toImage(e);
    if (drag.kind === "draw") {
      setDrag({ ...drag, current: p });
    } else if (drag.kind === "move") {
      const a = anchors.find((x) => x.id === drag.id);
      if (!a) return;
      const nx = Math.max(0, Math.min(imageWidth - a.bbox.w, p.x - drag.offset.x));
      const ny = Math.max(0, Math.min(imageHeight - a.bbox.h, p.y - drag.offset.y));
      setAnchors(anchors.map((x) => (x.id === drag.id ? { ...x, bbox: { ...x.bbox, x: nx, y: ny } } : x)));
    } else if (drag.kind === "resize") {
      const a = anchors.find((x) => x.id === drag.id);
      if (!a) return;
      const o = drag.original;
      let nx = o.x, ny = o.y, nw = o.w, nh = o.h;
      if (drag.handle.includes("e")) nw = Math.max(20, p.x - o.x);
      if (drag.handle.includes("s")) nh = Math.max(20, p.y - o.y);
      if (drag.handle.includes("w")) { nw = Math.max(20, o.x + o.w - p.x); nx = o.x + o.w - nw; }
      if (drag.handle.includes("n")) { nh = Math.max(20, o.y + o.h - p.y); ny = o.y + o.h - nh; }
      setAnchors(anchors.map((x) => (x.id === drag.id ? { ...x, bbox: { x: nx, y: ny, w: nw, h: nh } } : x)));
    }
  };

  const onPointerUp = () => {
    if (drag?.kind === "draw") {
      const x = Math.min(drag.start.x, drag.current.x);
      const y = Math.min(drag.start.y, drag.current.y);
      const w = Math.abs(drag.current.x - drag.start.x);
      const h = Math.abs(drag.current.y - drag.start.y);
      if (w > 15 && h > 15) {
        onPromptName((name) => {
          if (!name) return;
          const newAnchor: Anchor = {
            id: "anch_" + Math.random().toString(36).slice(2, 10),
            slotName: name,
            bbox: { x, y, w, h },
          };
          setAnchors([...anchors, newAnchor]);
          setSelectedId(newAnchor.id);
          setTool("select");
        });
      }
    }
    setDrag(null);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!selectedId) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        setAnchors(anchors.filter((a) => a.id !== selectedId));
        setSelectedId(null);
      } else if (e.key === "Escape") {
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, anchors, setAnchors, setSelectedId]);

  const aspect = imageHeight / imageWidth;
  const baseW = Math.min(900, wrapRef.current?.clientWidth ?? 700);
  const displayWidth = baseW * zoom;
  const displayHeight = displayWidth * aspect;

  const drawingRect = drag?.kind === "draw"
    ? {
        x: Math.min(drag.start.x, drag.current.x),
        y: Math.min(drag.start.y, drag.current.y),
        w: Math.abs(drag.current.x - drag.start.x),
        h: Math.abs(drag.current.y - drag.start.y),
      }
    : null;

  return (
    <div ref={wrapRef} className="w-full overflow-auto bg-muted/30 rounded-md border" style={{ maxHeight: "70vh" }}>
      <div style={{ width: displayWidth, height: displayHeight, position: "relative" }}>
        <img
          src={imageUrl}
          alt="Source à annoter"
          draggable={false}
          style={{ width: "100%", height: "100%", display: "block", userSelect: "none", pointerEvents: "none" }}
        />
        <svg
          ref={svgRef}
          viewBox={`0 0 ${imageWidth} ${imageHeight}`}
          preserveAspectRatio="none"
          style={{
            position: "absolute", inset: 0, width: "100%", height: "100%",
            cursor: tool === "rect" ? "crosshair" : "default",
            touchAction: "none",
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {anchors.map((a) => {
            const c = colorForSlot(a.slotName, allNames);
            const isSel = a.id === selectedId;
            return (
              <g key={a.id} data-anchor-id={a.id}>
                <rect
                  data-anchor-id={a.id}
                  x={a.bbox.x} y={a.bbox.y} width={a.bbox.w} height={a.bbox.h}
                  fill={c} fillOpacity={0.12}
                  stroke={c} strokeWidth={isSel ? 4 : 2}
                  strokeDasharray={isSel ? "0" : "8 6"}
                  style={{ cursor: "move" }}
                />
                <foreignObject x={a.bbox.x} y={a.bbox.y + a.bbox.h / 2 - 14} width={a.bbox.w} height={28} pointerEvents="none">
                  <div xmlns="http://www.w3.org/1999/xhtml" style={{
                    fontFamily: "monospace", fontSize: 14, color: "#111",
                    textAlign: "center", lineHeight: "28px",
                    background: "rgba(255,255,255,0.85)",
                    border: `1px solid ${c}`, borderRadius: 4,
                    margin: "0 8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {a.slotName}
                  </div>
                </foreignObject>
                {isSel && (["nw", "n", "ne", "e", "se", "s", "sw", "w"]).map((h) => {
                  const hx = h.includes("w") ? a.bbox.x : h.includes("e") ? a.bbox.x + a.bbox.w : a.bbox.x + a.bbox.w / 2;
                  const hy = h.includes("n") ? a.bbox.y : h.includes("s") ? a.bbox.y + a.bbox.h : a.bbox.y + a.bbox.h / 2;
                  return (
                    <rect
                      key={h}
                      data-handle={h}
                      x={hx - HANDLE} y={hy - HANDLE} width={HANDLE * 2} height={HANDLE * 2}
                      fill="white" stroke={c} strokeWidth={2}
                      style={{ cursor: `${h}-resize` }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setDrag({ kind: "resize", id: a.id, handle: h, original: { ...a.bbox } });
                        (e.target as Element).setPointerCapture?.(e.pointerId);
                      }}
                    />
                  );
                })}
              </g>
            );
          })}
          {drawingRect && (
            <rect
              x={drawingRect.x} y={drawingRect.y} width={drawingRect.w} height={drawingRect.h}
              fill="hsl(217 91% 60%)" fillOpacity={0.15}
              stroke="hsl(217 91% 60%)" strokeWidth={2} strokeDasharray="6 4"
            />
          )}
        </svg>
      </div>
    </div>
  );
}
