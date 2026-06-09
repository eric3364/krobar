import { useRef, useState, useCallback, useEffect, useMemo, useLayoutEffect } from "react";
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react";

type Props = { svg: string; mirrored?: boolean; rotation?: 0 | 90 | 180 | 270 };

const MAX_SCALE = 8;
const STEP = 1.25;
const FIT_MARGIN = 0.96; // small breathing margin

/** Extract natural width/height from SVG markup (viewBox preferred, then width/height). */
function getSvgNaturalSize(svg: string): { w: number; h: number } {
  const vb = svg.match(/viewBox\s*=\s*["']\s*([-\d.]+)\s+([-\d.]+)\s+([\d.]+)\s+([\d.]+)\s*["']/i);
  if (vb) {
    const w = parseFloat(vb[3]);
    const h = parseFloat(vb[4]);
    if (w > 0 && h > 0) return { w, h };
  }
  const wm = svg.match(/<svg[^>]*\swidth\s*=\s*["']([\d.]+)/i);
  const hm = svg.match(/<svg[^>]*\sheight\s*=\s*["']([\d.]+)/i);
  if (wm && hm) {
    const w = parseFloat(wm[1]);
    const h = parseFloat(hm[1]);
    if (w > 0 && h > 0) return { w, h };
  }
  return { w: 1000, h: 1000 };
}

export default function ZoomableSvg({ svg, mirrored = false, rotation = 0 }: Props) {
  const naturalRaw = useMemo(() => getSvgNaturalSize(svg), [svg]);
  // After rotation by 90°/270° the bounding box swaps W/H.
  const rotated90 = rotation === 90 || rotation === 270;
  const natural = rotated90
    ? { w: naturalRaw.h, h: naturalRaw.w }
    : naturalRaw;

  const containerRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  // Measure container
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setBox({ w: r.width, h: r.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fit scale: image scaled relative to its NATURAL size so it fits the container.
  const fitScale = useMemo(() => {
    if (!box.w || !box.h) return 1;
    return Math.min(box.w / natural.w, box.h / natural.h) * FIT_MARGIN;
  }, [box, natural]);

  // `scale` is expressed relative to natural pixel size (1 = 100%).
  const [scale, setScale] = useState<number | null>(null);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  // Initialize / re-fit when svg or container size changes meaningfully
  useEffect(() => {
    if (!box.w || !box.h) return;
    setScale(fitScale);
    setTx(0);
    setTy(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [svg, fitScale]);

  const effectiveScale = scale ?? fitScale;
  const minScale = Math.min(fitScale * 0.25, 0.05);
  const maxScale = Math.max(MAX_SCALE, fitScale * 1.5);

  const clamp = (s: number) => Math.min(maxScale, Math.max(minScale, +s.toFixed(4)));

  const resetFit = useCallback(() => {
    setScale(fitScale);
    setTx(0);
    setTy(0);
  }, [fitScale]);

  const zoomIn = useCallback(() => {
    setScale((s) => clamp((s ?? fitScale) * STEP));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitScale, minScale, maxScale]);

  const zoomOut = useCallback(() => {
    setScale((s) => {
      const next = clamp((s ?? fitScale) / STEP);
      if (Math.abs(next - fitScale) < 1e-3) {
        setTx(0);
        setTy(0);
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitScale, minScale, maxScale]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey && Math.abs(e.deltaY) < 30) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? STEP : 1 / STEP;
    setScale((s) => clamp((s ?? fitScale) * factor));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitScale, minScale, maxScale]);

  const zoomed = effectiveScale > fitScale + 1e-3;

  const onMouseDown = (e: React.MouseEvent) => {
    if (!zoomed) return;
    dragRef.current = { x: e.clientX, y: e.clientY, tx, ty };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragRef.current) return;
    setTx(dragRef.current.tx + (e.clientX - dragRef.current.x));
    setTy(dragRef.current.ty + (e.clientY - dragRef.current.y));
  };
  const endDrag = () => { dragRef.current = null; };

  // Label: percentage relative to natural size (1 = 100%).
  const pctLabel = Math.round(effectiveScale * 100);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden"
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={endDrag}
      onMouseLeave={endDrag}
      style={{ cursor: zoomed ? (dragRef.current ? "grabbing" : "grab") : "default" }}
    >
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{
          transform: `translate(${tx}px, ${ty}px)`,
          transition: dragRef.current ? "none" : "transform 120ms ease-out",
        }}
      >
        <div
          style={{
            width: natural.w * effectiveScale,
            height: natural.h * effectiveScale,
            transition: dragRef.current ? "none" : "width 120ms ease-out, height 120ms ease-out",
          }}
          className="[&>svg]:!w-full [&>svg]:!h-full [&>svg]:block"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>

      <div className="absolute bottom-2 right-2 flex gap-1 bg-background/90 backdrop-blur border rounded-md p-1 shadow-sm">
        <Button
          type="button" size="icon" variant="ghost" className="h-7 w-7"
          onClick={zoomOut} disabled={effectiveScale <= minScale + 1e-3}
          title="Dézoomer"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button
          type="button" size="icon" variant="ghost" className="h-7 w-7"
          onClick={resetFit} title="Ajuster à la fenêtre"
        >
          <Maximize2 className="h-4 w-4" />
        </Button>
        <Button
          type="button" size="icon" variant="ghost" className="h-7 w-7"
          onClick={zoomIn} disabled={effectiveScale >= maxScale - 1e-3}
          title="Zoomer"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <div className="px-2 text-xs text-muted-foreground self-center tabular-nums min-w-[3rem] text-right">
          {pctLabel} %
        </div>
      </div>
    </div>
  );
}
