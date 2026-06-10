import { useEffect, useMemo, useRef, useState } from "react";
import { Eraser, RotateCcw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

type EraseDot = { x: number; y: number; r: number };

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  svg: string;
  onApply: (newSvg: string) => void;
};

/**
 * Parse the viewBox out of an SVG string. Falls back to a 1000×1000 box
 * if the SVG lacks one. Returns [minX, minY, w, h].
 */
function parseViewBox(svg: string): [number, number, number, number] {
  const m = svg.match(
    /viewBox\s*=\s*["']\s*([-\d.]+)\s+([-\d.]+)\s+([\d.]+)\s+([\d.]+)\s*["']/i,
  );
  if (m) {
    return [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]), parseFloat(m[4])];
  }
  const w = svg.match(/\bwidth\s*=\s*["']?([\d.]+)/i);
  const h = svg.match(/\bheight\s*=\s*["']?([\d.]+)/i);
  return [0, 0, w ? parseFloat(w[1]) : 1000, h ? parseFloat(h[1]) : 1000];
}

/**
 * Append the erase dots as white-filled <circle> elements inside the SVG.
 * Wrapped in a <g data-eraser="1"> group so future tooling can identify them.
 */
function applyDotsToSvg(svg: string, dots: EraseDot[]): string {
  if (dots.length === 0) return svg;
  const group =
    `<g data-eraser="1">` +
    dots
      .map(
        (d) =>
          `<circle cx="${d.x.toFixed(2)}" cy="${d.y.toFixed(2)}" r="${d.r.toFixed(2)}" fill="white" stroke="none"/>`,
      )
      .join("") +
    `</g>`;
  // Insert just before the closing </svg> tag
  return svg.replace(/<\/svg>\s*$/i, `${group}</svg>`);
}

export default function SvgEraserDialog({ open, onOpenChange, svg, onApply }: Props) {
  const [brush, setBrush] = useState(20);
  const [dots, setDots] = useState<EraseDot[]>([]);
  const drawing = useRef(false);
  const svgHostRef = useRef<HTMLDivElement | null>(null);

  const vb = useMemo(() => parseViewBox(svg), [svg]);
  const [, , vbW, vbH] = vb;

  // Reset strokes when reopened
  useEffect(() => {
    if (open) {
      setDots([]);
    }
  }, [open, svg]);

  function clientToVb(e: React.PointerEvent<SVGSVGElement>) {
    const target = e.currentTarget;
    const rect = target.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    return {
      x: vb[0] + px * vbW,
      y: vb[1] + py * vbH,
    };
  }

  function brushRadiusInVb() {
    // Brush is given in % of the smaller viewbox dimension (0.5–10%)
    return (brush / 100) * Math.min(vbW, vbH);
  }

  function handlePointerDown(e: React.PointerEvent<SVGSVGElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const p = clientToVb(e);
    setDots((d) => [...d, { x: p.x, y: p.y, r: brushRadiusInVb() }]);
  }
  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!drawing.current) return;
    const p = clientToVb(e);
    setDots((d) => {
      const last = d[d.length - 1];
      const r = brushRadiusInVb();
      if (last) {
        const dx = p.x - last.x;
        const dy = p.y - last.y;
        if (dx * dx + dy * dy < (r * 0.3) ** 2) return d;
      }
      return [...d, { x: p.x, y: p.y, r }];
    });
  }
  function handlePointerUp(e: React.PointerEvent<SVGSVGElement>) {
    drawing.current = false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  }

  function handleApply() {
    onApply(applyDotsToSvg(svg, dots));
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eraser className="w-4 h-4" /> Gomme — effacer les imperfections
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-3 text-xs">
          <span className="text-muted-foreground shrink-0">Taille pinceau</span>
          <Slider
            value={[brush]}
            min={1}
            max={10}
            step={0.5}
            onValueChange={(v) => setBrush(v[0])}
            className="w-48"
          />
          <span className="font-mono tabular-nums w-10">{brush.toFixed(1)}%</span>
          <span className="ml-auto text-muted-foreground">
            {dots.length} trace{dots.length > 1 ? "s" : ""}
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setDots([])}
            disabled={dots.length === 0}
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1" /> Tout annuler
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setDots((d) => d.slice(0, -1))}
            disabled={dots.length === 0}
          >
            ↶ Annuler
          </Button>
        </div>

        <div
          ref={svgHostRef}
          className="relative bg-muted/30 border rounded-md overflow-hidden mx-auto"
          style={{
            aspectRatio: `${vbW} / ${vbH}`,
            maxHeight: "70vh",
            width: "100%",
          }}
        >
          {/* Background: the SVG to clean */}
          <div
            className="absolute inset-0 [&_svg]:w-full [&_svg]:h-full [&_svg]:block"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
          {/* Overlay: capture strokes and render preview dots */}
          <svg
            viewBox={`${vb[0]} ${vb[1]} ${vbW} ${vbH}`}
            preserveAspectRatio="xMidYMid meet"
            className="absolute inset-0 w-full h-full cursor-crosshair touch-none"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            {dots.map((d, i) => (
              <circle
                key={i}
                cx={d.x}
                cy={d.y}
                r={d.r}
                fill="white"
                stroke="rgba(220,38,38,0.6)"
                strokeWidth={Math.max(0.5, Math.min(vbW, vbH) * 0.0015)}
              />
            ))}
          </svg>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={handleApply} disabled={dots.length === 0}>
            <Eraser className="w-4 h-4 mr-1" /> Appliquer ({dots.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
