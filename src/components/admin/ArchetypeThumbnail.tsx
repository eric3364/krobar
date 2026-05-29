// Miniatures SVG symboliques pour les archétypes de matrices.
// Ratio 4:3 (viewBox 80×60), trait noir #0f172a, fond blanc.

import React from "react";

type Props = {
  archetype: string | null | undefined;
  status?: "verified" | "proposed" | "unknown";
  title?: string;
  className?: string;
};

const VB_W = 80;
const VB_H = 60;
const STROKE = "#0f172a";
const SW = 1;

function wrap(children: React.ReactNode, title: string, className?: string) {
  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      className={className ?? "w-[60px] h-[45px] bg-white rounded border"}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      {children}
    </svg>
  );
}

function rects(items: { x: number; y: number; w: number; h: number }[]) {
  return items.map((r, i) => (
    <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill="none" stroke={STROKE} strokeWidth={SW} />
  ));
}

function arrows(points: { x1: number; y1: number; x2: number; y2: number }[]) {
  return (
    <>
      <defs>
        <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill={STROKE} />
        </marker>
      </defs>
      {points.map((p, i) => (
        <line
          key={i}
          x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2}
          stroke={STROKE} strokeWidth={SW} markerEnd="url(#arr)"
        />
      ))}
    </>
  );
}

function linearSequence(n: number) {
  const pad = 4;
  const gap = 2;
  const arrowSpace = 4;
  const totalGap = (n - 1) * (gap + arrowSpace);
  const w = (VB_W - 2 * pad - totalGap) / n;
  const h = 20;
  const y = (VB_H - h) / 2;
  const items: { x: number; y: number; w: number; h: number }[] = [];
  const ars: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let i = 0; i < n; i++) {
    const x = pad + i * (w + gap + arrowSpace);
    items.push({ x, y, w, h });
    if (i < n - 1) {
      ars.push({ x1: x + w, y1: y + h / 2, x2: x + w + arrowSpace + gap - 1, y2: y + h / 2 });
    }
  }
  return (<>{rects(items)}{arrows(ars)}</>);
}

function linearGrid(n1: number, n2: number) {
  const pad = 4;
  const gap = 2;
  const h = 16;
  const totalH = 2 * h + 4;
  const yTop = (VB_H - totalH) / 2;
  const yBot = yTop + h + 4;
  const w1 = (VB_W - 2 * pad - (n1 - 1) * gap) / n1;
  const w2 = (VB_W - 2 * pad - (n2 - 1) * gap) / n2;
  const startX2 = (VB_W - (n2 * w2 + (n2 - 1) * gap)) / 2;
  const items: { x: number; y: number; w: number; h: number }[] = [];
  for (let i = 0; i < n1; i++) items.push({ x: pad + i * (w1 + gap), y: yTop, w: w1, h });
  for (let i = 0; i < n2; i++) items.push({ x: startX2 + i * (w2 + gap), y: yBot, w: w2, h });
  return <>{rects(items)}</>;
}

function pyramid(n: number) {
  const pad = 4;
  const top = 4;
  const bottom = VB_H - 4;
  const apexX = VB_W / 2;
  const baseHalf = (VB_W - 2 * pad) / 2;
  const lines: React.ReactNode[] = [];
  // outer triangle
  lines.push(
    <polygon key="out" points={`${apexX},${top} ${apexX - baseHalf},${bottom} ${apexX + baseHalf},${bottom}`}
      fill="none" stroke={STROKE} strokeWidth={SW} />
  );
  for (let i = 1; i < n; i++) {
    const y = top + (i * (bottom - top)) / n;
    const half = (baseHalf * i) / n;
    lines.push(<line key={i} x1={apexX - half} y1={y} x2={apexX + half} y2={y} stroke={STROKE} strokeWidth={SW} />);
  }
  return <>{lines}</>;
}

