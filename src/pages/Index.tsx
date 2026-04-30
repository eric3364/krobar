import { useEffect, useMemo, useRef, useState } from "react";
import { palettes, paletteLabels, type Palette } from "@/palettes";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Download, Sparkles, RefreshCw, FlaskConical } from "lucide-react";
import TestSuiteView from "@/components/TestSuiteView";
import CustomizePanel, { loadStoredDetailLevel, type DetailLevel } from "@/components/CustomizePanel";
import EditableSlot from "@/components/EditableSlot";
import IconPicker from "@/components/IconPicker";
import MovableSlotOverlay from "@/components/MovableSlotOverlay";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { formatScorePct, normalizeScore } from "@/lib/kroki";
import { analyzeText } from "@/lib/api";

type ManifestTemplate = {
  id: string;
  name: string;
  category: string;
  description: string;
  file: string;
  slots: string[];
  best_for: string;
};

type Manifest = { templates: ManifestTemplate[] };

type Suggestion = {
  template_id: string;
  score: number;
  reasoning: string;
  slots: Record<string, string>;
};

// Plus de clé API côté client : la communication avec Claude passe par le backend.

function applyPaletteVars(el: SVGElement, palette: Palette) {
  const c = palette.colors;
  el.style.setProperty("--primary", c.primary);
  el.style.setProperty("--accent", c.accent);
  el.style.setProperty("--bg", c.bg);
  el.style.setProperty("--text", c.text);
  el.style.setProperty("--muted", c.muted);
  el.style.setProperty("--surface", c.surface);
  el.style.setProperty("--border", c.border);
}

// Wrappe un texte en plusieurs <tspan> à l'intérieur d'un <text> SVG en
// se basant sur les attributs data-wrap-* présents sur l'élément (mêmes
// règles que src/lib/kroki.ts pour rester cohérent entre vignettes et aperçu).
function wrapTextIntoTspans(
  el: SVGElement,
  text: string,
  x: number,
  maxChars: number,
  maxLines: number,
  dy: number,
) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const cand = cur ? cur + " " + w : w;
    if (cand.length <= maxChars) {
      cur = cand;
    } else {
      if (cur) lines.push(cur);
      cur = w;
      if (lines.length >= maxLines) break;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length > maxLines) lines.length = maxLines;
  const joined = lines.join(" ");
  if (joined.length < text.replace(/\s+/g, " ").trim().length && lines.length > 0) {
    const last = lines[lines.length - 1];
    lines[lines.length - 1] =
      (last.length > maxChars - 3 ? last.slice(0, maxChars - 3) : last) + "…";
  }
  while (el.firstChild) el.removeChild(el.firstChild);
  const SVG_NS = "http://www.w3.org/2000/svg";
  lines.forEach((line, i) => {
    const tspan = document.createElementNS(SVG_NS, "tspan");
    tspan.setAttribute("x", String(x));
    tspan.setAttribute("dy", i === 0 ? "0" : String(dy));
    tspan.textContent = line;
    el.appendChild(tspan);
  });
}

function fillSlots(svg: SVGElement, slots: Record<string, string>) {
  Object.entries(slots).forEach(([k, v]) => {
    const el = svg.querySelector(`[data-slot="${k}"]`) as HTMLElement | SVGElement | null;
    if (!el) return;
    // Texte SVG avec metadata de wrap → multi-lignes via tspans (évite le
    // dépassement hors des cartes pour process_3_steps, etc.).
    if (el instanceof SVGElement && el.hasAttribute("data-wrap-max")) {
      const x = parseFloat(el.getAttribute("data-wrap-x") || "0");
      const maxChars = parseInt(el.getAttribute("data-wrap-max") || "22", 10);
      const maxLines = parseInt(el.getAttribute("data-wrap-lines") || "3", 10);
      const dy = parseFloat(el.getAttribute("data-wrap-dy") || "18");
      wrapTextIntoTspans(el, v ?? "", x, maxChars, maxLines, dy);
      return;
    }
    el.textContent = v;
    // Fallback : si malgré la contrainte le slot dépasse 35 caractères, réduire la police.
    if (v && v.length > 35 && el instanceof HTMLElement) {
      el.style.fontSize = "11px";
    }
  });

  // Post-processing spécifique au donut : recalcul des arcs + repositionnement des labels %.
  if (svg.getAttribute("data-template") === "donut_4_parts") {
    applyDonutPercentages(svg, slots);
  }
  // Post-processing spécifique au stacked bar : recalcul des largeurs/positions des segments + labels.
  if (svg.getAttribute("data-template") === "stacked_bar") {
    applyStackedBarPercentages(svg, slots);
  }
}

