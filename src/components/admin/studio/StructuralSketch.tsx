// Croquis structurel schématique d'une cellule SICAI.
// Représente la STRUCTURE (famille + cardinalité + régime), pas l'illustration.
// Toujours badgé "schématique" pour éviter confusion avec un rendu final.

import { CARDINALITY_TO_N } from "@/lib/studioV2Api";

type Props = {
  family: string;
  cardinality: string;
  regime: string;
  size?: number;
  showBadge?: boolean;
  className?: string;
};

const STROKE = "currentColor";

function shapesOnCircle(n: number, cx: number, cy: number, r: number) {
  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < n; i++) {
    const a = (-Math.PI / 2) + (i * (2 * Math.PI)) / n;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return pts;
}

function shapesOnLine(n: number, y: number, x0: number, x1: number) {
  if (n === 1) return [{ x: (x0 + x1) / 2, y }];
  const step = (x1 - x0) / (n - 1);
  return Array.from({ length: n }, (_, i) => ({ x: x0 + i * step, y }));
}

export default function StructuralSketch({
  family,
  cardinality,
  regime,
  size = 96,
  showBadge = true,
  className = "",
}: Props) {
  const n = CARDINALITY_TO_N[cardinality] ?? 1;
  const W = 100;
  const H = 100;
  const cx = W / 2;
  const cy = H / 2;
  const filled = regime === "CONCRET";
  const semi = regime === "SEMI_METAPHORIQUE";

  // Compute shape positions based on family
  let positions: Array<{ x: number; y: number }> = [];
  const edges: Array<[number, number]> = [];
  let extra: React.ReactNode = null;

  if (family === "CONCEPT") {
    if (n === 1) {
      positions = [{ x: cx, y: cy }];
    } else {
      positions = shapesOnCircle(n, cx, cy, 30);
      // light spokes from center
      extra = positions.map((p, i) => (
        <line key={`sp${i}`} x1={cx} y1={cy} x2={p.x} y2={p.y}
          stroke={STROKE} strokeWidth={0.6} opacity={0.4} />
      ));
    }
  } else if (family === "DESCR") {
    positions = shapesOnLine(n, cy, 18, W - 18);
  } else if (family === "PROCED") {
    positions = shapesOnLine(n, cy, 14, W - 14);
    for (let i = 0; i < n - 1; i++) edges.push([i, i + 1]);
  } else if (family === "NARRA") {
    // zigzag timeline
    const xs = shapesOnLine(n, cy, 14, W - 14).map((p) => p.x);
    positions = xs.map((x, i) => ({ x, y: cy + (i % 2 === 0 ? -10 : 10) }));
    for (let i = 0; i < n - 1; i++) edges.push([i, i + 1]);
  } else if (family === "OPPO") {
    // two camps
    const half = Math.ceil(n / 2);
    const rest = n - half;
    const left = Array.from({ length: half }, (_, i) =>
      ({ x: 24, y: cy + (i - (half - 1) / 2) * 18 })
    );
    const right = Array.from({ length: rest }, (_, i) =>
      ({ x: W - 24, y: cy + (i - (rest - 1) / 2) * 18 })
    );
    positions = [...left, ...right];
    // central tension line
    extra = (
      <line x1={cx} y1={12} x2={cx} y2={H - 12}
        stroke={STROKE} strokeWidth={0.8} strokeDasharray="3 3" opacity={0.5} />
    );
  } else if (family === "EXPLI") {
    // hub-and-spokes: 1 root + n-1 children, or fan
    if (n === 1) {
      positions = [{ x: cx, y: cy }];
    } else {
      const root = { x: cx, y: 20 };
      const children = shapesOnLine(n - 1, H - 22, 18, W - 18);
      positions = [root, ...children];
      for (let i = 1; i < n; i++) edges.push([0, i]);
    }
  } else {
    positions = shapesOnLine(n, cy, 18, W - 18);
  }

  const r = n <= 2 ? 9 : n <= 4 ? 7 : 6;

  return (
    <div className={`relative inline-block ${className}`} style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${W} ${H}`} width={size} height={size}
        className="text-foreground/70" aria-hidden>
        {/* edges first */}
        {edges.map(([a, b], i) => {
          const p1 = positions[a]; const p2 = positions[b];
          if (!p1 || !p2) return null;
          return (
            <line key={`e${i}`} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
              stroke={STROKE} strokeWidth={0.8} opacity={0.6} />
          );
        })}
        {extra}
        {positions.map((p, i) => (
          <g key={`n${i}`}>
            <circle
              cx={p.x} cy={p.y} r={r}
              fill={filled ? STROKE : "none"}
              stroke={STROKE}
              strokeWidth={1.2}
            />
            {semi && (
              <circle cx={p.x + r * 0.55} cy={p.y - r * 0.55} r={1.6}
                fill={STROKE} opacity={0.85} />
            )}
          </g>
        ))}
      </svg>
      {showBadge && (
        <span className="absolute bottom-0 right-0 text-[8px] uppercase tracking-wider
                         bg-muted text-muted-foreground px-1 py-px rounded-sm border">
          schématique
        </span>
      )}
    </div>
  );
}
