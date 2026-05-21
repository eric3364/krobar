import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Save, X } from "lucide-react";

type Box = { x: number; y: number; w: number; h: number; rx: number; ry: number };
type Slot = { id: string; label: string; box: Box; minW: number; minH: number };

const VIEW_W = 1600;
const VIEW_H = 900;
const SNAP = 4;

const MIN_SIZE: Record<string, { w: number; h: number }> = {
  UNITAIRE: { w: 360, h: 140 },
  BINAIRE: { w: 320, h: 124 },
  TERNAIRE: { w: 280, h: 112 },
  MULTIPLE: { w: 240, h: 100 },
};

function parseSlots(svgText: string): Slot[] {
  const slots: Slot[] = [];
  // Match all <rect data-slot="..." ... />
  const rectRe = /<rect\b([^>]*?)data-slot="([^"]+)"([^>]*?)\/?>/gi;
  let m: RegExpExecArray | null;
  while ((m = rectRe.exec(svgText)) !== null) {
    const full = m[0];
    const slotId = m[2];
    const getAttr = (name: string) => {
      const r = new RegExp(`\\s${name}="([^"]+)"`, "i").exec(full);
      return r ? Number(r[1]) : 0;
    };
    slots.push({
      id: slotId,
      label: slotId === "title" ? "Titre" : slotId.replace("verbatim-", "Verbatim "),
      box: {
        x: getAttr("x"),
        y: getAttr("y"),
        w: getAttr("width"),
        h: getAttr("height"),
        rx: getAttr("rx"),
        ry: getAttr("ry"),
      },
      minW: 200,
      minH: 80,
    });
  }
  // Sort: title first, then verbatim-1, 2, ...
  slots.sort((a, b) => {
    if (a.id === "title") return -1;
    if (b.id === "title") return 1;
    const ai = Number(a.id.replace("verbatim-", "")) || 0;
    const bi = Number(b.id.replace("verbatim-", "")) || 0;
    return ai - bi;
  });
  return slots;
}

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
function snap(v: number, on: boolean) { return on ? Math.round(v / SNAP) * SNAP : Math.round(v); }

type Drag =
  | { kind: "move"; slot: string; startX: number; startY: number; box: Box }
  | { kind: "resize"; slot: string; corner: string; startX: number; startY: number; box: Box };

