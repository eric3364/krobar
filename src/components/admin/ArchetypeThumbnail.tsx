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

// === Helpers pour les 19 nouveaux archétypes (LOT3 + m157) ===

function canvasGrid(variant: "lean" | "brandkey") {
  const pad = 4;
  const innerW = VB_W - 2 * pad;
  const innerH = VB_H - 2 * pad;
  const items: { x: number; y: number; w: number; h: number }[] = [];
  if (variant === "lean") {
    const topH = innerH * 0.62;
    const botH = innerH - topH - 2;
    const colW = (innerW - 4 * 1.5) / 5;
    for (let i = 0; i < 5; i++) {
      items.push({ x: pad + i * (colW + 1.5), y: pad, w: colW, h: topH });
    }
    const botColW = (innerW - 1.5) / 2;
    items.push({ x: pad, y: pad + topH + 2, w: botColW, h: botH });
    items.push({ x: pad + botColW + 1.5, y: pad + topH + 2, w: botColW, h: botH });
    return rects(items);
  } else {
    const topH = innerH * 0.42;
    const midH = innerH * 0.18;
    const botH = innerH - topH - midH - 4;
    items.push({ x: pad, y: pad, w: innerW / 2 - 1, h: topH });
    items.push({ x: pad + innerW / 2 + 1, y: pad, w: innerW / 2 - 1, h: topH });
    items.push({ x: pad, y: pad + topH + 2, w: innerW, h: midH });
    items.push({ x: pad, y: pad + topH + midH + 4, w: innerW / 2 - 1, h: botH });
    items.push({ x: pad + innerW / 2 + 1, y: pad + topH + midH + 4, w: innerW / 2 - 1, h: botH });
    const out = rects(items);
    const ex = pad + innerW / 4;
    const ey = pad + topH * 0.25;
    return (
      <>
        {out}
        <rect x={ex} y={ey} width={innerW / 2} height={topH * 0.6}
          fill="white" stroke={STROKE} strokeWidth={1.5} />
      </>
    );
  }
}

function vpcShape() {
  const pad = 4;
  const size = VB_H - 2 * pad;
  return (
    <>
      <rect x={pad} y={pad} width={size} height={size} fill="none" stroke={STROKE} strokeWidth={SW} />
      <circle cx={VB_W - pad - size / 2} cy={VB_H / 2} r={size / 2} fill="none" stroke={STROKE} strokeWidth={SW} />
    </>
  );
}

function tabularGrid(cols: number, rows: number, hasHeader: boolean) {
  const pad = 4;
  const innerW = VB_W - 2 * pad;
  const innerH = VB_H - 2 * pad;
  const headerH = hasHeader ? Math.max(6, innerH * 0.18) : 0;
  const dataH = innerH - headerH;
  const cellW = innerW / cols;
  const cellH = dataH / rows;
  const elems: React.ReactNode[] = [];
  elems.push(<rect key="frame" x={pad} y={pad} width={innerW} height={innerH}
    fill="none" stroke={STROKE} strokeWidth={SW} />);
  if (hasHeader) {
    elems.push(<rect key="hdr" x={pad} y={pad} width={innerW} height={headerH}
      fill={STROKE} stroke={STROKE} strokeWidth={SW} />);
  }
  for (let c = 1; c < cols; c++) {
    const x = pad + c * cellW;
    elems.push(<line key={`v${c}`} x1={x} y1={pad} x2={x} y2={pad + innerH}
      stroke={STROKE} strokeWidth={0.6} />);
  }
  for (let r = 1; r < rows; r++) {
    const y = pad + headerH + r * cellH;
    elems.push(<line key={`h${r}`} x1={pad} y1={y} x2={pad + innerW} y2={y}
      stroke={STROKE} strokeWidth={0.6} />);
  }
  return <>{elems}</>;
}

function empathyMap() {
  const pad = 4;
  const w = (VB_W - 2 * pad - 2) / 2;
  const h = (VB_H - 2 * pad - 2) / 2;
  const cx = VB_W / 2;
  const cy = VB_H / 2;
  return (
    <>
      {rects([
        { x: pad, y: pad, w, h },
        { x: pad + w + 2, y: pad, w, h },
        { x: pad, y: pad + h + 2, w, h },
        { x: pad + w + 2, y: pad + h + 2, w, h },
      ])}
      <circle cx={cx} cy={cy} r={7} fill="white" stroke={STROKE} strokeWidth={1.5} />
    </>
  );
}

