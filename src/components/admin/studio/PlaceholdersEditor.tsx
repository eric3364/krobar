import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RefreshCw, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  studioV2Api,
  type Occupancy,
  type PlaceZonesResponse,
  type Viewbox,
  type ZonePair,
  type ZoneRect,
} from "@/lib/studioV2Api";

type Props = {
  svg: string;
  viewbox: Viewbox;
  occupancy?: Occupancy;
  cardinalityMax: number;
  placement: PlaceZonesResponse | null;
  editedZones: Record<string, ZonePair[]>;
  onPlacementLoaded: (p: PlaceZonesResponse) => void;
  onEditedChange: (next: Record<string, ZonePair[]>) => void;
  onValidate: () => void;
  validated: boolean;
};

function collidesWithGrid(rect: ZoneRect, occ: Occupancy | undefined, vb: Viewbox): boolean {
  if (!occ || !occ.grid?.length) return false;
  const colW = vb[2] / occ.cols;
  const rowH = vb[3] / occ.rows;
  const c0 = Math.max(0, Math.floor((rect.x - vb[0]) / colW));
  const c1 = Math.min(occ.cols - 1, Math.floor((rect.x - vb[0] + rect.w - 0.001) / colW));
  const r0 = Math.max(0, Math.floor((rect.y - vb[1]) / rowH));
  const r1 = Math.min(occ.rows - 1, Math.floor((rect.y - vb[1] + rect.h - 0.001) / rowH));
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (occ.grid[r]?.[c]) return true;
    }
  }
  return false;
}

function ensureRect(pair: ZonePair, vb: Viewbox): ZonePair {
  if (pair.rect) return pair;
  // Default: centered, modest size
  const w = vb[2] * 0.25;
  const h = vb[3] * 0.12;
  const x = vb[0] + (vb[2] - w) / 2;
  const y = vb[1] + (vb[3] - h) / 2;
  const iw = vb[2] * 0.08;
  const ih = iw;
  return {
    ...pair,
    rect: { x, y, w, h },
    icon: pair.icon ?? { x: x + w + 4, y, w: iw, h: ih, transparent: true },
    unplaced: true,
  };
}