export default function SvgLayoutEditor({
  svgUrl,
  jobId,
  cardinality,
  onClose,
  onSaved,
}: {
  svgUrl: string;
  jobId: string;
  cardinality?: string | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [svgBgUrl, setSvgBgUrl] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [snapOn, setSnapOn] = useState(true);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const minSize = useMemo(() => MIN_SIZE[(cardinality ?? "").toUpperCase()] ?? { w: 240, h: 100 }, [cardinality]);

  // Load SVG text, extract data-slot rects, build a "background" SVG without overlay rects.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(svgUrl);
        const text = await res.text();
        if (cancelled) return;
        setSlots(parseSlots(text).map((s) => ({ ...s, minW: minSize.w, minH: minSize.h })));
        // Strip overlay rects for the background image, so handles don't double-stack
        const stripped = text.replace(/<rect\b[^>]*data-slot="[^"]+"[^>]*\/?>/gi, "");
        const blob = new Blob([stripped], { type: "image/svg+xml" });
        setSvgBgUrl(URL.createObjectURL(blob));
      } catch (e) {
        toast.error(`Lecture SVG: ${(e as Error).message}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [svgUrl, minSize.w, minSize.h]);

  const updateBox = (id: string, patch: Partial<Box>) => {
    setSlots((prev) => prev.map((s) => s.id === id ? { ...s, box: { ...s.box, ...patch } } : s));
  };

  const screenToSvg = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const sx = (clientX - rect.left) * (VIEW_W / rect.width);
    const sy = (clientY - rect.top) * (VIEW_H / rect.height);
    return { x: sx, y: sy };
  };

  const onPointerDown = (e: React.PointerEvent, slot: Slot, kind: "move" | "resize", corner = "") => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const { x, y } = screenToSvg(e.clientX, e.clientY);
    setDrag(kind === "move"
      ? { kind: "move", slot: slot.id, startX: x, startY: y, box: { ...slot.box } }
      : { kind: "resize", slot: slot.id, corner, startX: x, startY: y, box: { ...slot.box } });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const { x, y } = screenToSvg(e.clientX, e.clientY);
    const snapping = snapOn && !e.shiftKey;
    const dx = x - drag.startX;
    const dy = y - drag.startY;
    setSlots((prev) => prev.map((s) => {
      if (s.id !== drag.slot) return s;
      const base = drag.box;
      if (drag.kind === "move") {
        const nx = snap(clamp(base.x + dx, 0, VIEW_W - base.w), snapping);
        const ny = snap(clamp(base.y + dy, 0, VIEW_H - base.h), snapping);
        return { ...s, box: { ...s.box, x: nx, y: ny } };
      }
      // resize
      let nx = base.x, ny = base.y, nw = base.w, nh = base.h;
      const c = drag.corner;
      if (c.includes("w")) { nx = base.x + dx; nw = base.w - dx; }
      if (c.includes("e")) { nw = base.w + dx; }
      if (c.includes("n")) { ny = base.y + dy; nh = base.h - dy; }
      if (c.includes("s")) { nh = base.h + dy; }
      // enforce minimum 40 px to keep handles usable; soft check happens on save
      if (nw < 40) { if (c.includes("w")) nx = base.x + base.w - 40; nw = 40; }
      if (nh < 40) { if (c.includes("n")) ny = base.y + base.h - 40; nh = 40; }
      nx = clamp(nx, 0, VIEW_W - 1);
      ny = clamp(ny, 0, VIEW_H - 1);
      nw = clamp(nw, 1, VIEW_W - nx);
      nh = clamp(nh, 1, VIEW_H - ny);
      return {
        ...s,
        box: {
          ...s.box,
          x: snap(nx, snapping),
          y: snap(ny, snapping),
          w: snap(nw, snapping),
          h: snap(nh, snapping),
        },
      };
    }));
  };

  const onPointerUp = () => setDrag(null);

  const save = async () => {
    const undersized = slots.filter((s) => s.box.w < minSize.w || s.box.h < minSize.h);
    if (undersized.length > 0) {
      const ok = window.confirm(
        `Avertissement : ${undersized.length} placeholder(s) en dessous de la taille minimum (${minSize.w}×${minSize.h} pour ${cardinality ?? "?"}). Sauvegarder quand même ?`,
      );
      if (!ok) return;
    }
    setSaving(true);
    try {
      const titleSlot = slots.find((s) => s.id === "title");
      const verbatims = slots
        .filter((s) => s.id.startsWith("verbatim-"))
        .map((s) => ({
          id: `v${s.id.replace("verbatim-", "")}`,
          x: s.box.x, y: s.box.y, w: s.box.w, h: s.box.h, rx: s.box.rx, ry: s.box.ry,
        }));
      const payload = {
        job_id: jobId,
        layout_hints: {
          title_box: titleSlot ? {
            x: titleSlot.box.x, y: titleSlot.box.y, w: titleSlot.box.w, h: titleSlot.box.h,
            rx: titleSlot.box.rx, ry: titleSlot.box.ry,
          } : undefined,
          verbatim_boxes: verbatims,
        },
      };
      const { data, error } = await supabase.functions.invoke("sicai-edit-layout-hints", { body: payload });
      if (error) throw new Error(error.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(`Coordonnées sauvegardées (v${(data as any)?.version ?? "?"})`);
      await onSaved();
      onClose();
    } catch (e) {
      toast.error(`Échec sauvegarde: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin inline" /></div>;
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-3">
        {/* Canvas */}
        <Card className="p-2 bg-muted">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            className="w-full bg-white border rounded select-none touch-none"
            style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}` }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {svgBgUrl && (
              <image href={svgBgUrl} x={0} y={0} width={VIEW_W} height={VIEW_H} preserveAspectRatio="xMidYMid meet" />
            )}
            {/* Grid (subtle) */}
            <g opacity={0.08}>
              {Array.from({ length: VIEW_W / 100 + 1 }).map((_, i) => (
                <line key={`v${i}`} x1={i * 100} y1={0} x2={i * 100} y2={VIEW_H} stroke="#000" strokeWidth={1} />
              ))}
              {Array.from({ length: VIEW_H / 100 + 1 }).map((_, i) => (
                <line key={`h${i}`} x1={0} y1={i * 100} x2={VIEW_W} y2={i * 100} stroke="#000" strokeWidth={1} />
              ))}
            </g>
            {slots.map((s) => {
              const { x, y, w, h, rx, ry } = s.box;
              const handles: { c: string; cx: number; cy: number; cursor: string }[] = [
                { c: "nw", cx: x, cy: y, cursor: "nwse-resize" },
                { c: "n", cx: x + w / 2, cy: y, cursor: "ns-resize" },
                { c: "ne", cx: x + w, cy: y, cursor: "nesw-resize" },
                { c: "e", cx: x + w, cy: y + h / 2, cursor: "ew-resize" },
                { c: "se", cx: x + w, cy: y + h, cursor: "nwse-resize" },
                { c: "s", cx: x + w / 2, cy: y + h, cursor: "ns-resize" },
                { c: "sw", cx: x, cy: y + h, cursor: "nesw-resize" },
                { c: "w", cx: x, cy: y + h / 2, cursor: "ew-resize" },
              ];
              return (
                <g key={s.id}>
                  <rect
                    x={x} y={y} width={w} height={h} rx={rx} ry={ry}
                    fill="#facc15" fillOpacity={0.28}
                    stroke="#ca8a04" strokeWidth={2}
                    style={{ cursor: "move" }}
                    onPointerDown={(e) => onPointerDown(e, s, "move")}
                  >
                    <title>{`${s.label}  x=${x} y=${y} w=${w} h=${h}`}</title>
                  </rect>
                  <text x={x + 6} y={y + 20} fontSize={16} fill="#713f12" style={{ pointerEvents: "none" }}>
                    {s.label}
                  </text>
                  {handles.map((hd) => (
                    <rect
                      key={hd.c}
                      x={hd.cx - 10} y={hd.cy - 10} width={20} height={20}
                      fill="#fff" stroke="#ca8a04" strokeWidth={2}
                      style={{ cursor: hd.cursor }}
                      onPointerDown={(e) => onPointerDown(e, s, "resize", hd.c)}
                    />
                  ))}
                </g>
              );
            })}
          </svg>
          <div className="text-[10px] text-muted-foreground mt-2 flex items-center justify-between">
            <span>viewBox 1600×900 — grille 100px — snap {snapOn ? "4px (Shift = libre)" : "off"} — min {minSize.w}×{minSize.h}</span>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={snapOn} onChange={(e) => setSnapOn(e.target.checked)} />
              Snap 4px
            </label>
          </div>
        </Card>

        {/* Side panel */}
        <Card className="p-3 space-y-3 max-h-[600px] overflow-auto">
          <h3 className="text-sm font-semibold">Coordonnées</h3>
          {slots.map((s) => {
            const tooSmall = s.box.w < minSize.w || s.box.h < minSize.h;
            return (
              <div key={s.id} className="space-y-1 border rounded p-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium">{s.label}</Label>
                  {tooSmall && <span className="text-[10px] text-orange-600">trop petit</span>}
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {(["x", "y", "w", "h", "rx", "ry"] as const).map((k) => (
                    <div key={k}>
                      <Label className="text-[10px] text-muted-foreground">{k}</Label>
                      <Input
                        type="number"
                        value={s.box[k]}
                        onChange={(e) => updateBox(s.id, { [k]: Number(e.target.value) || 0 })}
                        className="h-7 text-xs"
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </Card>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
          <X className="w-3 h-3 mr-1" /> Annuler
        </Button>
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
          Sauvegarder les nouvelles coordonnées
        </Button>
      </div>
    </div>
  );
}
