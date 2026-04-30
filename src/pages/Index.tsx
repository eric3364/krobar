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

function fillSlots(svg: SVGElement, slots: Record<string, string>) {
  Object.entries(slots).forEach(([k, v]) => {
    const el = svg.querySelector(`[data-slot="${k}"]`) as HTMLElement | SVGElement | null;
    if (!el) return;
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
    Record<string, { dx: number; dy: number }>
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
  }, [selectedSuggestion]);

  // Merge AI slots with user-edited overrides
  const effectiveSlots = useMemo(
    () => ({ ...(selectedSuggestion?.slots ?? {}), ...slotOverrides }),
    [selectedSuggestion, slotOverrides]
  );

  // Apply translation transforms to slot elements (idempotent).
  const applyTransforms = (
    svg: SVGElement,
    transforms: Record<string, { dx: number; dy: number }>
  ) => {
    // Reset previously applied transforms (only those we manage)
    svg.querySelectorAll("[data-slot][data-krobar-moved='1']").forEach((el) => {
      el.removeAttribute("transform");
      el.removeAttribute("data-krobar-moved");
    });
    Object.entries(transforms).forEach(([key, t]) => {
      const slotEl = svg.querySelector(`[data-slot="${key}"]`) as Element | null;
      const el =
        (slotEl?.closest("foreignObject") as SVGForeignObjectElement | null) ?? slotEl;
      if (!el) return;
      el.setAttribute("transform", `translate(${t.dx} ${t.dy})`);
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
          const r = el.getBoundingClientRect();
          setSelectedRect({ left: r.left, top: r.top, width: r.width, height: r.height });
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

    const rect = slotEl.getBoundingClientRect();
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
      const r = slotEl.getBoundingClientRect();
      setSelectedSlotKey(slotKey);
      setSelectedRect({ left: r.left, top: r.top, width: r.width, height: r.height });
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
    const movableEl =
      (slotEl.closest("foreignObject") as SVGForeignObjectElement | null) ?? slotEl;
    // Snapshot rect on first move of this drag
    if (!dragStartRectRef.current && selectedRect) {
      dragStartRectRef.current = { ...selectedRect };
    }
    const startRect = dragStartRectRef.current;
    const base = slotTransforms[selectedSlotKey] ?? { dx: 0, dy: 0 };
    const delta = viewportDeltaToSvgUnits(slotEl, dx, dy);
    movableEl.setAttribute(
      "transform",
      `translate(${base.dx + delta.dx} ${base.dy + delta.dy})`
    );
    movableEl.setAttribute("data-krobar-moved", "1");
    // Move the overlay frame in lockstep, anchored to the drag-start rect.
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
    const base = slotTransforms[selectedSlotKey] ?? { dx: 0, dy: 0 };
    const delta = viewportDeltaToSvgUnits(slotEl, dx, dy);
    setSlotTransforms((prev) => ({
      ...prev,
      [selectedSlotKey]: { dx: base.dx + delta.dx, dy: base.dy + delta.dy },
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
