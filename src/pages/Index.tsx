import { useEffect, useMemo, useRef, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { palettes, paletteLabels, type Palette } from "@/palettes";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Download, Sparkles, Shield } from "lucide-react";

import CustomizePanel, { loadStoredDetailLevel, type DetailLevel } from "@/components/CustomizePanel";
import EditableSlot from "@/components/EditableSlot";
import IconPicker from "@/components/IconPicker";
import MovableSlotOverlay from "@/components/MovableSlotOverlay";
import TextFormatToolbar, { type TextStyleOverride } from "@/components/TextFormatToolbar";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { formatScorePct, normalizeScore } from "@/lib/kroki";
import { analyzeText, renderTemplate, getTemplates } from "@/lib/api";
import AccountMenu from "@/components/AccountMenu";
import { useQuota } from "@/hooks/useQuota";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";

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

// Parse une chaîne SVG en élément DOM.
function parseSvgString(svgStr: string): SVGElement {
  const doc = new DOMParser().parseFromString(svgStr, "image/svg+xml");
  return doc.documentElement as unknown as SVGElement;
}

// Charge le SVG rendu depuis le backend via POST /api/render.
// Retourne un SVGElement DOM prêt à être inséré.
async function loadRenderedSvg(
  templateId: string,
  slots: Record<string, string>,
  palette: Palette,
): Promise<SVGElement> {
  const paletteColors = palette.colors;
  const result = await renderTemplate(templateId, slots, paletteColors as unknown as Record<string, string>);
  return parseSvgString(result.svg);
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
  const quota = useQuota();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [text, setText] = useState("");
  const [paletteKey, setPaletteKey] = useState<keyof typeof palettes>("ocean");
  const [whiteBackground, setWhiteBackground] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  
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
  // Per-slot text style overrides applied via inline CSS on the rendered SVG element.
  const [slotTextStyles, setSlotTextStyles] = useState<Record<string, TextStyleOverride>>({});
  // Currently selected (single-clicked) slot key for moving.
  const [selectedSlotKey, setSelectedSlotKey] = useState<string | null>(null);
  const [selectedRect, setSelectedRect] = useState<
    { left: number; top: number; width: number; height: number } | null
  >(null);
  // Additional slots co-selected with Shift+click. The "primary" slot remains
  // selectedSlotKey (it owns the move/resize handles + toolbar position);
  // the extras are styled together via the toolbar but only display a halo.
  const [extraSelectedKeys, setExtraSelectedKeys] = useState<string[]>([]);
  const [extraSelectedRects, setExtraSelectedRects] = useState<
    Record<string, { left: number; top: number; width: number; height: number }>
  >({});
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
    getTemplates()
      .then((data) => {
        // L'API peut retourner { templates: [...] } ou directement un tableau
        const templates = Array.isArray(data) ? data : data.templates;
        setManifest({ templates });
      })
      .catch((err) => {
        console.error("Impossible de charger les templates depuis le backend", err);
        // Fallback sur le manifest local
        fetch("/templates/manifest.json")
          .then((r) => r.json())
          .then(setManifest)
          .catch(() => toast.error("Impossible de charger les templates"));
      });
  }, []);

  // Reprise d'une session passée via ?resume=<generation_id>
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const resumeId = params.get("resume");
    if (!resumeId) return;
    (async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = await supabase
        .from("generations")
        .select("input_text,palette_key")
        .eq("id", resumeId)
        .maybeSingle();
      if (data?.input_text) setText(data.input_text);
      if (data?.palette_key && data.palette_key in palettes) {
        setPaletteKey(data.palette_key as keyof typeof palettes);
      }
      // Nettoie l'URL pour éviter de re-déclencher au refresh
      const url = new URL(window.location.href);
      url.searchParams.delete("resume");
      window.history.replaceState({}, "", url.toString());
    })();
  }, []);

  const palette = palettes[paletteKey];
  const effectivePalette = useMemo<Palette>(() => {
    if (!whiteBackground) return palette;
    return { ...palette, colors: { ...palette.colors, bg: "#ffffff" } };
  }, [palette, whiteBackground]);

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
    suggestions.forEach(async (sug, i) => {
      const node = thumbRefs.current[i];
      if (!node) return;
      try {
        const svg = await loadRenderedSvg(sug.template_id, sug.slots, effectivePalette);
        svg.setAttribute("width", "100%");
        svg.setAttribute("height", "100%");
        node.innerHTML = "";
        node.appendChild(svg);
      } catch (err) {
        console.warn(`Erreur rendu vignette ${sug.template_id}`, err);
      }
    });
  }, [suggestions, effectivePalette]);

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
      // Pour un texte SVG en mode wrap, mesurer directement le rect rendu via
      // getBoundingClientRect (qui inclut le transform actuel et reflète le
      // re-wrap après resize). Ne pas multiplier par sx/sy car le wrap-mode
      // ne déforme pas les glyphes — il re-flow le texte.
      const r = (movable as SVGGraphicsElement).getBoundingClientRect();
      if (r && r.width > 1 && r.height > 1) {
        return {
          left: r.left,
          top: r.top,
          width: r.width,
          height: r.height,
          right: r.right,
          bottom: r.bottom,
        };
      }
    }
    // Pour un <foreignObject>, getBoundingClientRect() renvoie la taille du
    // conteneur SVG, qui peut être beaucoup plus grande (ou décalée par
    // rapport au texte) que le contenu HTML visible. On mesure donc le
    // rect du contenu textuel rendu via un Range, qui est exact au pixel.
    const target = movable ?? slotEl;
    let rect: DOMRect | { left: number; top: number; width: number; height: number; right: number; bottom: number } =
      target.getBoundingClientRect();
    if (target.tagName && target.tagName.toLowerCase() === "foreignobject") {
      const fo = target as unknown as SVGForeignObjectElement;
      const inner = fo.firstElementChild as HTMLElement | null;
      if (inner) {
        try {
          const range = document.createRange();
          range.selectNodeContents(inner);
          const r = range.getBoundingClientRect();
          range.detach?.();
          if (r && r.width > 1 && r.height > 1) {
            rect = r;
          } else {
            // Fallback : rect du wrapper si le Range échoue (ex: contenu vide).
            const wrapperRect = inner.getBoundingClientRect();
            if (wrapperRect.width > 1 && wrapperRect.height > 1) rect = wrapperRect;
          }
        } catch {
          const wrapperRect = inner.getBoundingClientRect();
          if (wrapperRect.width > 1 && wrapperRect.height > 1) rect = wrapperRect;
        }
      }
    }
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      right: (rect as DOMRect).right ?? rect.left + rect.width,
      bottom: (rect as DOMRect).bottom ?? rect.top + rect.height,
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
    const newW = ow > 0 ? ow * sx : NaN;
    const newH = oh > 0 ? oh * sy : NaN;
    if (Number.isFinite(newW)) fo.setAttribute("width", String(newW));
    if (Number.isFinite(newH)) fo.setAttribute("height", String(newH));

    // CRITIQUE — la taille de police NE doit PAS bouger pendant le resize.
    // Pour cela on capture, au tout 1er passage, la valeur calculée par le
    // navigateur (computedStyle) sur chaque nœud, et on la réimpose en
    // inline ensuite. Comme ça, peu importe ce que faisait le CSS hérité
    // ou un éventuel transform parent, la police reste figée à sa valeur
    // d'origine pour toute la session de redimensionnement.
    const root = fo.firstElementChild as HTMLElement | null;
    if (root && root.style) {
      root.style.width = "100%";
      root.style.height = "100%";
      root.style.maxWidth = "100%";
      root.style.boxSizing = "border-box";
      root.style.wordWrap = "break-word";
      root.style.overflowWrap = "break-word";
      root.style.whiteSpace = "normal";
      root.style.overflow = "hidden";
    }
    const all = fo.querySelectorAll<HTMLElement>("*");
    const nodes: HTMLElement[] = root ? [root, ...Array.from(all)] : Array.from(all);
    nodes.forEach((node) => {
      if (!node.style) return;
      // 1) Geler la taille de police d'origine (1ère fois seulement).
      if (!node.dataset.krobarFrozenFs) {
        const cs = window.getComputedStyle(node);
        const fs = cs.fontSize;
        if (fs) {
          node.dataset.krobarFrozenFs = fs;
        }
      }
      // 2) Réimposer la taille gelée à chaque resize.
      const frozen = node.dataset.krobarFrozenFs;
      if (frozen) node.style.fontSize = frozen;

      // 3) Forcer le wrap, neutraliser nowrap & largeurs px qui empêchent
      //    le retour à la ligne.
      if (node.style.whiteSpace === "nowrap") node.style.whiteSpace = "normal";
      node.style.wordWrap = "break-word";
      node.style.overflowWrap = "break-word";
      const w = node.style.width;
      if (w && /px\s*$/.test(w)) node.style.width = "100%";
      const mw = node.style.minWidth;
      if (mw && /px\s*$/.test(mw)) node.style.minWidth = "0";
    });

    // Force un reflow synchrone pour que le re-wrap soit visible immédiatement.
    if (root) void root.offsetHeight;
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
      if (!isFO && el.tagName.toLowerCase() === "text" && (sx !== 1 || sy !== 1)) {
        promoteTextToWrap(el as SVGTextElement);
      }
      const isWrapText = isWrapTextEl(el);
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
      } else if (isWrapText) {
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

  // Applique les overrides de style texte (taille/poids/italique/etc.) en CSS
  // inline sur l'élément rendu (text, foreignObject inner, etc.).
  const applySlotTextStyles = (
    svg: SVGElement,
    styles: Record<string, TextStyleOverride>
  ) => {
    Object.entries(styles).forEach(([key, s]) => {
      const slotEl = svg.querySelector(`[data-slot="${key}"]`) as Element | null;
      if (!slotEl) return;
      const tag = slotEl.tagName.toLowerCase();
      const targets: HTMLElement[] = [];
      if (tag === "foreignobject") {
        const inner = (slotEl.querySelector("[data-slot]") ||
          slotEl.firstElementChild) as HTMLElement | null;
        if (inner) targets.push(inner);
      } else {
        targets.push(slotEl as unknown as HTMLElement);
      }
      targets.forEach((t) => {
        if (s.fontSize != null) t.style.fontSize = `${s.fontSize}px`;
        if (s.fontWeight) t.style.fontWeight = s.fontWeight;
        if (s.fontStyle) t.style.fontStyle = s.fontStyle;
        if (s.textAlign) t.style.textAlign = s.textAlign;
        if (s.textDecoration) t.style.textDecoration = s.textDecoration;
        if (s.color) {
          t.style.color = s.color;
          // SVG <text> uses fill rather than color
          if (tag === "text") (slotEl as SVGElement).setAttribute("fill", s.color);
        }
        if (s.fontFamily) t.style.fontFamily = s.fontFamily;
      });
    });
  };

  // Render big preview
  useEffect(() => {
    if (!selectedSuggestion || !previewRef.current) return;
    (async () => {
      const svg = await loadRenderedSvg(selectedSuggestion.template_id, effectiveSlots, effectivePalette);
      applyTransforms(svg, slotTransforms);
      applySlotTextStyles(svg, slotTextStyles);
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
      if (extraSelectedKeys.length) {
        const next: Record<string, { left: number; top: number; width: number; height: number }> = {};
        extraSelectedKeys.forEach((k) => {
          const el = svg.querySelector(`[data-slot="${k}"]`) as Element | null;
          if (el) next[k] = getMovableViewportRect(el);
        });
        setExtraSelectedRects(next);
      }
    })();
  }, [selectedSuggestion, effectivePalette, effectiveSlots, slotTransforms, slotTextStyles]);

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

    // Keep selectedSlotKey & selectedRect so the TextFormatToolbar stays
    // visible while the inline text editor is open.
    setSelectedSlotKey(slotKey);
    setSelectedRect(getMovableViewportRect(slotEl));

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
        // Click outside any slot deselects everything
        setSelectedSlotKey(null);
        setSelectedRect(null);
        setExtraSelectedKeys([]);
        setExtraSelectedRects({});
        return;
      }
      const slotKey = slotEl.getAttribute("data-slot") || "";
      if (!slotKey) return;
      e.preventDefault();
      e.stopPropagation();

      // Shift+click → toggle co-selection (text slots only).
      const tag = slotEl.tagName.toLowerCase();
      const kind = slotEl.getAttribute("data-slot-kind");
      const isIcon = tag === "image" || tag === "use" || kind === "icon";

      if (e.shiftKey && selectedSlotKey && !isIcon && slotKey !== selectedSlotKey) {
        // If clicking an already-co-selected extra → deselect it (toggle off).
        if (extraSelectedKeys.includes(slotKey)) {
          setExtraSelectedKeys((prev) => prev.filter((k) => k !== slotKey));
          setExtraSelectedRects((rects) => {
            const next = { ...rects };
            delete next[slotKey];
            return next;
          });
          return;
        }
        // Otherwise: the newly clicked block becomes the PRIMARY (handles +
        // toolbar anchor), and the previous primary is demoted to an extra.
        // This matches the user expectation that the move handles always sit
        // on the most recently selected block.
        const prevPrimary = selectedSlotKey;
        const prevPrimaryRect = selectedRect;
        setSelectedSlotKey(slotKey);
        setSelectedRect(getMovableViewportRect(slotEl));
        setExtraSelectedKeys((prev) => [
          ...prev.filter((k) => k !== prevPrimary),
          prevPrimary,
        ]);
        if (prevPrimaryRect) {
          setExtraSelectedRects((rects) => ({
            ...rects,
            [prevPrimary]: prevPrimaryRect,
          }));
        }
        return;
      }

      // Plain click → reset multi-selection and pick this slot as primary.
      setSelectedSlotKey(slotKey);
      setSelectedRect(getMovableViewportRect(slotEl));
      setExtraSelectedKeys([]);
      setExtraSelectedRects({});
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

  // Apply a text-style patch to the primary selection AND every co-selected
  // (Shift+click) slot, in a single history step.
  const applyTextStylePatchToSelection = (patch: TextStyleOverride) => {
    if (!selectedSlotKey) return;
    const keys = [selectedSlotKey, ...extraSelectedKeys];
    pushHistory();
    setSlotTextStyles((prev) => {
      const next = { ...prev };
      keys.forEach((k) => {
        next[k] = { ...(prev[k] ?? {}), ...patch };
      });
      return next;
    });
  };

  // Keyboard shortcuts for text formatting on the selected slot(s).
  useEffect(() => {
    if (!selectedSlotKey || edit) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const target = e.target as HTMLElement | null;
      if (target && /^(input|textarea|select)$/i.test(target.tagName)) return;
      const cur = slotTextStyles[selectedSlotKey] ?? {};
      let patch: TextStyleOverride | null = null;
      if (e.key.toLowerCase() === "b") {
        const isBold = cur.fontWeight === "bold" || cur.fontWeight === "700";
        patch = { fontWeight: isBold ? "normal" : "bold" };
      } else if (e.key.toLowerCase() === "i") {
        patch = { fontStyle: cur.fontStyle === "italic" ? "normal" : "italic" };
      } else if (e.key === "=" || e.key === "+") {
        patch = { fontSize: Math.min(96, (cur.fontSize ?? 16) + 2) };
      } else if (e.key === "-") {
        patch = { fontSize: Math.max(8, (cur.fontSize ?? 16) - 2) };
      }
      if (patch) {
        e.preventDefault();
        applyTextStylePatchToSelection(patch);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedSlotKey, extraSelectedKeys, edit, slotTextStyles]);

  // Live drag: temporarily apply visual translation on the slot element directly,
  // without re-rendering the whole SVG (smoother and avoids React thrash).
  // Snapshot of every co-selected slot's base transform & start rect, captured
  // at pointerdown so the live preview adds the cumulative delta cleanly.
  const dragGroupRef = useRef<
    Record<
      string,
      {
        base: { dx: number; dy: number; sx: number; sy: number };
        startRect: { left: number; top: number; width: number; height: number } | null;
      }
    >
  >({});

  const liveDragSlot = (
    slotKey: string,
    dx: number,
    dy: number,
    base: { dx: number; dy: number; sx: number; sy: number }
  ) => {
    const container = previewRef.current;
    if (!container) return;
    const slotEl = container.querySelector(`[data-slot="${slotKey}"]`) as Element | null;
    if (!slotEl) return;
    const movableEl = getMovable(slotEl);
    if (!movableEl) return;
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
  };

  const handleDrag = (dx: number, dy: number) => {
    if (!selectedSlotKey || !previewRef.current) return;

    // First move of this gesture → snapshot base transforms + rects for the
    // whole co-selected group so the live preview can offset them cleanly.
    if (Object.keys(dragGroupRef.current).length === 0) {
      const keys = [selectedSlotKey, ...extraSelectedKeys];
      const snap: typeof dragGroupRef.current = {};
      keys.forEach((k) => {
        const base = slotTransforms[k] ?? { dx: 0, dy: 0, sx: 1, sy: 1 };
        const rect =
          k === selectedSlotKey
            ? selectedRect
            : extraSelectedRects[k] ?? null;
        snap[k] = {
          base: { dx: base.dx, dy: base.dy, sx: base.sx ?? 1, sy: base.sy ?? 1 },
          startRect: rect ? { ...rect } : null,
        };
      });
      dragGroupRef.current = snap;
      if (!dragStartRectRef.current && selectedRect) {
        dragStartRectRef.current = { ...selectedRect };
      }
    }

    Object.entries(dragGroupRef.current).forEach(([k, info]) => {
      liveDragSlot(k, dx, dy, info.base);
    });

    // Re-measure overlays from the actual rendered position of each slot
    // AFTER the live transform has been applied. This keeps the selection
    // frame and halos glued to the visible text instead of drifting because
    // of the viewport-px ↔ SVG-units scale mismatch on large drags.
    const container = previewRef.current;
    if (container) {
      const primaryEl = container.querySelector(
        `[data-slot="${selectedSlotKey}"]`
      ) as Element | null;
      if (primaryEl) {
        setSelectedRect(getMovableViewportRect(primaryEl));
      }
      if (extraSelectedKeys.length) {
        setExtraSelectedRects((prev) => {
          const next = { ...prev };
          extraSelectedKeys.forEach((k) => {
            const el = container.querySelector(`[data-slot="${k}"]`) as Element | null;
            if (el) next[k] = getMovableViewportRect(el);
          });
          return next;
        });
      }
    }
  };

  const handleDragCommit = (dx: number, dy: number) => {
    dragStartRectRef.current = null;
    const group = dragGroupRef.current;
    dragGroupRef.current = {};
    if (!selectedSlotKey || !previewRef.current) return;
    const slotEl = previewRef.current.querySelector(
      `[data-slot="${selectedSlotKey}"]`
    ) as Element | null;
    if (!slotEl) return;
    const delta = viewportDeltaToSvgUnits(slotEl, dx, dy);
    // No-op drag (e.g. simple click) → don't pollute history.
    if (delta.dx === 0 && delta.dy === 0) return;
    pushHistory();
    setSlotTransforms((prev) => {
      const next = { ...prev };
      const keys = [selectedSlotKey, ...extraSelectedKeys];
      keys.forEach((k) => {
        const base =
          group[k]?.base ?? prev[k] ?? { dx: 0, dy: 0, sx: 1, sy: 1 };
        next[k] = {
          dx: base.dx + delta.dx,
          dy: base.dy + delta.dy,
          sx: base.sx ?? 1,
          sy: base.sy ?? 1,
        };
      });
      return next;
    });
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
    // If we're resizing a plain SVG <text>, promote it to wrap-mode so the
    // glyphs are NOT scaled (which would enlarge the font visually). After
    // promotion the wrap branch below will handle re-flow naturally.
    if (
      movable.tagName.toLowerCase() === "text" &&
      !movable.hasAttribute("data-wrap-max")
    ) {
      promoteTextToWrap(movable as SVGTextElement);
    }
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
    if (quota.loading) {
      toast.message("Vérification du quota en cours…");
      return;
    }
    if (!quota.canGenerate) {
      toast.error(
        quota.limit === 0
          ? "Compte désactivé ou plan non configuré."
          : `Limite atteinte (${quota.used}/${quota.limit}). Passez à un plan supérieur.`,
      );
      return;
    }

    setLoading(true);
    setSuggestions([]);
    setSelectedIdx(null);

    try {
      const data = await analyzeText(text, detailLevel);
      const rawSug: Suggestion[] = data.suggestions ?? [];
      if (rawSug.length === 0) throw new Error("Aucune suggestion");
      // Tous les templates sont gérés par le backend — pas de filtre local
      const sug = rawSug.map((s) => ({ ...s, score: normalizeScore(s.score) }));
      setSuggestions(sug);
      setSelectedIdx(0);
      try {
        await quota.recordGeneration({
          templateId: sug[0]?.template_id,
          inputText: text,
          paletteKey: paletteKey as string,
        });
      } catch (e) {
        console.warn("Impossible d'enregistrer l'usage", e);
      }
      toast.success(`${sug.length} suggestions générées`);
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : "Échec de l'analyse.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // Convertit les <foreignObject> (HTML) du SVG en <text>/<tspan> SVG natifs.
  // Indispensable pour l'export PNG : un canvas qui dessine un SVG contenant
  // du foreignObject est marqué "tainted" par le navigateur, ce qui empêche
  // toBlob/toDataURL. La conversion préserve la position, la taille de police
  // approximative, la couleur, l'alignement et le retour à la ligne.
  const inlineForeignObjectsAsSvgText = (svg: SVGElement) => {
    const SVG_NS = "http://www.w3.org/2000/svg";
    const fos = Array.from(svg.querySelectorAll("foreignObject"));
    fos.forEach((fo) => {
      const x = parseFloat(fo.getAttribute("x") || "0");
      const y = parseFloat(fo.getAttribute("y") || "0");
      const w = parseFloat(fo.getAttribute("width") || "0");
      const inner = fo.firstElementChild as HTMLElement | null;
      const text = (inner?.textContent || fo.textContent || "").trim();
      const cs = inner ? window.getComputedStyle(inner) : null;
      const fontSize = cs ? parseFloat(cs.fontSize) || 14 : 14;
      const fontFamily = cs?.fontFamily || "sans-serif";
      const fontWeight = cs?.fontWeight || "normal";
      const fontStyle = cs?.fontStyle || "normal";
      const color = cs?.color || "#000";
      const align = cs?.textAlign || "left";
      const padding = 8;

      let anchor: "start" | "middle" | "end" = "start";
      let tx = x + padding;
      if (align === "center") {
        anchor = "middle";
        tx = x + w / 2;
      } else if (align === "right" || align === "end") {
        anchor = "end";
        tx = x + w - padding;
      }

      // Wrap par largeur approximative (0.55 em par caractère).
      const avgChar = Math.max(4, fontSize * 0.55);
      const maxChars = Math.max(4, Math.floor((w - padding * 2) / avgChar));
      const lineHeight = Math.max(fontSize * 1.2, fontSize + 2);
      const words = text.split(/\s+/).filter(Boolean);
      const lines: string[] = [];
      let cur = "";
      for (const word of words) {
        const candidate = cur ? `${cur} ${word}` : word;
        if (candidate.length > maxChars && cur) {
          lines.push(cur);
          cur = word;
        } else {
          cur = candidate;
        }
      }
      if (cur) lines.push(cur);
      if (lines.length === 0) lines.push("");

      const textEl = document.createElementNS(SVG_NS, "text");
      textEl.setAttribute("x", String(tx));
      textEl.setAttribute("y", String(y + padding + fontSize));
      textEl.setAttribute("fill", color);
      textEl.setAttribute("font-family", fontFamily);
      textEl.setAttribute("font-size", String(fontSize));
      textEl.setAttribute("font-weight", fontWeight);
      textEl.setAttribute("font-style", fontStyle);
      textEl.setAttribute("text-anchor", anchor);
      textEl.setAttribute("dominant-baseline", "alphabetic");

      lines.forEach((ln, i) => {
        const tspan = document.createElementNS(SVG_NS, "tspan");
        tspan.setAttribute("x", String(tx));
        if (i > 0) tspan.setAttribute("dy", String(lineHeight));
        tspan.textContent = ln;
        textEl.appendChild(tspan);
      });

      // Préserver les data-* du slot pour la cohérence.
      const slotKey = fo.getAttribute("data-slot");
      if (slotKey) textEl.setAttribute("data-slot", slotKey);

      fo.parentNode?.replaceChild(textEl, fo);
    });
  };

  const downloadSVG = () => {
    if (!previewRef.current) return;
    const svg = previewRef.current.querySelector("svg");
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGElement;
    applyPaletteVars(clone, effectivePalette);
    const str = svgToString(clone);
    downloadBlob(new Blob([str], { type: "image/svg+xml" }), "krobar.svg");
  };

  const downloadPNG = async () => {
    if (!previewRef.current) return;
    const svg = previewRef.current.querySelector("svg");
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGElement;
    applyPaletteVars(clone, effectivePalette);
    // Étape clé : neutraliser foreignObject pour éviter le canvas "tainted".
    inlineForeignObjectsAsSvgText(clone);
    const vb = (clone.getAttribute("viewBox") || "0 0 800 600").split(" ").map(Number);
    const w = vb[2] || 800;
    const h = vb[3] || 600;
    clone.setAttribute("width", String(w));
    clone.setAttribute("height", String(h));
    // Assurer le namespace XML pour la sérialisation hors document.
    if (!clone.getAttribute("xmlns")) {
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    }
    const str = svgToString(clone);
    const svgBlob = new Blob([str], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    try {
      await new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          try {
            const scale = 2;
            const canvas = document.createElement("canvas");
            canvas.width = Math.round(w * scale);
            canvas.height = Math.round(h * scale);
            const ctx = canvas.getContext("2d")!;
            // Fond blanc pour les zones transparentes.
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.scale(scale, scale);
            ctx.drawImage(img, 0, 0);
            canvas.toBlob((b) => {
              if (b) {
                downloadBlob(b, "krobar.png");
                resolve();
              } else {
                reject(new Error("toBlob a renvoyé null"));
              }
            }, "image/png");
          } catch (err) {
            reject(err);
          }
        };
        img.onerror = () => reject(new Error("Chargement de l'image SVG échoué"));
        img.src = url;
      });
      toast.success("Export PNG réussi");
    } catch (err) {
      console.error(err);
      toast.error("Erreur d'export PNG");
    } finally {
      URL.revokeObjectURL(url);
    }
  };



  const renderInputSection = () => (
    <section className="flex flex-col gap-3 h-full">
      <Card className="p-4 flex flex-col gap-3 flex-1 overflow-y-auto">
        <Label className="text-sm font-semibold">Votre texte</Label>
        <Textarea
          placeholder="Collez votre texte ici (extrait de cours, paragraphe, idée)…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={() => {
            // Reset preview state when a new text is pasted, so the previous
            // production is not retained.
            setSuggestions([]);
            setSelectedIdx(null);
            setSlotOverrides({});
            setSlotTransforms({});
            setSlotTextStyles({});
            setSelectedSlotKey(null);
            setSelectedRect(null);
            setExtraSelectedKeys([]);
            setExtraSelectedRects({});
            setEdit(null);
            historyRef.current = [];
          }}
          className="flex-1 resize-none min-h-[260px] font-mono text-sm"
        />
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold">Palette</Label>
            <div className="flex items-center gap-2">
              <Label htmlFor="white-bg-toggle" className="text-xs text-muted-foreground cursor-pointer">Fond blanc</Label>
              <Switch id="white-bg-toggle" checked={whiteBackground} onCheckedChange={setWhiteBackground} />
            </div>
          </div>
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
      </Card>
    </section>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-baseline gap-3">
            <a href="/" className="text-2xl font-black tracking-tight text-[#2563EB] hover:opacity-80 transition-opacity cursor-pointer no-underline">Krobar</a>
            <span className="text-sm text-muted-foreground">
              Texte → Visuel SVG
            </span>
          </div>
          <div className="flex items-center gap-2">
            <CustomizePanel detailLevel={detailLevel} onApply={setDetailLevel} />
            {isAdmin && (
              <Button size="sm" variant="outline" onClick={() => navigate("/admin")}>
                <Shield className="w-4 h-4" /> Back-office
              </Button>
            )}
            <AccountMenu />
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
      {selectedSlotKey && selectedRect && edit?.kind !== "icon" && (
        <>
          {/* Halo overlays for Shift-co-selected slots (read-only). */}
          {extraSelectedKeys.map((k) => {
            const r = extraSelectedRects[k];
            if (!r) return null;
            return (
              <div
                key={`extra-${k}`}
                className="fixed z-30 pointer-events-none rounded-sm ring-2 ring-primary/70"
                style={{
                  left: r.left - 4,
                  top: r.top - 4,
                  width: r.width + 8,
                  height: r.height + 8,
                  background: "hsl(var(--primary) / 0.06)",
                }}
              />
            );
          })}
          {!edit && (
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
                setExtraSelectedKeys([]);
                setExtraSelectedRects({});
              }}
            />
          )}
          {(() => {
            const slotEl = previewRef.current?.querySelector(
              `[data-slot="${selectedSlotKey}"]`
            ) as Element | null;
            if (!slotEl) return null;
            const tag = slotEl.tagName.toLowerCase();
            const kind = slotEl.getAttribute("data-slot-kind");
            const isIcon =
              tag === "image" || tag === "use" || kind === "icon";
            if (isIcon) return null;
            const count = 1 + extraSelectedKeys.length;
            return (
              <TextFormatToolbar
                rect={selectedRect}
                value={slotTextStyles[selectedSlotKey] ?? {}}
                selectionCount={count}
                onChange={(patch) => applyTextStylePatchToSelection(patch)}
              />
            );
          })()}
        </>
      )}
    </div>
  );
};

export default Index;