function cycle(n: number) {
  const cx = VB_W / 2;
  const cy = VB_H / 2;
  const r = 22;
  const dotR = 3.5;
  const elems: React.ReactNode[] = [];
  elems.push(<circle key="g" cx={cx} cy={cy} r={r} fill="none" stroke={STROKE} strokeWidth={SW} strokeDasharray="2 2" />);
  for (let i = 0; i < n; i++) {
    const a = (-Math.PI / 2) + (i * 2 * Math.PI) / n;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    elems.push(<circle key={`c${i}`} cx={x} cy={y} r={dotR} fill="white" stroke={STROKE} strokeWidth={SW} />);
  }
  return <>{elems}</>;
}

function hubSpokes(n: number) {
  const cx = VB_W / 2;
  const cy = VB_H / 2;
  const r = 22;
  const hubR = 5;
  const dotR = 4;
  const elems: React.ReactNode[] = [];
  for (let i = 0; i < n; i++) {
    const a = (-Math.PI / 2) + (i * 2 * Math.PI) / n;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    elems.push(<line key={`l${i}`} x1={cx} y1={cy} x2={x} y2={y} stroke={STROKE} strokeWidth={SW} />);
    elems.push(<circle key={`s${i}`} cx={x} cy={y} r={dotR} fill="white" stroke={STROKE} strokeWidth={SW} />);
  }
  elems.push(<circle key="hub" cx={cx} cy={cy} r={hubR} fill="white" stroke={STROKE} strokeWidth={SW} />);
  return <>{elems}</>;
}

function grid2x2() {
  const pad = 6;
  const w = (VB_W - 2 * pad - 2) / 2;
  const h = (VB_H - 2 * pad - 2) / 2;
  return rects([
    { x: pad, y: pad, w, h },
    { x: pad + w + 2, y: pad, w, h },
    { x: pad, y: pad + h + 2, w, h },
    { x: pad + w + 2, y: pad + h + 2, w, h },
  ]);
}

function grid3x3(emphBorder = false) {
  const pad = 6;
  const cell = (VB_W - 2 * pad - 4) / 3;
  const cellH = (VB_H - 2 * pad - 4) / 3;
  const items: { x: number; y: number; w: number; h: number }[] = [];
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++)
      items.push({ x: pad + c * (cell + 2), y: pad + r * (cellH + 2), w: cell, h: cellH });
  return (
    <>
      {rects(items)}
      {emphBorder && (
        <rect x={pad - 1} y={pad - 1} width={3 * cell + 4 + 2} height={3 * cellH + 4 + 2}
          fill="none" stroke={STROKE} strokeWidth={1.6} />
      )}
    </>
  );
}

function bmc() {
  // 5 colonnes haut + 2 lignes bas (simplifié Osterwalder)
  const pad = 4;
  const innerW = VB_W - 2 * pad;
  const innerH = VB_H - 2 * pad;
  const topH = innerH * 0.62;
  const botH = innerH - topH - 2;
  const colW = (innerW - 4 * 1.5) / 5;
  const items: { x: number; y: number; w: number; h: number }[] = [];
  for (let i = 0; i < 5; i++) {
    items.push({ x: pad + i * (colW + 1.5), y: pad, w: colW, h: topH });
  }
  const botColW = (innerW - 1.5) / 2;
  items.push({ x: pad, y: pad + topH + 2, w: botColW, h: botH });
  items.push({ x: pad + botColW + 1.5, y: pad + topH + 2, w: botColW, h: botH });
  return rects(items);
}

function porter5() {
  const cx = VB_W / 2;
  const cy = VB_H / 2;
  const r = 20;
  const elems: React.ReactNode[] = [];
  // 4 satellites cardinaux
  const pts = [
    { x: cx, y: cy - r },
    { x: cx + r, y: cy },
    { x: cx, y: cy + r },
    { x: cx - r, y: cy },
  ];
  pts.forEach((p, i) => {
    elems.push(<line key={`l${i}`} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke={STROKE} strokeWidth={SW} />);
    elems.push(<circle key={`s${i}`} cx={p.x} cy={p.y} r={4} fill="white" stroke={STROKE} strokeWidth={SW} />);
  });
  elems.push(<rect key="hub" x={cx - 8} y={cy - 5} width={16} height={10} fill="white" stroke={STROKE} strokeWidth={SW} />);
  return <>{elems}</>;
}

