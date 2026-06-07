import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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

type LoremLen = "short" | "medium" | "long";
type ResizeCorner = "nw" | "ne" | "sw" | "se";
type HabillageMode = "integre" | "cartouche";
type TraitSide = "left" | "right";

const LOREM: Record<LoremLen, string> = {
  short: "Lorem ipsum dolor sit.",
  medium: "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt.",
  long: "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.",
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
  const w = vb[2] * 0.25;
  const h = vb[3] * 0.12;
  const x = vb[0] + (vb[2] - w) / 2;
  const y = vb[1] + (vb[3] - h) / 2;
  const iw = vb[2] * 0.08;
  return {
    ...pair,
    rect: { x, y, w, h },
    icon: pair.icon ?? { x: x + w + 4, y, w: iw, h: iw, transparent: true },
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
  // Lorem permanent (toujours affiché). Longueur + taille de police sont GLOBALES.
  const [loremLen, setLoremLen] = useState<LoremLen>("medium");
  const FONT_STEPS = [24, 20, 16, 13, 11] as const;
  const [fontSizePx, setFontSizePx] = useState<number>(16);
  const [selectedN, setSelectedN] = useState<number | null>(null);
  const [commonSize, setCommonSize] = useState<{ w: number; h: number } | null>(null);
  const [overflow, setOverflow] = useState<Record<string, boolean>>({});
  const [loremHeights, setLoremHeights] = useState<Record<string, number>>({});
  // B2 — habillage
  const [habMode, setHabMode] = useState<Record<string, HabillageMode>>({});
  const [traitSide, setTraitSide] = useState<Record<string, TraitSide>>({});
  const [habillageValidated, setHabillageValidated] = useState(false);

  const overlayRef = useRef<SVGSVGElement>(null);
  const loremRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const habillageMode = validated; // entered habillage sub-mode after placeholders validated
  const zKey = (n: number) => `${card}:${n}`;
  const toggleBackplate = (n: number) =>
    setBackplates((b) => ({ ...b, [zKey(n)]: !b[zKey(n)] }));
  const getHabMode = (n: number): HabillageMode => habMode[zKey(n)] ?? "integre";
  const setHabModeFor = (n: number, v: HabillageMode) =>
    setHabMode((m) => ({ ...m, [zKey(n)]: v }));
  const getAutoSide = (r: ZoneRect): TraitSide =>
    (r.x + r.w / 2) < (viewbox[0] + viewbox[2] / 2) ? "right" : "left";
  const getTraitSide = (n: number, r: ZoneRect): TraitSide =>
    traitSide[zKey(n)] ?? getAutoSide(r);
  const flipTraitSide = (n: number, r: ZoneRect) => {
    const cur = getTraitSide(n, r);
    setTraitSide((m) => ({ ...m, [zKey(n)]: cur === "left" ? "right" : "left" }));
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
        occupancy, viewbox, cardinality_max: cardinalityMax,
      });
      onPlacementLoaded(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [occupancy, viewbox, cardinalityMax, onPlacementLoaded]);

  useEffect(() => {
    if (!placement && !loading) fetchPlacement();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rawZones: ZonePair[] = useMemo(() => {
    const key = String(card);
    const edited = editedZones[key];
    if (edited) return edited.map((p) => ensureRect(p, viewbox));
    const base = placement?.by_cardinality?.[key] ?? [];
    return base.map((p) => ensureRect(p, viewbox));
  }, [card, editedZones, placement, viewbox]);

  useEffect(() => {
    if (commonSize) return;
    const r = rawZones[0]?.rect;
    if (r) setCommonSize({ w: r.w, h: r.h });
  }, [rawZones, commonSize]);

  const zones = useMemo(() => {
    if (!commonSize) return rawZones;
    return rawZones.map((z) => {
      if (!z.rect) return z;
      const r = z.rect;
      const effRect = { x: r.x, y: r.y, w: commonSize.w, h: commonSize.h };
      let icon = z.icon;
      if (icon) {
        const iconOnRight = icon.x >= r.x + r.w / 2;
        const gap = 4;
        const ix = iconOnRight ? effRect.x + effRect.w + gap : effRect.x - icon.w - gap;
        icon = { ...icon, x: ix, y: effRect.y };
      }
      return { ...z, rect: effRect, icon };
    });
  }, [rawZones, commonSize]);

  const commitZones = (next: ZonePair[]) => {
    onEditedChange({ ...editedZones, [String(card)]: next });
  };

  // Drag (move)
  const dragRef = useRef<{ n: number; startX: number; startY: number; orig: ZonePair } | null>(null);
  const onMoveDown = (n: number, e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    const pair = zones.find((z) => z.n === n);
    if (!pair) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = { n, startX: e.clientX, startY: e.clientY, orig: pair };
    setSelectedN(n);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (resizeRef.current) return onResizeMove(e);
    const d = dragRef.current;
    if (!d || !overlayRef.current) return;
    const box = overlayRef.current.getBoundingClientRect();
    const sx = viewbox[2] / box.width;
    const sy = viewbox[3] / box.height;
    const dx = (e.clientX - d.startX) * sx;
    const dy = (e.clientY - d.startY) * sy;
    const next = rawZones.map((z) => {
      if (z.n !== d.n) return z;
      const r = d.orig.rect; const i = d.orig.icon;
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
  const onPointerUp = () => { dragRef.current = null; resizeRef.current = null; };

  // Resize (common size)
  const resizeRef = useRef<{
    corner: ResizeCorner;
    startX: number; startY: number;
    origW: number; origH: number;
  } | null>(null);
  const onResizeDown = (n: number, corner: ResizeCorner, e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (!commonSize) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    resizeRef.current = {
      corner, startX: e.clientX, startY: e.clientY,
      origW: commonSize.w, origH: commonSize.h,
    };
    setSelectedN(n);
  };
  const onResizeMove = (e: React.PointerEvent) => {
    const r = resizeRef.current;
    if (!r || !overlayRef.current || !commonSize) return;
    const box = overlayRef.current.getBoundingClientRect();
    const sx = viewbox[2] / box.width;
    const sy = viewbox[3] / box.height;
    const dx = (e.clientX - r.startX) * sx;
    const dy = (e.clientY - r.startY) * sy;
    const signX = r.corner === "ne" || r.corner === "se" ? 1 : -1;
    const signY = r.corner === "sw" || r.corner === "se" ? 1 : -1;
    const w = Math.max(viewbox[2] * 0.04, r.origW + signX * dx);
    const h = Math.max(viewbox[3] * 0.03, r.origH + signY * dy);
    setCommonSize({ w, h });
  };

  // Lorem overflow + height detection (lorem permanent)
  useLayoutEffect(() => {
    const ovf: Record<string, boolean> = {};
    const hts: Record<string, number> = {};
    for (const z of zones) {
      const key = zKey(z.n);
      const el = loremRefs.current[key];
      if (el) {
        ovf[key] = el.scrollHeight > el.clientHeight + 1;
        hts[key] = el.scrollHeight;
      }
    }
    setOverflow(ovf);
    setLoremHeights(hts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zones, loremLen, fontSizePx, commonSize, backplates, card, habMode]);

  const recalc = async () => {
    onEditedChange({});
    setCommonSize(null);
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
        <div className="flex items-center gap-1 ml-3">
          <span className="text-xs text-muted-foreground mr-1">Police</span>
          {FONT_STEPS.map((s) => (
            <button
              key={s}
              onClick={() => setFontSizePx(s)}
              className={[
                "h-7 px-2 text-xs rounded border font-mono",
                s === fontSizePx
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background hover:bg-muted",
              ].join(" ")}
              title={`${s}px (palier autofit)`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 ml-3">
          <span className="text-xs text-muted-foreground mr-1">Lorem</span>
          {(["short","medium","long"] as LoremLen[]).map((l) => (
            <button
              key={l}
              onClick={() => setLoremLen(l)}
              className={[
                "h-7 px-2 text-xs rounded border",
                l === loremLen
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background hover:bg-muted",
              ].join(" ")}
            >
              {l === "short" ? "court" : l === "medium" ? "moyen" : "long"}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <Button size="sm" variant="outline" onClick={recalc} disabled={loading}>
          {loading
            ? <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            : <RefreshCw className="w-4 h-4 mr-1" />}
          Recalculer
        </Button>
        {!habillageMode ? (
          <Button size="sm" onClick={onValidate} disabled={!zones.length || validated}>
            <Check className="w-4 h-4 mr-1" /> Valider les placeholders
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={() => setHabillageValidated(true)}
            disabled={!zones.length || habillageValidated}
          >
            <Check className="w-4 h-4 mr-1" /> Valider l'habillage
          </Button>
        )}
      </div>

      {/* Per-zone controls bar */}
      {selectedN !== null && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Zone {selectedN} —</span>

          {habillageMode && (() => {
            const z = zones.find((x) => x.n === selectedN);
            const r = z?.rect;
            if (!r) return null;
            const mode = getHabMode(selectedN);
            const side = getTraitSide(selectedN, r);
            return (
              <>
                <span className="text-muted-foreground">habillage :</span>
                {(["integre", "cartouche"] as HabillageMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setHabModeFor(selectedN, m)}
                    className={[
                      "px-2 h-6 rounded border",
                      mode === m
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background hover:bg-muted",
                    ].join(" ")}
                  >
                    {m === "integre" ? "Intégré" : "Cartouche"}
                  </button>
                ))}
                {mode === "cartouche" && (
                  <button
                    onClick={() => flipTraitSide(selectedN, r)}
                    className="px-2 h-6 rounded border bg-background hover:bg-muted"
                    title="Inverser le côté du trait"
                  >
                    Trait : {side === "left" ? "gauche" : "droite"} ⇆
                  </button>
                )}
              </>
            );
          })()}

        </div>
      )}

      {error && (
        <div className="text-xs text-destructive flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> {error}
        </div>
      )}

      <div
        className="relative w-full bg-background border rounded-md overflow-hidden"
        style={{ aspectRatio: `${viewbox[2]} / ${viewbox[3]}` }}
      >
        <div
          className="absolute inset-0 [&>svg]:w-full [&>svg]:h-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <svg
          ref={overlayRef}
          className="absolute inset-0 w-full h-full"
          viewBox={`${viewbox[0]} ${viewbox[1]} ${viewbox[2]} ${viewbox[3]}`}
          preserveAspectRatio="xMidYMid meet"
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedN(null); }}
        >
          {zones.map((z) => {
            if (!z.rect) return null;
            const r = z.rect;
            const key = zKey(z.n);
            const isSelected = selectedN === z.n;
            const collides = collidesWithGrid(r, occupancy, viewbox);
            const mode = getHabMode(z.n);
            const isCartouche = habillageMode && mode === "cartouche";
            const side: TraitSide = getTraitSide(z.n, r);
            const overflows = showLorem && !isCartouche && !!overflow[key];
            const strokeBase = overflows
              ? "#f59e0b"
              : z.unplaced
                ? "hsl(var(--destructive))"
                : collides
                  ? "hsl(var(--destructive))"
                  : "hsl(var(--primary))";
            const fillBase = collides
              ? "hsl(var(--destructive) / 0.12)"
              : "hsl(var(--primary) / 0.12)";
            const fontSize = Math.max(8, Math.min(r.w, r.h) * 0.22);
            const hasBackplate = !!backplates[key];
            const btnSize = Math.max(6, Math.min(r.w, r.h) * 0.18);
            const btnX = r.x + r.w - btnSize - 2;
            const btnY = r.y + 2;
            const handleSize = Math.max(6, Math.min(r.w, r.h) * 0.14);

            // Trait (cartouche) geometry
            // Indicative height ≈ 3 lines; if lorem shown, follow actual rendered height.
            const indicativeH = fontSize * 0.55 * 1.2 * 3 + 6;
            const traitH = showLorem && loremHeights[key]
              ? Math.max(loremHeights[key], 6)
              : indicativeH;
            const traitX = side === "left" ? r.x - 4 : r.x + r.w + 4;
            const traitY = r.y;

            return (
              <g key={z.n}>
                {hasBackplate && (
                  <rect
                    x={r.x} y={r.y} width={r.w} height={r.h}
                    rx={Math.min(4, r.h * 0.08)}
                    fill="#ffffff" fillOpacity={0.85}
                    pointerEvents="none"
                  />
                )}
                <rect
                  x={r.x} y={r.y} width={r.w} height={r.h}
                  rx={Math.min(4, r.h * 0.08)}
                  fill={hasBackplate ? "transparent" : fillBase}
                  stroke={strokeBase}
                  strokeWidth={isSelected ? 2 : 1.2}
                  vectorEffect="non-scaling-stroke"
                  onPointerDown={(e) => onMoveDown(z.n, e)}
                  style={{ touchAction: "none", cursor: "grab" }}
                />

                {/* Lorem text (via foreignObject) */}
                {showLorem && (
                  <foreignObject x={r.x} y={r.y} width={r.w} height={r.h} pointerEvents="none">
                    <div
                      ref={(el) => { loremRefs.current[key] = el; }}
                      style={{
                        width: "100%", height: "100%",
                        padding: `${Math.min(r.h * 0.08, 4)}px ${Math.min(r.w * 0.04, 4)}px`,
                        fontSize: `${fontSize * 0.55}px`,
                        lineHeight: 1.2,
                        overflow: isCartouche ? "visible" : "hidden",
                        wordBreak: "break-word",
                        color: "hsl(var(--foreground))",
                        fontFamily: "system-ui, sans-serif",
                        boxSizing: "border-box",
                      }}
                    >
                      {LOREM[getLoremLen(z.n)]}
                    </div>
                  </foreignObject>
                )}

                {/* Zone number (hidden when lorem is on) */}
                {!showLorem && (
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
                )}

                {/* Habillage badge (integré) */}
                {habillageMode && !isCartouche && !showLorem && (
                  <text
                    x={r.x + r.w / 2} y={r.y + r.h - 3}
                    fontSize={Math.max(6, fontSize * 0.35)}
                    textAnchor="middle"
                    fill="hsl(var(--muted-foreground))"
                    style={{ pointerEvents: "none", userSelect: "none" }}
                  >
                    texte intégré
                  </text>
                )}

                {/* Cartouche trait */}
                {isCartouche && (
                  <line
                    x1={traitX} y1={traitY}
                    x2={traitX} y2={traitY + traitH}
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                    pointerEvents="none"
                  />
                )}

                {/* Overflow badge */}
                {overflows && (
                  <g pointerEvents="none">
                    <circle cx={r.x + r.w - 6} cy={r.y + r.h - 6} r={5} fill="#f59e0b" />
                    <text
                      x={r.x + r.w - 6} y={r.y + r.h - 4}
                      fontSize={7} fontWeight={700}
                      textAnchor="middle" fill="#ffffff"
                    >!</text>
                  </g>
                )}

                {/* Backplate toggle */}
                <g
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); toggleBackplate(z.n); }}
                  style={{ cursor: "pointer" }}
                >
                  <title>{hasBackplate ? "Désactiver le fond blanc" : "Activer le fond blanc"}</title>
                  <rect
                    x={btnX} y={btnY} width={btnSize} height={btnSize}
                    rx={btnSize * 0.2}
                    fill={hasBackplate ? "#ffffff" : "hsl(var(--background))"}
                    stroke={strokeBase} strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                  />
                  {hasBackplate && (
                    <path
                      d={`M ${btnX + btnSize * 0.22} ${btnY + btnSize * 0.55} L ${btnX + btnSize * 0.42} ${btnY + btnSize * 0.75} L ${btnX + btnSize * 0.78} ${btnY + btnSize * 0.28}`}
                      fill="none" stroke={strokeBase} strokeWidth={1.4}
                      strokeLinecap="round" strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
                </g>

                {/* Resize handles (selected only) */}
                {isSelected && (["nw","ne","sw","se"] as ResizeCorner[]).map((c) => {
                  const hx = c === "nw" || c === "sw" ? r.x - handleSize/2 : r.x + r.w - handleSize/2;
                  const hy = c === "nw" || c === "ne" ? r.y - handleSize/2 : r.y + r.h - handleSize/2;
                  const cursor = c === "nw" || c === "se" ? "nwse-resize" : "nesw-resize";
                  return (
                    <rect
                      key={c}
                      x={hx} y={hy} width={handleSize} height={handleSize}
                      fill="hsl(var(--background))"
                      stroke="hsl(var(--foreground))"
                      strokeWidth={1.5}
                      vectorEffect="non-scaling-stroke"
                      style={{ cursor, touchAction: "none" }}
                      onPointerDown={(e) => onResizeDown(z.n, c, e)}
                    />
                  );
                })}

                {/* Icon placeholder */}
                {z.icon && (
                  <g
                    onPointerDown={(e) => onMoveDown(z.n, e)}
                    style={{ touchAction: "none", cursor: "grab" }}
                  >
                    <rect
                      x={z.icon.x} y={z.icon.y}
                      width={z.icon.w} height={z.icon.h}
                      rx={Math.min(3, z.icon.h * 0.08)}
                      fill="hsl(var(--primary) / 0.04)"
                      stroke={strokeBase} strokeWidth={1}
                      strokeDasharray="3 2"
                      vectorEffect="non-scaling-stroke"
                    />
                    <rect
                      x={z.icon.x + z.icon.w * 0.35}
                      y={z.icon.y + z.icon.h * 0.35}
                      width={z.icon.w * 0.3}
                      height={z.icon.h * 0.3}
                      fill="none"
                      stroke={strokeBase} strokeWidth={0.8} strokeOpacity={0.6}
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

      <p className="text-[11px] text-muted-foreground">
        Clique une zone pour la sélectionner, glisse pour la déplacer, coins pour
        redimensionner. La taille de boîte est <strong>commune</strong> à toutes les cardinalités.
      </p>

      {habillageValidated && (
        <div className="rounded-md border bg-emerald-500/10 border-emerald-500/30 p-3 text-xs">
          <p className="font-medium text-emerald-700 dark:text-emerald-300">
            Habillage validé
          </p>
          <p className="text-muted-foreground mt-1">
            Étape suivante (métadonnées et bibliothèque) à venir.
          </p>
        </div>
      )}
    </div>
  );
}