function jtbdForces() {
  const cx = VB_W / 2;
  const cy = VB_H / 2;
  const hw = 10;
  const hh = 7;
  return (
    <>
      <defs>
        <marker id="arrJtbd" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill={STROKE} />
        </marker>
      </defs>
      <rect x={cx - hw} y={cy - hh} width={hw * 2} height={hh * 2} fill="none" stroke={STROKE} strokeWidth={1.5} />
      <line x1={6} y1={cy} x2={cx - hw - 2} y2={cy} stroke={STROKE} strokeWidth={SW} markerEnd="url(#arrJtbd)" />
      <line x1={VB_W - 6} y1={cy} x2={cx + hw + 2} y2={cy} stroke={STROKE} strokeWidth={SW} markerEnd="url(#arrJtbd)" />
      <line x1={cx} y1={4} x2={cx} y2={cy - hh - 2} stroke={STROKE} strokeWidth={SW} markerEnd="url(#arrJtbd)" />
      <line x1={cx} y1={VB_H - 4} x2={cx} y2={cy + hh + 2} stroke={STROKE} strokeWidth={SW} markerEnd="url(#arrJtbd)" />
    </>
  );
}

function opportunityTree() {
  const elems: React.ReactNode[] = [];
  const levels = [
    { y: 8, n: 1 },
    { y: 22, n: 3 },
    { y: 38, n: 6 },
    { y: 52, n: 3 },
  ];
  const positions: { x: number; y: number }[][] = [];
  levels.forEach((lvl) => {
    const arr: { x: number; y: number }[] = [];
    const step = (VB_W - 8) / (lvl.n + 1);
    for (let i = 0; i < lvl.n; i++) {
      arr.push({ x: 4 + step * (i + 1), y: lvl.y });
    }
    positions.push(arr);
  });
  for (let l = 0; l < positions.length - 1; l++) {
    const parents = positions[l];
    const children = positions[l + 1];
    children.forEach((c, i) => {
      const parent = parents[Math.floor((i * parents.length) / children.length)];
      elems.push(<line key={`L${l}_${i}`} x1={parent.x} y1={parent.y} x2={c.x} y2={c.y}
        stroke={STROKE} strokeWidth={0.6} />);
    });
  }
  positions.forEach((arr, l) =>
    arr.forEach((p, i) =>
      elems.push(<circle key={`n${l}_${i}`} cx={p.x} cy={p.y} r={2.5} fill="white" stroke={STROKE} strokeWidth={SW} />)
    )
  );
  return <>{elems}</>;
}

function doubleDiamond() {
  const cy = VB_H / 2;
  const p1 = `8,${cy} 24,8 40,${cy} 24,${VB_H - 8}`;
  const p2 = `40,${cy} 56,8 72,${cy} 56,${VB_H - 8}`;
  return (
    <>
      <polygon points={p1} fill="none" stroke={STROKE} strokeWidth={SW} />
      <polygon points={p2} fill="none" stroke={STROKE} strokeWidth={SW} />
    </>
  );
}

function wardleyMap() {
  const pad = 6;
  const elems: React.ReactNode[] = [];
  elems.push(<line key="x" x1={pad} y1={VB_H - pad} x2={VB_W - pad} y2={VB_H - pad}
    stroke={STROKE} strokeWidth={SW} />);
  elems.push(<line key="y" x1={pad} y1={pad} x2={pad} y2={VB_H - pad}
    stroke={STROKE} strokeWidth={SW} />);
  const nodes = [
    { x: 18, y: 14 },
    { x: 32, y: 24 },
    { x: 46, y: 22 },
    { x: 58, y: 36 },
    { x: 68, y: 30 },
  ];
  for (let i = 0; i < nodes.length - 1; i++) {
    elems.push(<line key={`l${i}`} x1={nodes[i].x} y1={nodes[i].y}
      x2={nodes[i + 1].x} y2={nodes[i + 1].y} stroke={STROKE} strokeWidth={0.6} />);
  }
  nodes.forEach((n, i) =>
    elems.push(<circle key={`n${i}`} cx={n.x} cy={n.y} r={2.5} fill="white" stroke={STROKE} strokeWidth={SW} />)
  );
  return <>{elems}</>;
}