export default function PlaceholdersEditor({
  svg, viewbox, occupancy, cardinalityMax,
  placement, editedZones, onPlacementLoaded, onEditedChange,
  onValidate, validated,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [card, setCard] = useState<number>(cardinalityMax);
  const [backplates, setBackplates] = useState<Record<string, boolean>>({});
  const overlayRef = useRef<SVGSVGElement>(null);

  const bpKey = (n: number) => `${card}:${n}`;
  const toggleBackplate = (n: number) => {
    setBackplates((b) => ({ ...b, [bpKey(n)]: !b[bpKey(n)] }));
  };

  const fetchPlacement = useCallback(async () => {
    if (!occupancy) {
      setError("Carte d'occupation manquante (relancer la vectorisation).");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await studioV2Api.placeZones({
        occupancy,
        viewbox,
        cardinality_max: cardinalityMax,
      });
      onPlacementLoaded(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [occupancy, viewbox, cardinalityMax, onPlacementLoaded]);

  // Auto-fetch first time
  useEffect(() => {
    if (!placement && !loading) {
      fetchPlacement();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const zones: ZonePair[] = useMemo(() => {
    const key = String(card);
    const edited = editedZones[key];
    if (edited) return edited.map((p) => ensureRect(p, viewbox));
    const base = placement?.by_cardinality?.[key] ?? [];
    return base.map((p) => ensureRect(p, viewbox));
  }, [card, editedZones, placement, viewbox]);

  const dragRef = useRef<{
    n: number;
    startX: number;
    startY: number;
    orig: ZonePair;
  } | null>(null);

  const commitZones = (next: ZonePair[]) => {
    onEditedChange({ ...editedZones, [String(card)]: next });
  };

  const onPointerDown = (n: number, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const pair = zones.find((z) => z.n === n);
    if (!pair) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = { n, startX: e.clientX, startY: e.clientY, orig: pair };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || !overlayRef.current) return;
    const box = overlayRef.current.getBoundingClientRect();
    const sx = viewbox[2] / box.width;
    const sy = viewbox[3] / box.height;
    const dx = (e.clientX - d.startX) * sx;
    const dy = (e.clientY - d.startY) * sy;
    const next = zones.map((z) => {
      if (z.n !== d.n) return z;
      const r = d.orig.rect;
      const i = d.orig.icon;
      if (!r) return z;
      return {
        ...z,
        rect: { ...r, x: r.x + dx, y: r.y + dy },
        icon: i ? { ...i, x: i.x + dx, y: i.y + dy } : z.icon,
        unplaced: false,
      };
    });
    commitZones(next);
  };

  const onPointerUp = () => { dragRef.current = null; };

  const recalc = async () => {
    onEditedChange({});
    await fetchPlacement();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground mr-1">Cardinalité</span>
        {Array.from({ length: cardinalityMax }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            onClick={() => setCard(n)}
            className={[
              "h-7 w-7 text-xs rounded border font-mono",
              n === card
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background hover:bg-muted",
            ].join(" ")}
          >
            {n}
          </button>
        ))}
        <div className="flex-1" />
        <Button size="sm" variant="outline" onClick={recalc} disabled={loading}>
          {loading
            ? <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            : <RefreshCw className="w-4 h-4 mr-1" />}
          Recalculer
        </Button>
        <Button size="sm" onClick={onValidate} disabled={!zones.length || validated}>
          <Check className="w-4 h-4 mr-1" /> Valider les placeholders
        </Button>
      </div>

      {error && (
        <div className="text-xs text-destructive flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> {error}
        </div>
      )}

      <div
        className="relative w-full bg-background border rounded-md overflow-hidden"
        style={{ aspectRatio: `${viewbox[2]} / ${viewbox[3]}` }}
      >
        {/* Background SVG */}
        <div
          className="absolute inset-0 [&>svg]:w-full [&>svg]:h-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        {/* Overlay */}
        <svg
          ref={overlayRef}
          className="absolute inset-0 w-full h-full"
          viewBox={`${viewbox[0]} ${viewbox[1]} ${viewbox[2]} ${viewbox[3]}`}
          preserveAspectRatio="xMidYMid meet"
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          {zones.map((z) => {
            if (!z.rect) return null;
            const r = z.rect;
            const collides = collidesWithGrid(r, occupancy, viewbox);
            const strokeBase = z.unplaced
              ? "hsl(var(--destructive))"
              : collides
                ? "hsl(var(--destructive))"
                : "hsl(var(--primary))";
            const fillBase = collides
              ? "hsl(var(--destructive) / 0.12)"
              : "hsl(var(--primary) / 0.12)";
            const fontSize = Math.max(8, Math.min(r.w, r.h) * 0.22);
            return (
              <g key={z.n} style={{ cursor: "grab" }}>
                {/* text rect */}
                <rect
                  x={r.x} y={r.y} width={r.w} height={r.h}
                  rx={Math.min(4, r.h * 0.08)}
                  fill={fillBase}
                  stroke={strokeBase}
                  strokeWidth={1.2}
                  vectorEffect="non-scaling-stroke"
                  onPointerDown={(e) => onPointerDown(z.n, e)}
                  style={{ touchAction: "none" }}
                />
                {/* number */}
                <text
                  x={r.x + fontSize * 0.4}
                  y={r.y + fontSize * 1.1}
                  fontSize={fontSize}
                  fontWeight={700}
                  fill={strokeBase}
                  style={{ pointerEvents: "none", userSelect: "none" }}
                >
                  {z.n}
                </text>
                {/* icon placeholder */}
                {z.icon && (
                  <g
                    onPointerDown={(e) => onPointerDown(z.n, e)}
                    style={{ touchAction: "none" }}
                  >
                    <rect
                      x={z.icon.x} y={z.icon.y}
                      width={z.icon.w} height={z.icon.h}
                      rx={Math.min(3, z.icon.h * 0.08)}
                      fill="hsl(var(--primary) / 0.04)"
                      stroke={strokeBase}
                      strokeWidth={1}
                      strokeDasharray="3 2"
                      vectorEffect="non-scaling-stroke"
                    />
                    {/* generic icon glyph: small square at center */}
                    <rect
                      x={z.icon.x + z.icon.w * 0.35}
                      y={z.icon.y + z.icon.h * 0.35}
                      width={z.icon.w * 0.3}
                      height={z.icon.h * 0.3}
                      fill="none"
                      stroke={strokeBase}
                      strokeWidth={0.8}
                      strokeOpacity={0.6}
                      vectorEffect="non-scaling-stroke"
                    />
                  </g>
                )}
              </g>
            );
          })}
        </svg>

        {loading && (
          <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      {validated && (
        <div className="rounded-md border bg-emerald-500/10 border-emerald-500/30 p-3 text-xs">
          <p className="font-medium text-emerald-700 dark:text-emerald-300">
            Placeholders validés
          </p>
          <p className="text-muted-foreground mt-1">
            Étape suivante (habillage du texte) à venir.
          </p>
        </div>
      )}
    </div>
  );
}