function funnelHorizontal(n: number) {
  const xL = 4, xR = 76;
  const topL = 6, botL = 54, topR = 24, botR = 36;
  const poly = `${xL},${topL} ${xR},${topR} ${xR},${botR} ${xL},${botL}`;
  const divs: React.ReactNode[] = [];
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const x = xL + (xR - xL) * t;
    const yt = topL + (topR - topL) * t;
    const yb = botL + (botR - botL) * t;
    divs.push(<line key={i} x1={x} y1={yt} x2={x} y2={yb} stroke={STROKE} strokeWidth={0.8} opacity={0.6} />);
  }
  return (
    <>
      <polygon points={poly} fill="none" stroke={STROKE} strokeWidth={SW} />
      {divs}
    </>
  );
}

function fishbone(n: number) {
  const top = Math.ceil(n / 2);
  const bot = n - top;
  const elems: React.ReactNode[] = [];
  elems.push(<line key="ax" x1={6} y1={30} x2={60} y2={30} stroke={STROKE} strokeWidth={1.5} />);
  elems.push(<polygon key="tip" points="60,30 55,26 55,34" fill={STROKE} />);
  elems.push(<rect key="head" x={60} y={22} width={16} height={16} rx={2} fill={STROKE} />);
  function anchors(count: number): number[] {
    if (count <= 0) return [];
    if (count === 1) return [30];
    const arr: number[] = [];
    for (let i = 0; i < count; i++) arr.push(12 + ((48 - 12) * i) / (count - 1));
    return arr;
  }
  anchors(top).forEach((ax, i) =>
    elems.push(<line key={`t${i}`} x1={ax} y1={30} x2={ax - 10} y2={14} stroke={STROKE} strokeWidth={1} opacity={0.7} />)
  );
  anchors(bot).forEach((ax, i) =>
    elems.push(<line key={`b${i}`} x1={ax} y1={30} x2={ax - 10} y2={46} stroke={STROKE} strokeWidth={1} opacity={0.7} />)
  );
  return <>{elems}</>;
}



export default function ArchetypeThumbnail({ archetype, status, title, className }: Props) {
  const label = title ?? (archetype ?? "Archétype non attribué");

  if (!archetype || status === "unknown") {
    return (
      <div
        className={
          className ??
          "w-[60px] h-[45px] rounded-full border bg-muted/40 grid place-items-center text-xs text-muted-foreground"
        }
        title={label}
      >
        ?
      </div>
    );
  }

  // linear_sequence_N (N=3..6)
  const linMatch = /^linear_sequence_(\d)$/.exec(archetype);
  if (linMatch) return wrap(linearSequence(parseInt(linMatch[1], 10)), label, className);

  if (archetype === "linear_sequence_grid_7") return wrap(linearGrid(4, 3), label, className);
  if (archetype === "linear_sequence_grid_8") return wrap(linearGrid(4, 4), label, className);

  const pyMatch = /^pyramid_levels_(\d)$/.exec(archetype);
  if (pyMatch) return wrap(pyramid(parseInt(pyMatch[1], 10)), label, className);

  const cyMatch = /^cycle_(\d)$/.exec(archetype);
  if (cyMatch) return wrap(cycle(parseInt(cyMatch[1], 10)), label, className);

  const hubMatch = /^hub_spokes_(\d)$/.exec(archetype);
  if (hubMatch) return wrap(hubSpokes(parseInt(hubMatch[1], 10)), label, className);

  if (archetype === "grid_2x2") return wrap(grid2x2(), label, className);
  if (archetype === "grouped_grid_3x3") return wrap(grid3x3(true), label, className);
  if (archetype === "cadia_canvas") return wrap(grid3x3(false), label, className);
  if (archetype === "bmc_canvas") return wrap(bmc(), label, className);
  if (archetype === "porter5_canvas") return wrap(porter5(), label, className);

  // Fallback : rectangle vide.
  return wrap(<rect x={4} y={4} width={VB_W - 8} height={VB_H - 8} fill="none" stroke={STROKE} strokeWidth={SW} />, label, className);
}