function curveComparison() {
  const c1 = "M6,46 Q20,30 36,28 Q52,26 74,12";
  const c2 = "M6,40 Q20,38 36,36 Q52,34 74,30";
  return (
    <>
      <path d={c1} fill="none" stroke={STROKE} strokeWidth={1.2} />
      <path d={c2} fill="none" stroke={STROKE} strokeWidth={1.2} strokeDasharray="3,2" />
    </>
  );
}

function spiralCoil() {
  const cx = VB_W / 2;
  const cy = VB_H / 2;
  const steps = 60;
  const rMax = 22;
  const turns = 3;
  let d = "";
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const angle = t * turns * 2 * Math.PI - Math.PI / 2;
    const r = rMax * t;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    d += i === 0 ? `M${x.toFixed(1)},${y.toFixed(1)}` : ` L${x.toFixed(1)},${y.toFixed(1)}`;
  }
  return <path d={d} fill="none" stroke={STROKE} strokeWidth={SW} />;
}

function onionEllipses() {
  const leftX = 8;
  const cy = VB_H / 2;
  const rxs = [10, 18, 26, 34];
  const rys = [6, 10, 14, 18];
  return (
    <>
      {rxs.map((rx, i) => (
        <ellipse key={i} cx={leftX + rx} cy={cy} rx={rx} ry={rys[i]}
          fill="none" stroke={STROKE} strokeWidth={SW} />
      ))}
    </>
  );
}

