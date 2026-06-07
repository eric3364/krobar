import { useRef, useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react";

type Props = { svg: string };

const MIN_SCALE = 1;
const MAX_SCALE = 8;
const STEP = 1.25;

export default function ZoomableSvg({ svg }: Props) {
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  // Reset when svg changes
  useEffect(() => {
    setScale(1);
    setTx(0);
    setTy(0);
  }, [svg]);

  const reset = useCallback(() => {
    setScale(1);
    setTx(0);
    setTy(0);
  }, []);

  const zoomIn = useCallback(() => {
    setScale((s) => Math.min(MAX_SCALE, +(s * STEP).toFixed(3)));
  }, []);
  const zoomOut = useCallback(() => {
    setScale((s) => {
      const next = Math.max(MIN_SCALE, +(s / STEP).toFixed(3));
      if (next === 1) {
        setTx(0);
        setTy(0);
      }
      return next;
    });
  }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey && Math.abs(e.deltaY) < 30) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? STEP : 1 / STEP;
    setScale((s) => {
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, +(s * factor).toFixed(3)));
      if (next === 1) {
        setTx(0);
        setTy(0);
      }
      return next;
    });
  }, []);

  const onMouseDown = (e: React.MouseEvent) => {
    if (scale <= 1) return;
    dragRef.current = { x: e.clientX, y: e.clientY, tx, ty };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragRef.current) return;
    setTx(dragRef.current.tx + (e.clientX - dragRef.current.x));
    setTy(dragRef.current.ty + (e.clientY - dragRef.current.y));
  };
  const endDrag = () => {
    dragRef.current = null;
  };

  return (
    <div
      className="relative w-full h-full overflow-hidden"
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={endDrag}
      onMouseLeave={endDrag}
      style={{ cursor: scale > 1 ? (dragRef.current ? "grabbing" : "grab") : "default" }}
    >
      <div
        className="w-full h-full flex items-center justify-center [&>svg]:!w-full [&>svg]:!h-full [&>svg]:max-w-full [&>svg]:max-h-full"
        style={{
          transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
          transformOrigin: "center center",
          transition: dragRef.current ? "none" : "transform 120ms ease-out",
        }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <div className="absolute bottom-2 right-2 flex gap-1 bg-background/90 backdrop-blur border rounded-md p-1 shadow-sm">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={zoomOut}
          disabled={scale <= MIN_SCALE}
          title="Dézoomer"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={reset}
          title="Ajuster à la fenêtre"
        >
          <Maximize2 className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={zoomIn}
          disabled={scale >= MAX_SCALE}
          title="Zoomer"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <div className="px-2 text-xs text-muted-foreground self-center tabular-nums min-w-[3rem] text-right">
          {Math.round(scale * 100)} %
        </div>
      </div>
    </div>
  );
}