// Helper commun : parse "42", "42%", "42,5" → number ; valeur invalide → fallback.
function parsePctValue(raw: string | undefined, fallback = 25): number {
  if (!raw) return fallback;
  const n = parseFloat(String(raw).replace("%", "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

// Stacked bar (largeur 510 à x=40, h=120 à y=240).
// Segments paramétrés via segment_N_percent ; labels repositionnés au centre.
function applyStackedBarPercentages(svg: SVGElement, slots: Record<string, string>) {
  const X0 = 40;
  const TOTAL_W = 510;
  const Y = 240;
  const H = 120;

  const pcts = [1, 2, 3, 4].map((i) => parsePctValue(slots[`segment_${i}_percent`]));
  const sum = pcts.reduce((a, b) => a + b, 0) || 1;
  const norm = pcts.map((p) => (p / sum) * 100);

  let cursor = X0;
  norm.forEach((pct, idx) => {
    const w = (pct / 100) * TOTAL_W;
    const seg = svg.querySelector(`[data-slot="seg_${idx + 1}"]`) as SVGRectElement | null;
    if (seg) {
      seg.setAttribute("x", String(cursor));
      seg.setAttribute("y", String(Y));
      seg.setAttribute("width", String(w));
      seg.setAttribute("height", String(H));
    }

    const labelFO = svg.querySelector(
      `foreignObject[data-slot-pos="segment_${idx + 1}_percent"]`
    ) as SVGForeignObjectElement | null;
    if (labelFO) {
      const lw = parseFloat(labelFO.getAttribute("width") || "82");
      const lh = parseFloat(labelFO.getAttribute("height") || "32");
      labelFO.setAttribute("x", String(cursor + w / 2 - lw / 2));
      labelFO.setAttribute("y", String(Y + H / 2 - lh / 2));
      // Cache si segment trop étroit pour le label.
      labelFO.setAttribute("opacity", w < lw * 0.55 ? "0" : "1");
    }

    cursor += w;
  });
}

// Calcule les stroke-dasharray/offset des 4 arcs du donut à partir
// des slots percent_1..percent_4, et place chaque label de % au centre
// angulaire de son segment. Les valeurs non numériques retombent à 25.
function applyDonutPercentages(svg: SVGElement, slots: Record<string, string>) {
  const parsePct = (raw: string | undefined): number => {
    if (!raw) return 25;
    const n = parseFloat(String(raw).replace("%", "").replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : 25;
  };

  const pcts = [1, 2, 3, 4].map((i) => parsePct(slots[`percent_${i}`]));
  const sum = pcts.reduce((a, b) => a + b, 0) || 1;
  const norm = pcts.map((p) => (p / sum) * 100);

  // r=130 dans le SVG → C ≈ 816.81
  const C = 2 * Math.PI * 130;
  let cumulative = 0;

  norm.forEach((pct, idx) => {
    const arc = svg.querySelector(`[data-slot="arc_${idx + 1}"]`) as SVGCircleElement | null;
    const len = (pct / 100) * C;
    if (arc) {
      arc.setAttribute("stroke-dasharray", `${len.toFixed(2)} ${(C - len).toFixed(2)}`);
      arc.setAttribute("stroke-dashoffset", `${(-(cumulative / 100) * C).toFixed(2)}`);
    }

    // Centre angulaire du segment (12h = -PI/2, sens horaire).
    const midPct = cumulative + pct / 2;
    const angle = (midPct / 100) * 2 * Math.PI - Math.PI / 2;
    const labelR = 130;
    const cx = 260 + labelR * Math.cos(angle);
    const cy = 340 + labelR * Math.sin(angle);

    const labelFO = svg.querySelector(
      `foreignObject[data-slot-pos="percent_${idx + 1}"]`
    ) as SVGForeignObjectElement | null;
    if (labelFO) {
      const w = parseFloat(labelFO.getAttribute("width") || "80");
      const h = parseFloat(labelFO.getAttribute("height") || "34");
      labelFO.setAttribute("x", String(cx - w / 2));
      labelFO.setAttribute("y", String(cy - h / 2));
      labelFO.setAttribute("opacity", pct < 4 ? "0" : "1");
    }

    cumulative += pct;
  });
}

// SVG chargé en statique depuis /templates/ (servi par nginx).
async function loadSvg(file: string): Promise<SVGElement> {
  const res = await fetch(`/templates/${file}`);
  const txt = await res.text();
  const doc = new DOMParser().parseFromString(txt, "image/svg+xml");
  return doc.documentElement as unknown as SVGElement;
}

function svgToString(svg: SVGElement): string {
  return new XMLSerializer().serializeToString(svg);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const Index = () => {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [text, setText] = useState("");
  const [paletteKey, setPaletteKey] = useState<keyof typeof palettes>("ocean");
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [testSuiteOpen, setTestSuiteOpen] = useState(false);
  const [detailLevel, setDetailLevel] = useState<DetailLevel>(() => loadStoredDetailLevel());

  const previewRef = useRef<HTMLDivElement>(null);
  const thumbRefs = useRef<(HTMLDivElement | null)[]>([]);

  // In-place editing state
  type TextEdit = {
    kind: "text";
    slotKey: string;
    value: string;
    rect: { left: number; top: number; width: number; height: number };
    fontStyle: {
      fontFamily?: string;
      fontSize?: string;
      fontWeight?: string;
      color?: string;
      textAlign?: string;
    };
  };
  type IconEdit = {
    kind: "icon";
    slotKey: string;
    value: string;
    anchor: { left: number; top: number };
  };
  const [edit, setEdit] = useState<TextEdit | IconEdit | null>(null);
  const [slotOverrides, setSlotOverrides] = useState<Record<string, string>>({});
  // Per-slot translation in SVG user units, persisted on the rendered element
  // and serialized into the SVG export.
  const [slotTransforms, setSlotTransforms] = useState<
    Record<string, { dx: number; dy: number; sx?: number; sy?: number }>
  >({});
  // Currently selected (single-clicked) slot key for moving.
  const [selectedSlotKey, setSelectedSlotKey] = useState<string | null>(null);
  const [selectedRect, setSelectedRect] = useState<
    { left: number; top: number; width: number; height: number } | null
  >(null);
  // Snapshot of selectedRect at pointerdown — used to compute live overlay
  // position from the cumulative pointer delta without drift.
  const dragStartRectRef = useRef<
    { left: number; top: number; width: number; height: number } | null
  >(null);

  // Undo history: snapshots of (slotTransforms, slotOverrides) taken
  // BEFORE each user mutation (drag commit, resize commit, text/icon edit).
  // CMD/Ctrl+Z pops the latest snapshot and restores it.
  type HistorySnapshot = {
    slotTransforms: Record<string, { dx: number; dy: number; sx?: number; sy?: number }>;
    slotOverrides: Record<string, string>;
  };
  const historyRef = useRef<HistorySnapshot[]>([]);
  const slotTransformsRef = useRef(slotTransforms);
  const slotOverridesRef = useRef(slotOverrides);
  useEffect(() => {
    slotTransformsRef.current = slotTransforms;
  }, [slotTransforms]);
  useEffect(() => {
    slotOverridesRef.current = slotOverrides;
  }, [slotOverrides]);

  const pushHistory = () => {
    historyRef.current.push({
      slotTransforms: { ...slotTransformsRef.current },
      slotOverrides: { ...slotOverridesRef.current },
    });
    // Cap history to avoid unbounded growth.
    if (historyRef.current.length > 100) {
      historyRef.current.shift();
    }
  };

  const undo = () => {
    const snap = historyRef.current.pop();
    if (!snap) {
      toast.info("Rien à annuler");
      return;
    }
    setSlotTransforms(snap.slotTransforms);
    setSlotOverrides(snap.slotOverrides);
    setSelectedSlotKey(null);
    setSelectedRect(null);
    setEdit(null);
  };

  // Global keyboard shortcut: CMD/Ctrl+Z → undo last move/resize/edit.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isUndo = (e.metaKey || e.ctrlKey) && !e.shiftKey && (e.key === "z" || e.key === "Z");
      if (!isUndo) return;
      // Don't hijack undo inside form fields (textarea, input, contenteditable).
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName?.toLowerCase();
      if (tag === "textarea" || tag === "input" || t?.isContentEditable) return;
      e.preventDefault();
      undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    fetch("/templates/manifest.json")
      .then((r) => r.json())
      .then(setManifest);
  }, []);

  const palette = palettes[paletteKey];

  const selectedSuggestion = selectedIdx !== null ? suggestions[selectedIdx] : null;
  const selectedTemplate = useMemo(
    () =>
      selectedSuggestion && manifest
        ? manifest.templates.find((t) => t.id === selectedSuggestion.template_id) ?? null
        : null,
    [selectedSuggestion, manifest]
  );

  // Render thumbnails when suggestions change
  useEffect(() => {
    if (!manifest) return;
    suggestions.forEach(async (sug, i) => {
      const tpl = manifest.templates.find((t) => t.id === sug.template_id);
      const node = thumbRefs.current[i];
      if (!tpl || !node) return;
      const svg = await loadSvg(tpl.file);
      applyPaletteVars(svg, palette);
      fillSlots(svg, sug.slots);
      svg.setAttribute("width", "100%");
      svg.setAttribute("height", "100%");
      node.innerHTML = "";
      node.appendChild(svg);
    });
  }, [suggestions, manifest, palette]);

  // Reset per-edit overrides whenever the chosen suggestion changes
  useEffect(() => {
    setSlotOverrides({});
    setSlotTransforms({});
    setSelectedSlotKey(null);
    setSelectedRect(null);
    setEdit(null);
    historyRef.current = [];
  }, [selectedSuggestion]);

  // Merge AI slots with user-edited overrides
  const effectiveSlots = useMemo(
    () => ({ ...(selectedSuggestion?.slots ?? {}), ...slotOverrides }),
    [selectedSuggestion, slotOverrides]
  );

  // Get the element we should apply move/scale transforms to (foreignObject for HTML slots).
  const getMovable = (slotEl: Element): SVGGraphicsElement | null => {
    const fo = slotEl.closest("foreignObject") as SVGForeignObjectElement | null;
    return (fo ?? (slotEl as unknown as SVGGraphicsElement)) || null;
  };

  const isWrapTextEl = (el: Element | null): el is SVGTextElement =>
    !!el && el.tagName.toLowerCase() === "text" && el.hasAttribute("data-wrap-max");

  // Promote a plain SVG <text> into a wrap-capable text element so resize can
  // re-flow it instead of scaling glyphs (which would visibly grow the font).
  const promoteTextToWrap = (textEl: SVGTextElement) => {
    if (textEl.hasAttribute("data-wrap-max")) return;
    const prev = textEl.getAttribute("transform");
    if (prev) textEl.removeAttribute("transform");
    const b = textEl.getBBox();
    if (prev) textEl.setAttribute("transform", prev);
    const fontSizePx =
      parseFloat(window.getComputedStyle(textEl).fontSize || "14") || 14;
    // Average glyph advance ≈ 0.55 em for proportional fonts.
    const avgChar = Math.max(4, fontSizePx * 0.55);
    const text = textEl.textContent || "";
    const maxChars =
      Math.max(4, Math.round(b.width / avgChar)) || text.length || 8;
    const lineHeight = Math.max(fontSizePx * 1.2, fontSizePx + 2);
    const lines = Math.max(1, Math.round(b.height / lineHeight)) || 1;
    const xAttr = textEl.getAttribute("x");
    const wrapX = xAttr != null ? parseFloat(xAttr) : b.x;
    textEl.setAttribute("data-wrap-x", String(wrapX));
    textEl.setAttribute("data-wrap-max", String(maxChars));
    textEl.setAttribute("data-wrap-lines", String(lines));
    textEl.setAttribute("data-wrap-dy", String(lineHeight));
    textEl.setAttribute("data-orig-wrap-max", String(maxChars));
    textEl.setAttribute("data-orig-wrap-lines", String(lines));
  };

  const captureWrapTextOriginalBox = (textEl: SVGTextElement) => {
    if (!textEl.hasAttribute("data-krobar-orig-box-w")) {
      const prev = textEl.getAttribute("transform");
      if (prev) textEl.removeAttribute("transform");
      const b = textEl.getBBox();
      if (prev) textEl.setAttribute("transform", prev);
      textEl.setAttribute("data-krobar-orig-box-x", String(b.x));
      textEl.setAttribute("data-krobar-orig-box-y", String(b.y));
      textEl.setAttribute("data-krobar-orig-box-w", String(b.width));
      textEl.setAttribute("data-krobar-orig-box-h", String(b.height));
    }

    return {
      x: parseFloat(textEl.getAttribute("data-krobar-orig-box-x") || "0"),
      y: parseFloat(textEl.getAttribute("data-krobar-orig-box-y") || "0"),
      w: parseFloat(textEl.getAttribute("data-krobar-orig-box-w") || "0"),
      h: parseFloat(textEl.getAttribute("data-krobar-orig-box-h") || "0"),
    };
  };

  const localRectToViewportRect = (
    slotEl: Element,
    localRect: { x: number; y: number; w: number; h: number }
  ) => {
    const svgEl = slotEl.closest("svg") as SVGSVGElement | null;
    if (!svgEl) {
      const rect = (getMovable(slotEl) ?? slotEl).getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        right: rect.right,
        bottom: rect.bottom,
      };
    }

    const viewBox = svgEl.viewBox.baseVal;
    const renderedRect = svgEl.getBoundingClientRect();
    if (!renderedRect.width || !renderedRect.height || !viewBox.width || !viewBox.height) {
      const rect = (getMovable(slotEl) ?? slotEl).getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        right: rect.right,
        bottom: rect.bottom,
      };
    }

    const scaleX = renderedRect.width / viewBox.width;
    const scaleY = renderedRect.height / viewBox.height;
    const left = renderedRect.left + (localRect.x - viewBox.x) * scaleX;
    const top = renderedRect.top + (localRect.y - viewBox.y) * scaleY;
    const width = localRect.w * scaleX;
    const height = localRect.h * scaleY;

    return {
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
    };
  };

  const getMovableViewportRect = (slotEl: Element) => {
    const movable = getMovable(slotEl);
    if (movable && isWrapTextEl(movable)) {
      const slotKey = slotEl.getAttribute("data-slot") || "";
      const t = slotKey ? slotTransforms[slotKey] ?? { dx: 0, dy: 0, sx: 1, sy: 1 } : { dx: 0, dy: 0, sx: 1, sy: 1 };
      const bb = captureWrapTextOriginalBox(movable);
      return localRectToViewportRect(slotEl, {
        x: bb.x + t.dx,
        y: bb.y + t.dy,
        w: bb.w * (t.sx ?? 1),
        h: bb.h * (t.sy ?? 1),
      });
    }
    const rect = (movable ?? slotEl).getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      right: rect.right,
      bottom: rect.bottom,
    };
  };

  // Local-space bbox of the movable element (without our transform applied).
  const getLocalBBox = (el: SVGGraphicsElement): { x: number; y: number; w: number; h: number } => {
    if (el.tagName.toLowerCase() === "foreignobject") {
      const fo = el as unknown as SVGForeignObjectElement;
      // IMPORTANT: use the ORIGINAL x/y/w/h captured before any drag/resize.
      // Reading the live attributes here would make the bbox grow each frame
      // (because we mutate width/height during resize), which makes anchoring
      // math diverge and the SE handle feel "stuck".
      captureOriginals(fo);
      const x = parseFloat(
        fo.getAttribute("data-krobar-orig-x") ?? fo.getAttribute("x") ?? "0"
      );
      const y = parseFloat(
        fo.getAttribute("data-krobar-orig-y") ?? fo.getAttribute("y") ?? "0"
      );
      const w = parseFloat(
        fo.getAttribute("data-krobar-orig-w") ?? fo.getAttribute("width") ?? "0"
      );
      const h = parseFloat(
        fo.getAttribute("data-krobar-orig-h") ?? fo.getAttribute("height") ?? "0"
      );
      return { x, y, w, h };
    }
    if (isWrapTextEl(el)) {
      return captureWrapTextOriginalBox(el);
    }
    // Temporarily clear our transform to get an unaffected bbox.
    const prev = el.getAttribute("transform");
    if (prev) el.removeAttribute("transform");
    const b = el.getBBox();
    if (prev) el.setAttribute("transform", prev);
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  };

  // Build a transform string that translates by (dx,dy) and scales (sx,sy)
  // around the given anchor in local coordinates.
  const buildTransform = (
    dx: number,
    dy: number,
    sx: number,
    sy: number,
    ax: number,
    ay: number
  ) => {
    // T(dx,dy) * T(ax,ay) * S(sx,sy) * T(-ax,-ay)
    return `translate(${dx} ${dy}) translate(${ax} ${ay}) scale(${sx} ${sy}) translate(${-ax} ${-ay})`;
  };

  // For foreignObject slots, scaling via SVG transform deforms glyphs. Instead,
  // we resize the foreignObject's width/height and proportionally adjust the
  // font-size of inner elements. We capture the originals once on the element
  // via data-* attributes so repeated resizes stay accurate.
  const captureOriginals = (fo: SVGForeignObjectElement) => {
    if (!fo.hasAttribute("data-krobar-orig-w")) {
      fo.setAttribute("data-krobar-orig-w", fo.getAttribute("width") || "0");
      fo.setAttribute("data-krobar-orig-h", fo.getAttribute("height") || "0");
    }
    if (!fo.hasAttribute("data-krobar-orig-x")) {
      fo.setAttribute("data-krobar-orig-x", fo.getAttribute("x") || "0");
      fo.setAttribute("data-krobar-orig-y", fo.getAttribute("y") || "0");
    }
    // Capture font-size on every text-bearing descendant.
    const nodes = fo.querySelectorAll<HTMLElement>("*");
    const all: HTMLElement[] = [fo.firstElementChild as HTMLElement, ...Array.from(nodes)].filter(
      Boolean
    ) as HTMLElement[];
    all.forEach((node) => {
      if (!node.dataset) return;
      if (node.dataset.krobarOrigFs == null) {
        const fs = window.getComputedStyle(node).fontSize;
        if (fs) node.dataset.krobarOrigFs = fs;
      }
    });
  };

  const applyForeignObjectScale = (fo: SVGForeignObjectElement, sx: number, sy: number) => {
    captureOriginals(fo);
    const ow = parseFloat(fo.getAttribute("data-krobar-orig-w") || "0");
    const oh = parseFloat(fo.getAttribute("data-krobar-orig-h") || "0");
    if (ow > 0) fo.setAttribute("width", String(ow * sx));
    if (oh > 0) fo.setAttribute("height", String(oh * sy));
    // NOTE: on NE modifie PAS la taille de la police lors d'un redimensionnement.
    // Le HTML embarqué doit utiliser word-wrap/overflow-wrap pour que le texte
    // se réajuste naturellement. On force ces propriétés sur le 1er enfant et
    // on s'assure qu'il occupe 100% du foreignObject (sinon le bloc grandit
    // sans que le texte ne re-wrappe).
    const nodes = fo.querySelectorAll<HTMLElement>("*");
    const all: HTMLElement[] = [fo.firstElementChild as HTMLElement, ...Array.from(nodes)].filter(
      Boolean
    ) as HTMLElement[];
    all.forEach((node) => {
      if (node.style && node.style.fontSize) node.style.fontSize = "";
    });
    const root = fo.firstElementChild as HTMLElement | null;
    if (root && root.style) {
      root.style.width = "100%";
      root.style.height = "100%";
      root.style.boxSizing = "border-box";
      root.style.wordWrap = "break-word";
      root.style.overflowWrap = "break-word";
      root.style.whiteSpace = "normal";
      root.style.overflow = "hidden";
    }
  };

  // Apply translation (+ optional scale) transforms to slot elements (idempotent).
  const applyTransforms = (
    svg: SVGElement,
    transforms: Record<string, { dx: number; dy: number; sx?: number; sy?: number }>
  ) => {
    svg.querySelectorAll("[data-slot][data-krobar-moved='1']").forEach((el) => {
      el.removeAttribute("transform");
      el.removeAttribute("data-krobar-moved");
      // Reset foreignObject size/pos/font tweaks if any.
      if (el.tagName.toLowerCase() === "foreignobject") {
        const fo = el as unknown as SVGForeignObjectElement;
        const ox = fo.getAttribute("data-krobar-orig-x");
        const oy = fo.getAttribute("data-krobar-orig-y");
        const ow = fo.getAttribute("data-krobar-orig-w");
        const oh = fo.getAttribute("data-krobar-orig-h");
        if (ox) fo.setAttribute("x", ox);
        if (oy) fo.setAttribute("y", oy);
        if (ow) fo.setAttribute("width", ow);
        if (oh) fo.setAttribute("height", oh);
        fo.querySelectorAll<HTMLElement>("*").forEach((n) => {
          if (n.dataset?.krobarOrigFs) n.style.fontSize = "";
        });
        const first = fo.firstElementChild as HTMLElement | null;
        if (first?.dataset?.krobarOrigFs) first.style.fontSize = "";
      }
      // Restaure les paramètres de wrap d'origine sur un <text data-wrap-max>
      // (ils seront ré-appliqués par applyTransforms si sx/sy ≠ 1).
      if (
        el.tagName.toLowerCase() === "text" &&
        el.hasAttribute("data-orig-wrap-max")
      ) {
        const om = el.getAttribute("data-orig-wrap-max");
        const ol = el.getAttribute("data-orig-wrap-lines");
        if (om) el.setAttribute("data-wrap-max", om);
        if (ol) el.setAttribute("data-wrap-lines", ol);
      }
    });
    Object.entries(transforms).forEach(([key, t]) => {
      const slotEl = svg.querySelector(`[data-slot="${key}"]`) as Element | null;
      if (!slotEl) return;
      const el = getMovable(slotEl);
      if (!el) return;
      const sx = t.sx ?? 1;
      const sy = t.sy ?? 1;
      const isFO = el.tagName.toLowerCase() === "foreignobject";
      if (isFO) {
        // Translate via x/y attribute (transform on <foreignObject> doesn't
        // reliably move the embedded HTML in all browsers). Resize via
        // width/height + font-size.
        const fo = el as unknown as SVGForeignObjectElement;
        captureOriginals(fo);
        const ox = parseFloat(fo.getAttribute("data-krobar-orig-x") || "0");
        const oy = parseFloat(fo.getAttribute("data-krobar-orig-y") || "0");
        fo.setAttribute("x", String(ox + t.dx));
        fo.setAttribute("y", String(oy + t.dy));
        if (sx !== 1 || sy !== 1) {
          applyForeignObjectScale(fo, sx, sy);
        }
      } else if (sx === 1 && sy === 1) {
        el.setAttribute("transform", `translate(${t.dx} ${t.dy})`);
      } else if (isWrapTextEl(el)) {
        // Texte SVG avec wrap : on N'utilise PAS scale() (qui déforme les
        // glyphes). À la place, on ajuste la largeur de wrap (en caractères)
        // et le nombre de lignes max proportionnellement à sx/sy, puis on
        // re-wrappe le contenu avec la même police d'origine.
        const textEl = el as SVGTextElement;
        const box = captureWrapTextOriginalBox(textEl);
        if (!textEl.hasAttribute("data-orig-wrap-max")) {
          textEl.setAttribute(
            "data-orig-wrap-max",
            textEl.getAttribute("data-wrap-max") || "22"
          );
          textEl.setAttribute(
            "data-orig-wrap-lines",
            textEl.getAttribute("data-wrap-lines") || "3"
          );
        }
        const origMax = parseInt(textEl.getAttribute("data-orig-wrap-max") || "22", 10);
        const origLines = parseInt(textEl.getAttribute("data-orig-wrap-lines") || "3", 10);
        const newMax = Math.max(4, Math.round(origMax * sx));
        const lineHeight = parseFloat(textEl.getAttribute("data-wrap-dy") || "18");
        const newLines = Math.max(1, Math.round((box.h * sy) / Math.max(lineHeight, 1)));
        textEl.setAttribute("data-wrap-max", String(newMax));
        textEl.setAttribute("data-wrap-lines", String(newLines));
        const wrapX = parseFloat(textEl.getAttribute("data-wrap-x") || "0");
        const wrapDy = lineHeight;
        const fullText =
          (effectiveSlots as Record<string, string>)[key] ??
          textEl.textContent ??
          "";
        wrapTextIntoTspans(textEl, fullText, wrapX, newMax, newLines, wrapDy);
        el.setAttribute("transform", `translate(${t.dx} ${t.dy})`);
      } else {
        const bb = getLocalBBox(el);
        el.setAttribute("transform", buildTransform(t.dx, t.dy, sx, sy, bb.x, bb.y));
      }
      el.setAttribute("data-krobar-moved", "1");
    });
  };

  // Render big preview
  useEffect(() => {
    if (!selectedSuggestion || !selectedTemplate || !previewRef.current) return;
    (async () => {
      const svg = await loadSvg(selectedTemplate.file);
      applyPaletteVars(svg, palette);
      fillSlots(svg, effectiveSlots);
      applyTransforms(svg, slotTransforms);
      svg.setAttribute("width", "100%");
      svg.setAttribute("height", "100%");
      previewRef.current!.innerHTML = "";
      previewRef.current!.appendChild(svg);
      // Re-measure currently selected slot, if any, after re-render.
      if (selectedSlotKey) {
        const el = svg.querySelector(`[data-slot="${selectedSlotKey}"]`) as Element | null;
        if (el) {
          setSelectedRect(getMovableViewportRect(el));
        }
      }
    })();
  }, [selectedSuggestion, selectedTemplate, palette, effectiveSlots, slotTransforms]);

  // Convertit un delta viewport (px CSS) en unités SVG en se basant sur le viewBox
  // et la taille affichée réelle du SVG. Compatible avec les slots dans foreignObject.
  const viewportDeltaToSvgUnits = (slotEl: Element, dx: number, dy: number) => {
    const svgEl = slotEl.closest("svg") as SVGSVGElement | null;
    if (!svgEl) return { dx, dy };
    const viewBox = svgEl.viewBox.baseVal;
    const renderedRect = svgEl.getBoundingClientRect();
    if (!renderedRect.width || !renderedRect.height) return { dx, dy };

    const scaleX = viewBox && viewBox.width ? viewBox.width / renderedRect.width : 1;
    const scaleY = viewBox && viewBox.height ? viewBox.height / renderedRect.height : 1;

    return { dx: dx * scaleX, dy: dy * scaleY };
  };

  const openEditorForSlot = (slotKey: string) => {
    if (!previewRef.current) return;
    const slotEl = previewRef.current.querySelector(`[data-slot="${slotKey}"]`) as Element | null;
    if (!slotEl) return;

    setSelectedSlotKey(null);
    setSelectedRect(null);

    const rect = getMovableViewportRect(slotEl);
    const tag = slotEl.tagName.toLowerCase();
    const isIcon =
      tag === "image" ||
      tag === "use" ||
      slotEl.getAttribute("data-slot-kind") === "icon";

    if (isIcon) {
      setEdit({
        kind: "icon",
        slotKey,
        value: effectiveSlots[slotKey] ?? "",
        anchor: { left: rect.left, top: rect.bottom + 4 },
      });
      return;
    }

    const computed = window.getComputedStyle(slotEl as Element);
    let styleSource: CSSStyleDeclaration = computed;
    if (tag === "foreignobject") {
      const inner = slotEl.querySelector("[data-slot]") || slotEl.firstElementChild;
      if (inner) styleSource = window.getComputedStyle(inner as Element);
    }

    setEdit({
      kind: "text",
      slotKey,
      value: effectiveSlots[slotKey] ?? slotEl.textContent ?? "",
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      fontStyle: {
        fontFamily: styleSource.fontFamily,
        fontSize: styleSource.fontSize,
        fontWeight: styleSource.fontWeight,
        color: styleSource.color,
        textAlign: styleSource.textAlign,
      },
    });
  };

  // Click + double-click delegation on the preview SVG.
  useEffect(() => {
    const container = previewRef.current;
    if (!container) return;

    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target) return;
      const slotEl = target.closest("[data-slot]") as Element | null;
      if (!slotEl || !container.contains(slotEl)) {
        // Click outside any slot deselects
        setSelectedSlotKey(null);
        setSelectedRect(null);
        return;
      }
      const slotKey = slotEl.getAttribute("data-slot") || "";
      if (!slotKey) return;
      e.preventDefault();
      e.stopPropagation();
      setSelectedSlotKey(slotKey);
      setSelectedRect(getMovableViewportRect(slotEl));
    };

    const onDblClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target) return;
      const slotEl = target.closest("[data-slot]") as Element | null;
      if (!slotEl || !container.contains(slotEl)) return;
      const slotKey = slotEl.getAttribute("data-slot") || "";
      if (!slotKey) return;

      e.preventDefault();
      e.stopPropagation();
      openEditorForSlot(slotKey);
    };

    container.addEventListener("click", onClick);
    container.addEventListener("dblclick", onDblClick);
    return () => {
      container.removeEventListener("click", onClick);
      container.removeEventListener("dblclick", onDblClick);
    };
  }, [effectiveSlots, selectedSlotKey]);

  // Live drag: temporarily apply visual translation on the slot element directly,
  // without re-rendering the whole SVG (smoother and avoids React thrash).
  const handleDrag = (dx: number, dy: number) => {
    if (!selectedSlotKey || !previewRef.current) return;
    const slotEl = previewRef.current.querySelector(
      `[data-slot="${selectedSlotKey}"]`
    ) as Element | null;
    if (!slotEl) return;
    const movableEl = getMovable(slotEl);
    if (!movableEl) return;
    if (!dragStartRectRef.current && selectedRect) {
      dragStartRectRef.current = { ...selectedRect };
    }
    const startRect = dragStartRectRef.current;
    const base = slotTransforms[selectedSlotKey] ?? { dx: 0, dy: 0, sx: 1, sy: 1 };
    const sx = base.sx ?? 1;
    const sy = base.sy ?? 1;
    const delta = viewportDeltaToSvgUnits(slotEl, dx, dy);
    const ndx = base.dx + delta.dx;
    const ndy = base.dy + delta.dy;
    const isFO = movableEl.tagName.toLowerCase() === "foreignobject";
    if (isFO) {
      const fo = movableEl as unknown as SVGForeignObjectElement;
      captureOriginals(fo);
      const ox = parseFloat(fo.getAttribute("data-krobar-orig-x") || "0");
      const oy = parseFloat(fo.getAttribute("data-krobar-orig-y") || "0");
      fo.setAttribute("x", String(ox + ndx));
      fo.setAttribute("y", String(oy + ndy));
      if (sx !== 1 || sy !== 1) {
        applyForeignObjectScale(fo, sx, sy);
      }
    } else if (sx === 1 && sy === 1) {
      movableEl.setAttribute("transform", `translate(${ndx} ${ndy})`);
    } else {
      const bb = getLocalBBox(movableEl);
      movableEl.setAttribute("transform", buildTransform(ndx, ndy, sx, sy, bb.x, bb.y));
    }
    movableEl.setAttribute("data-krobar-moved", "1");
    if (startRect) {
      setSelectedRect({
        left: startRect.left + dx,
        top: startRect.top + dy,
        width: startRect.width,
        height: startRect.height,
      });
    }
  };

  const handleDragCommit = (dx: number, dy: number) => {
    dragStartRectRef.current = null;
    if (!selectedSlotKey || !previewRef.current) return;
    const slotEl = previewRef.current.querySelector(
      `[data-slot="${selectedSlotKey}"]`
    ) as Element | null;
    if (!slotEl) return;
    const base = slotTransforms[selectedSlotKey] ?? { dx: 0, dy: 0, sx: 1, sy: 1 };
    const delta = viewportDeltaToSvgUnits(slotEl, dx, dy);
    // No-op drag (e.g. simple click) → don't pollute history.
    if (delta.dx === 0 && delta.dy === 0) return;
    pushHistory();
    setSlotTransforms((prev) => ({
      ...prev,
      [selectedSlotKey]: {
        dx: base.dx + delta.dx,
        dy: base.dy + delta.dy,
        sx: base.sx ?? 1,
        sy: base.sy ?? 1,
      },
    }));
  };

  // Compute new (dx,dy,sx,sy) for a corner-resize, anchoring at the OPPOSITE corner.
  // dx,dy are viewport-space cumulative deltas of the dragged corner.
  const computeResize = (
    corner: "nw" | "ne" | "sw" | "se",
    dx: number,
    dy: number
  ): {
    movable: SVGGraphicsElement;
    next: { dx: number; dy: number; sx: number; sy: number };
    rect: { left: number; top: number; width: number; height: number };
  } | null => {
    if (!selectedSlotKey || !previewRef.current || !dragStartRectRef.current) return null;
    const slotEl = previewRef.current.querySelector(
      `[data-slot="${selectedSlotKey}"]`
    ) as Element | null;
    if (!slotEl) return null;
    const movable = getMovable(slotEl);
    if (!movable) return null;

    const startRect = dragStartRectRef.current;
    const base = slotTransforms[selectedSlotKey] ?? { dx: 0, dy: 0, sx: 1, sy: 1 };
    const baseSx = base.sx ?? 1;
    const baseSy = base.sy ?? 1;

    // Sign of the corner along each axis: +1 if corner moves outward in +x/+y direction.
    const signX = corner === "ne" || corner === "se" ? 1 : -1;
    const signY = corner === "sw" || corner === "se" ? 1 : -1;

    // New width/height in viewport px (clamped to a reasonable minimum).
    const minPx = 24;
    const newW = Math.max(minPx, startRect.width + signX * dx);
    const newH = Math.max(minPx, startRect.height + signY * dy);

    const ratioX = newW / startRect.width;
    const ratioY = newH / startRect.height;

    const newSx = baseSx * ratioX;
    const newSy = baseSy * ratioY;

    // Local bbox of the element WITHOUT current transform.
    const bb = getLocalBBox(movable);
     const isFO = movable.tagName.toLowerCase() === "foreignobject";

    let next: { dx: number; dy: number; sx: number; sy: number };

    if (isFO) {
      // For foreignObject we change width/height (no glyph distortion). The
      // FO grows from its (x, y) top-left, so anchoring the opposite corner
      // requires an extra translation when the dragged corner is on the left
      // or top edge.
      // The opposite-corner anchor in local coords:
      //   - if signX < 0 (dragged left edge), anchor is right edge => after
      //     width *= sx, the right edge shifts by bb.w*(sx-1); compensate by
      //     translating x by -bb.w*(sx-1).
      //   - signX > 0: no x compensation.
      // Same for y.
      const compX = signX < 0 ? -bb.w * (newSx - 1) : 0;
      const compY = signY < 0 ? -bb.h * (newSy - 1) : 0;
      next = {
        dx: base.dx + compX,
        dy: base.dy + compY,
        sx: newSx,
        sy: newSy,
      };
      const fo = movable as unknown as SVGForeignObjectElement;
      captureOriginals(fo);
      const ox = parseFloat(fo.getAttribute("data-krobar-orig-x") || "0");
      const oy = parseFloat(fo.getAttribute("data-krobar-orig-y") || "0");
      fo.setAttribute("x", String(ox + next.dx));
      fo.setAttribute("y", String(oy + next.dy));
      applyForeignObjectScale(fo, next.sx, next.sy);
    } else if (isWrapTextEl(movable)) {
      // Texte SVG avec wrap : pas de scale (déformerait les glyphes), on
      // re-wrappe avec une largeur de ligne / nb de lignes ajustés.
      const textEl = movable as SVGTextElement;
      const box = captureWrapTextOriginalBox(textEl);
      if (!textEl.hasAttribute("data-orig-wrap-max")) {
        textEl.setAttribute(
          "data-orig-wrap-max",
          textEl.getAttribute("data-wrap-max") || "22"
        );
        textEl.setAttribute(
          "data-orig-wrap-lines",
          textEl.getAttribute("data-wrap-lines") || "3"
        );
      }
      const origMax = parseInt(textEl.getAttribute("data-orig-wrap-max") || "22", 10);
      const newMax = Math.max(4, Math.round(origMax * newSx));
      const wrapDy = parseFloat(textEl.getAttribute("data-wrap-dy") || "18");
      const newLines = Math.max(1, Math.round((box.h * newSy) / Math.max(wrapDy, 1)));
      textEl.setAttribute("data-wrap-max", String(newMax));
      textEl.setAttribute("data-wrap-lines", String(newLines));
      const wrapX = parseFloat(textEl.getAttribute("data-wrap-x") || "0");
      const fullText =
        (effectiveSlots as Record<string, string>)[selectedSlotKey!] ??
        textEl.textContent ??
        "";
      wrapTextIntoTspans(textEl, fullText, wrapX, newMax, newLines, wrapDy);
      const compX = signX < 0 ? -box.w * (newSx - 1) : 0;
      const compY = signY < 0 ? -box.h * (newSy - 1) : 0;
      next = { dx: base.dx + compX, dy: base.dy + compY, sx: newSx, sy: newSy };
      textEl.setAttribute("transform", `translate(${next.dx} ${next.dy})`);
    } else {
      // Anchor in local coords = opposite corner of the dragged one.
      const anchorLocalX = signX > 0 ? bb.x : bb.x + bb.w;
      const anchorLocalY = signY > 0 ? bb.y : bb.y + bb.h;
      next = {
        dx: base.dx,
        dy: base.dy,
        sx: newSx,
        sy: newSy,
      };
      movable.setAttribute(
        "transform",
        buildTransform(next.dx, next.dy, next.sx, next.sy, anchorLocalX, anchorLocalY)
      );
    }
    movable.setAttribute("data-krobar-moved", "1");

    // New overlay rect: anchor corner stays put, opposite corner moves by (dx,dy).
    const left = signX > 0 ? startRect.left : startRect.left + (startRect.width - newW);
    const top = signY > 0 ? startRect.top : startRect.top + (startRect.height - newH);

    return {
      movable,
      next,
      rect: { left, top, width: newW, height: newH },
    };
  };

  const handleResize = (corner: "nw" | "ne" | "sw" | "se", dx: number, dy: number) => {
    if (!dragStartRectRef.current && selectedRect) {
      dragStartRectRef.current = { ...selectedRect };
    }
    const r = computeResize(corner, dx, dy);
    if (!r) return;
    setSelectedRect(r.rect);
  };

  const handleResizeCommit = (
    corner: "nw" | "ne" | "sw" | "se",
    dx: number,
    dy: number
  ) => {
    const r = computeResize(corner, dx, dy);
    dragStartRectRef.current = null;
    if (!r) return;
    // Skip no-op resize.
    if (dx !== 0 || dy !== 0) pushHistory();
    const isFO = r.movable.tagName.toLowerCase() === "foreignobject";
    const isWrapText = isWrapTextEl(r.movable);
    if (isFO) {
      // For FO, computeResize already encodes the anchored translation in
      // next.dx/next.dy (no buildTransform anchor needed).
      setSlotTransforms((prev) => ({
        ...prev,
        [selectedSlotKey]: { ...r.next },
      }));
      return;
    }
    if (isWrapText) {
      setSlotTransforms((prev) => ({
        ...prev,
        [selectedSlotKey]: { ...r.next },
      }));
      return;
    }
    // For other SVG nodes: bake the anchored buildTransform into the canonical
    // form using anchor (bb.x, bb.y).
    const bb = getLocalBBox(r.movable);
    const signX = corner === "ne" || corner === "se" ? 1 : -1;
    const signY = corner === "sw" || corner === "se" ? 1 : -1;
    const ax = signX > 0 ? bb.x : bb.x + bb.w;
    const ay = signY > 0 ? bb.y : bb.y + bb.h;
    const extraDx = (ax - bb.x) * (1 - r.next.sx);
    const extraDy = (ay - bb.y) * (1 - r.next.sy);
    setSlotTransforms((prev) => ({
      ...prev,
      [selectedSlotKey]: {
        dx: r.next.dx + extraDx,
        dy: r.next.dy + extraDy,
        sx: r.next.sx,
        sy: r.next.sy,
      },
    }));
  };




  const analyze = async () => {
    if (!text.trim()) {
      toast.error("Collez d'abord un texte à analyser.");
      return;
    }
    if (!manifest) return;

    setLoading(true);
    setSuggestions([]);
    setSelectedIdx(null);

    try {
      const data = await analyzeText(text, detailLevel);
      const rawSug: Suggestion[] = data.suggestions ?? [];
      if (rawSug.length === 0) throw new Error("Aucune suggestion");
      // Normalisation à réception : score décimal 0-1 garanti dans l'état.
      const sug = rawSug.map((s) => ({ ...s, score: normalizeScore(s.score) }));
      setSuggestions(sug);
      setSelectedIdx(0);
      toast.success(`${sug.length} suggestions générées`);
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : "Échec de l'analyse.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const downloadSVG = () => {
    if (!previewRef.current) return;
    const svg = previewRef.current.querySelector("svg");
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGElement;
    // Inline palette for portability
    applyPaletteVars(clone, palette);
    const str = svgToString(clone);
    downloadBlob(new Blob([str], { type: "image/svg+xml" }), "krobar.svg");
  };

  const downloadPNG = async () => {
    if (!previewRef.current) return;
    const svg = previewRef.current.querySelector("svg");
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGElement;
    applyPaletteVars(clone, palette);
    const vb = (clone.getAttribute("viewBox") || "0 0 800 600").split(" ").map(Number);
    const w = vb[2] || 800;
    const h = vb[3] || 600;
    clone.setAttribute("width", String(w));
    clone.setAttribute("height", String(h));
    const str = svgToString(clone);
    const svgBlob = new Blob([str], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const scale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = w * scale;
      canvas.height = h * scale;
      const ctx = canvas.getContext("2d")!;
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((b) => {
        if (b) downloadBlob(b, "krobar.png");
        URL.revokeObjectURL(url);
      }, "image/png");
    };
    img.onerror = () => {
      toast.error("Erreur d'export PNG");
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const cyclePalette = () => {
    const keys = Object.keys(palettes);
    const idx = keys.indexOf(paletteKey);
    setPaletteKey(keys[(idx + 1) % keys.length] as keyof typeof palettes);
  };

  if (testSuiteOpen && manifest) {
    return (
      <TestSuiteView
        manifest={manifest}
        onBack={() => setTestSuiteOpen(false)}
      />
    );
  }

  const renderInputSection = () => (
    <section className="flex flex-col gap-3 h-full">
      <Card className="p-4 flex flex-col gap-3 flex-1 overflow-y-auto">
        <Label className="text-sm font-semibold">Votre texte</Label>
        <Textarea
          placeholder="Collez votre texte ici (extrait de cours, paragraphe, idée)…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="flex-1 resize-none min-h-[260px] font-mono text-sm"
        />
        <div className="space-y-2">
          <Label className="text-sm font-semibold">Palette</Label>
          <div className="grid grid-cols-2 gap-2">
            {Object.keys(palettes).map((k) => {
              const p = palettes[k];
              const active = k === paletteKey;
              return (
                <button
                  key={k}
                  onClick={() => setPaletteKey(k as keyof typeof palettes)}
                  className={`text-left p-2 rounded-md border transition ${
                    active
                      ? "border-foreground ring-2 ring-foreground/20"
                      : "border-border hover:border-foreground/40"
                  }`}
                >
                  <div className="flex gap-1 mb-1.5">
                    <span className="w-4 h-4 rounded" style={{ background: p.colors.primary }} />
                    <span className="w-4 h-4 rounded" style={{ background: p.colors.accent }} />
                    <span className="w-4 h-4 rounded border" style={{ background: p.colors.bg }} />
                  </div>
                  <div className="text-xs font-medium">{p.name}</div>
                </button>
              );
            })}
          </div>
        </div>
        <Button onClick={analyze} disabled={loading} size="lg" className="w-full">
          {loading ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4 mr-2" />
          )}
          Analyser et proposer des visuels
        </Button>
      </Card>
    </section>
  );

  const renderSuggestionsSection = () => (
    <section className="flex flex-col gap-3 h-full overflow-hidden">
      <Card className="p-4 flex flex-col gap-3 flex-1 overflow-y-auto">
        <Label className="text-sm font-semibold">Suggestions IA</Label>
        {suggestions.length === 0 && !loading && (
          <div className="flex-1 flex items-center justify-center text-center text-sm text-muted-foreground p-6">
            Les vignettes proposées par l'IA apparaîtront ici.
          </div>
        )}
        {loading && (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}
        <div className="space-y-3">
          {suggestions.map((sug, i) => {
            const tpl = manifest?.templates.find((t) => t.id === sug.template_id);
            const active = i === selectedIdx;
            return (
              <button
                key={i}
                onClick={() => setSelectedIdx(i)}
                className={`w-full text-left rounded-lg border-2 p-3 transition ${
                  active
                    ? "border-foreground bg-accent"
                    : "border-border hover:border-foreground/40"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase tracking-wide">
                    {tpl?.name ?? sug.template_id}
                  </span>
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-foreground text-background">
                    {formatScorePct(sug.score)}
                  </span>
                </div>
                <div
                  ref={(el) => (thumbRefs.current[i] = el)}
                  className="w-full aspect-[4/3] bg-card border rounded overflow-hidden"
                />
                <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                  {sug.reasoning}
                </p>
              </button>
            );
          })}
        </div>
      </Card>
    </section>
  );

  const renderPreviewSection = () => (
    <section className="flex flex-col gap-3 h-full overflow-hidden">
      <Card className="p-4 flex flex-col gap-3 flex-1">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-sm font-semibold">Aperçu</Label>
          {selectedTemplate && (
            <span className="text-xs text-muted-foreground truncate">{selectedTemplate.name}</span>
          )}
        </div>
        <div
          ref={previewRef}
          className="flex-1 min-h-[300px] border rounded-lg bg-card overflow-hidden flex items-center justify-center [&_[data-slot]]:cursor-pointer"
        >
          {!selectedSuggestion && (
            <span className="text-sm text-muted-foreground">
              Sélectionnez une suggestion
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={downloadSVG} disabled={!selectedSuggestion} variant="outline">
            <Download className="w-4 h-4 mr-2" /> SVG
          </Button>
          <Button onClick={downloadPNG} disabled={!selectedSuggestion} variant="outline">
            <Download className="w-4 h-4 mr-2" /> PNG
          </Button>
        </div>
        <Button onClick={cyclePalette} disabled={!selectedSuggestion} variant="secondary">
          <RefreshCw className="w-4 h-4 mr-2" /> Régénérer avec autre palette
        </Button>
      </Card>
    </section>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl font-black tracking-tight">Krobar</h1>
            <span className="text-sm text-muted-foreground">
              Texte → Visuel SVG
            </span>
          </div>
          <div className="flex items-center gap-2">
            <CustomizePanel detailLevel={detailLevel} onApply={setDetailLevel} />
            <Button variant="outline" size="sm" onClick={() => setTestSuiteOpen(true)}>
              <FlaskConical className="w-4 h-4 mr-2" /> Lancer la suite de tests
            </Button>
          </div>
        </div>
      </header>

      <main className="h-[calc(100vh-65px)]">
        {/* Mobile: stack vertical */}
        <div className="lg:hidden grid grid-cols-1 gap-4 p-4">
          {renderInputSection()}
          {renderSuggestionsSection()}
          {renderPreviewSection()}
        </div>

        {/* Desktop: colonnes redimensionnables */}
        <div className="hidden lg:block h-full p-4">
          <ResizablePanelGroup
            direction="horizontal"
            autoSaveId="krobar-columns"
            className="h-full gap-0"
            onLayout={() => {
              // Tout redimensionnement de colonnes invalide la position
              // du cadre de sélection (calculée en coordonnées viewport).
              if (selectedSlotKey) {
                setSelectedSlotKey(null);
                setSelectedRect(null);
              }
            }}
          >
            <ResizablePanel defaultSize={28} minSize={18} className="pr-2">
              {renderInputSection()}
            </ResizablePanel>
            <ResizableHandle withHandle className="mx-1" />
            <ResizablePanel defaultSize={32} minSize={18} className="px-2">
              {renderSuggestionsSection()}
            </ResizablePanel>
            <ResizableHandle withHandle className="mx-1" />
            <ResizablePanel defaultSize={40} minSize={20} className="pl-2">
              {renderPreviewSection()}
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </main>

      {edit?.kind === "text" && (
        <EditableSlot
          rect={edit.rect}
          initialValue={edit.value}
          fontStyle={edit.fontStyle}
          onCommit={(val) => {
            if (val !== (slotOverrides[edit.slotKey] ?? edit.value)) {
              pushHistory();
            }
            setSlotOverrides((prev) => ({ ...prev, [edit.slotKey]: val }));
            setEdit(null);
          }}
          onCancel={() => setEdit(null)}
        />
      )}
      {edit?.kind === "icon" && (
        <IconPicker
          value={edit.value}
          style={{ left: edit.anchor.left, top: edit.anchor.top }}
          onSelect={(name) => {
            if (name !== (slotOverrides[edit.slotKey] ?? edit.value)) {
              pushHistory();
            }
            setSlotOverrides((prev) => ({ ...prev, [edit.slotKey]: name }));
            setEdit(null);
          }}
          onCancel={() => setEdit(null)}
        />
      )}
      {selectedSlotKey && selectedRect && !edit && (
        <MovableSlotOverlay
          rect={selectedRect}
          onDrag={handleDrag}
          onCommit={handleDragCommit}
          onResize={handleResize}
          onResizeCommit={handleResizeCommit}
          onEdit={() => openEditorForSlot(selectedSlotKey)}
          onCancel={() => {
            setSelectedSlotKey(null);
            setSelectedRect(null);
          }}
        />
      )}
    </div>
  );
};

export default Index;