function bscCross() {
  const cx = VB_W / 2;
  const cy = VB_H / 2;
  const elems: React.ReactNode[] = [];
  elems.push(<rect key="top" x={cx - 10} y={4} width={20} height={12} fill="none" stroke={STROKE} strokeWidth={SW} />);
  elems.push(<rect key="bot" x={cx - 10} y={VB_H - 16} width={20} height={12} fill="none" stroke={STROKE} strokeWidth={SW} />);
  elems.push(<rect key="lft" x={4} y={cy - 6} width={20} height={12} fill="none" stroke={STROKE} strokeWidth={SW} />);
  elems.push(<rect key="rgt" x={VB_W - 24} y={cy - 6} width={20} height={12} fill="none" stroke={STROKE} strokeWidth={SW} />);
  elems.push(<rect key="center" x={cx - 8} y={cy - 5} width={16} height={10}
    fill="white" stroke={STROKE} strokeWidth={1.5} />);
  elems.push(<line key="ct" x1={cx} y1={16} x2={cx} y2={cy - 5} stroke={STROKE} strokeWidth={0.6} />);
  elems.push(<line key="cb" x1={cx} y1={VB_H - 16} x2={cx} y2={cy + 5} stroke={STROKE} strokeWidth={0.6} />);
  elems.push(<line key="cl" x1={24} y1={cy} x2={cx - 8} y2={cy} stroke={STROKE} strokeWidth={0.6} />);
  elems.push(<line key="cr" x1={VB_W - 24} y1={cy} x2={cx + 8} y2={cy} stroke={STROKE} strokeWidth={0.6} />);
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

// ============ Procedural patterns (8 archetypes) ============

function hubspokeRadial() {
  const cx = 40, cy = 30, r = 6;
  const sat: [number, number][] = [
    [40, 9], [62, 19], [62, 41], [40, 51], [18, 41], [18, 19],
  ];
  return (
    <>
      {sat.map(([x, y], i) => (
        <line key={`l${i}`} x1={cx} y1={cy} x2={x} y2={y} stroke={STROKE} strokeWidth={SW} />
      ))}
      {sat.map(([x, y], i) => (
        <circle key={`s${i}`} cx={x} cy={y} r={3.5} fill="none" stroke={STROKE} strokeWidth={SW} />
      ))}
      <circle cx={cx} cy={cy} r={r} fill="white" stroke={STROKE} strokeWidth={SW} />
    </>
  );
}

function pyramideTranches(n = 4) {
  const apexX = 40, apexY = 6, baseY = 54, halfBase = 30;
  const elems: React.ReactNode[] = [];
  elems.push(
    <polygon key="p" points={`${apexX},${apexY} ${apexX + halfBase},${baseY} ${apexX - halfBase},${baseY}`} fill="none" stroke={STROKE} strokeWidth={SW} />
  );
  for (let i = 1; i < n; i++) {
    const y = apexY + ((baseY - apexY) * i) / n;
    const half = (halfBase * (y - apexY)) / (baseY - apexY);
    elems.push(<line key={`h${i}`} x1={apexX - half} y1={y} x2={apexX + half} y2={y} stroke={STROKE} strokeWidth={SW} />);
  }
  return <>{elems}</>;
}

function escalierAscendant(n = 4) {
  const steps: React.ReactNode[] = [];
  const x0 = 10, y0 = 52, stepW = 15, stepH = 10;
  for (let i = 0; i < n; i++) {
    const x = x0 + i * stepW;
    const h = (i + 1) * stepH;
    steps.push(<rect key={i} x={x} y={y0 - h} width={stepW} height={h} fill="none" stroke={STROKE} strokeWidth={SW} />);
  }
  return <>{steps}</>;
}

function evenementImpact() {
  const cx = 40, cy = 30;
  return (
    <>
      <circle cx={cx} cy={cy} r={22} fill="none" stroke={STROKE} strokeWidth={SW} />
      <circle cx={cx} cy={cy} r={14} fill="none" stroke={STROKE} strokeWidth={SW} />
      <circle cx={cx} cy={cy} r={6} fill="white" stroke={STROKE} strokeWidth={SW} />
    </>
  );
}

function routeSinueuse() {
  return (
    <>
      <path d="M 10 45 Q 30 45 40 30 Q 50 15 70 15" fill="none" stroke={STROKE} strokeWidth={SW} strokeDasharray="2 3" />
      <circle cx={10} cy={45} r={3} fill="white" stroke={STROKE} strokeWidth={SW} />
      <circle cx={40} cy={30} r={3} fill="white" stroke={STROKE} strokeWidth={SW} />
      <circle cx={70} cy={15} r={3} fill="white" stroke={STROKE} strokeWidth={SW} />
    </>
  );
}

function carrefourBinaire() {
  return (
    <>
      <line x1={40} y1={54} x2={40} y2={32} stroke={STROKE} strokeWidth={SW} />
      <line x1={40} y1={32} x2={20} y2={14} stroke={STROKE} strokeWidth={SW} />
      <line x1={40} y1={32} x2={60} y2={14} stroke={STROKE} strokeWidth={SW} />
      <rect x={32} y={54} width={16} height={4} fill="none" stroke={STROKE} strokeWidth={SW} />
      <rect x={10} y={8} width={20} height={8} fill="none" stroke={STROKE} strokeWidth={SW} />
      <rect x={50} y={8} width={20} height={8} fill="none" stroke={STROKE} strokeWidth={SW} />
    </>
  );
}

function constellationMembres() {
  const cx = 40, cy = 30, R = 20;
  const nodes: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const a = (-90 + i * 60) * (Math.PI / 180);
    nodes.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]);
  }
  const edges: React.ReactNode[] = [];
  for (let i = 0; i < 6; i++) {
    const [x1, y1] = nodes[i];
    const [x2, y2] = nodes[(i + 1) % 6];
    edges.push(<line key={`e${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={STROKE} strokeWidth={SW} />);
  }
  edges.push(<line key="d1" x1={nodes[0][0]} y1={nodes[0][1]} x2={nodes[3][0]} y2={nodes[3][1]} stroke={STROKE} strokeWidth={SW} strokeDasharray="2 2" />);
  edges.push(<line key="d2" x1={nodes[1][0]} y1={nodes[1][1]} x2={nodes[4][0]} y2={nodes[4][1]} stroke={STROKE} strokeWidth={SW} strokeDasharray="2 2" />);
  return (
    <>
      {edges}
      {nodes.map(([x, y], i) => (
        <circle key={`n${i}`} cx={x} cy={y} r={3.5} fill="white" stroke={STROKE} strokeWidth={SW} />
      ))}
    </>
  );
}

function conceptManifestations(n = 4) {
  const ccx = 18, ccy = 30;
  const items: React.ReactNode[] = [];
  items.push(<ellipse key="c" cx={ccx} cy={ccy} rx={12} ry={9} fill="white" stroke={STROKE} strokeWidth={SW} />);
  const rightX = 44, bw = 28, bh = 7, gap = 4;
  const total = n * bh + (n - 1) * gap;
  const y0 = ccy - total / 2;
  for (let i = 0; i < n; i++) {
    const by = y0 + i * (bh + gap);
    items.push(<path key={`p${i}`} d={`M ${ccx + 12} ${ccy} Q ${(ccx + rightX) / 2} ${by + bh / 2} ${rightX} ${by + bh / 2}`} fill="none" stroke={STROKE} strokeWidth={SW} />);
    items.push(<rect key={`r${i}`} x={rightX} y={by} width={bw} height={bh} fill="none" stroke={STROKE} strokeWidth={SW} />);
  }
  return <>{items}</>;
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

  const funMatch = /^funnel_horizontal_(\d)$/.exec(archetype);
  if (funMatch) return wrap(funnelHorizontal(parseInt(funMatch[1], 10)), label, className);

  const fishMatch = /^fishbone_(\d)$/.exec(archetype);
  if (fishMatch) return wrap(fishbone(parseInt(fishMatch[1], 10)), label, className);

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

  // === 19 nouveaux archétypes (LOT3 + m157) ===
  if (archetype === "lean_canvas") return wrap(canvasGrid("lean"), label, className);
  if (archetype === "vpc_canvas") return wrap(vpcShape(), label, className);
  if (archetype === "customer_journey_map") return wrap(tabularGrid(5, 4, true), label, className);
  if (archetype === "empathy_map_canvas") return wrap(empathyMap(), label, className);
  if (archetype === "experience_map") return wrap(tabularGrid(5, 4, true), label, className);
  if (archetype === "service_blueprint") return wrap(tabularGrid(5, 5, true), label, className);
  if (archetype === "product_market_fit_canvas") return wrap(pyramid(5), label, className);
  if (archetype === "jobs_to_be_done") return wrap(jtbdForces(), label, className);
  if (archetype === "opportunity_solution_tree") return wrap(opportunityTree(), label, className);
  if (archetype === "double_diamond") return wrap(doubleDiamond(), label, className);
  if (archetype === "wardley_map") return wrap(wardleyMap(), label, className);
  if (archetype === "curve_comparison_n") return wrap(curveComparison(), label, className);
  if (archetype === "spiral_n") return wrap(spiralCoil(), label, className);
  if (archetype === "brand_key_canvas") return wrap(canvasGrid("brandkey"), label, className);
  if (archetype === "brand_onion_canvas") return wrap(onionEllipses(), label, className);
  if (archetype === "kapferer_prism") return wrap(tabularGrid(2, 3, false), label, className);
  if (archetype === "amdec_table") return wrap(tabularGrid(9, 4, true), label, className);
  if (archetype === "design_system_matrix") return wrap(tabularGrid(5, 5, true), label, className);
  if (archetype === "balanced_scorecard_canvas") return wrap(bscCross(), label, className);

  // === 8 procedural patterns (cardinalité variable) ===
  const hubRadialMatch = /^hubspoke_radial(?:_\d+)?$/.exec(archetype);
  if (hubRadialMatch) return wrap(hubspokeRadial(), label, className);

  const pyrTrMatch = /^pyramide_n_tranches(?:_(\d+))?$/.exec(archetype);
  if (pyrTrMatch) return wrap(pyramideTranches(pyrTrMatch[1] ? parseInt(pyrTrMatch[1], 10) : 4), label, className);

  const escMatch = /^escalier_ascendant(?:_(\d+))?$/.exec(archetype);
  if (escMatch) return wrap(escalierAscendant(escMatch[1] ? parseInt(escMatch[1], 10) : 4), label, className);

  const evMatch = /^evenement_impact(?:_\d+)?$/.exec(archetype);
  if (evMatch) return wrap(evenementImpact(), label, className);

  const routeMatch = /^route_sinueuse(?:_\d+)?$/.exec(archetype);
  if (routeMatch) return wrap(routeSinueuse(), label, className);

  if (archetype === "carrefour_binaire") return wrap(carrefourBinaire(), label, className);

  const constMatch = /^constellation_n_membres(?:_\d+)?$/.exec(archetype);
  if (constMatch) return wrap(constellationMembres(), label, className);

  const cmMatch = /^concept_manifestations_n(?:_(\d+))?$/.exec(archetype);
  if (cmMatch) return wrap(conceptManifestations(cmMatch[1] ? parseInt(cmMatch[1], 10) : 4), label, className);





  // Fallback : rectangle vide.
  return wrap(<rect x={4} y={4} width={VB_W - 8} height={VB_H - 8} fill="none" stroke={STROKE} strokeWidth={SW} />, label, className);
}
