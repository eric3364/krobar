import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Loader2, RefreshCw, Check, AlertTriangle, MousePointer2, Hand } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  studioV2Api,
  type ExportZone,
  type Occupancy,
  type PlaceZonesResponse,
  type Viewbox,
  type ZonePair,
  type ZoneRect,
} from "@/lib/studioV2Api";

export type CompositionReadyData = {
  viewbox: [number, number, number, number];
  transform: string;
  gabarit: { font_size: number; box_w: number; box_h: number };
  zones_by_cardinality: Record<string, ExportZone[]>;
  headers?: {
    title: { rect: ZoneRect };
    subtitle: { rect: ZoneRect; disabled: boolean };
  };
};

type Props = {
  svg: string;
  viewbox: Viewbox;
  occupancy?: Occupancy;
  userMax: number;
  onUserMaxChange: (n: number) => void;
  produceByN: Record<number, boolean>;
  onProduceChange: (next: Record<number, boolean>) => void;
  validatedByN: Record<number, boolean>;
  onValidateCard: (n: number) => void;
  placement: PlaceZonesResponse | null;
  editedZones: Record<string, ZonePair[]>;
  onPlacementLoaded: (p: PlaceZonesResponse) => void;
  onEditedChange: (next: Record<string, ZonePair[]>) => void;
  onCompositionReady: (data: CompositionReadyData | null) => void;
  ratioLabel?: string;
  /** Stable storage key used to persist the editor's local UI state
   * (header rects, habillage modes, lorem/font choices, etc.) so the
   * work-in-progress survives a window close / reopen. */
  persistKey?: string;
  /** Externally-controlled flip/rotation (set before entering placements mode). */
  mirrored?: boolean;
  rotation?: 0 | 90 | 180 | 270;
};

type PersistedEditorState = {
  backplates: Record<string, boolean>;
  loremLen: LoremLen;
  fontSizePx: number;
  habMode: Record<string, HabillageMode>;
  traitSide: Record<string, TraitSide>;
  habillageValidated: boolean;
  headerRects: { title: ZoneRect; subtitle: ZoneRect } | null;
  subtitleEnabled: boolean;
  commonSize: { w: number; h: number } | null;
  mirrored?: boolean;
  rotation?: 0 | 90 | 180 | 270;
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
  svg, viewbox, occupancy, userMax, onUserMaxChange,
  produceByN, onProduceChange, validatedByN, onValidateCard,
  placement, editedZones, onPlacementLoaded, onEditedChange,
  onCompositionReady, ratioLabel, persistKey,
  mirrored: mirroredProp, rotation: rotationProp,
}: Props) {
  // Restore previously persisted editor state for this cell+registre+sel.
  const editorStateKey = persistKey ? `${persistKey}::editor` : null;
  const loadEditorState = (): PersistedEditorState | null => {
    if (!editorStateKey || typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(editorStateKey);
      return raw ? (JSON.parse(raw) as PersistedEditorState) : null;
    } catch { return null; }
  };
  const persisted = loadEditorState();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [card, setCard] = useState<number>(userMax);
  const [backplates, setBackplates] = useState<Record<string, boolean>>(persisted?.backplates ?? {});
  // Lorem permanent (toujours affiché). Longueur + taille de police sont GLOBALES.
  const [loremLen, setLoremLen] = useState<LoremLen>(persisted?.loremLen ?? "medium");
  const FONT_STEPS = [24, 20, 16, 13, 11] as const;
  const [fontSizePx, setFontSizePx] = useState<number>(persisted?.fontSizePx ?? 16);
  const [selectedN, setSelectedN] = useState<number | null>(null);
  const [commonSize, setCommonSize] = useState<{ w: number; h: number } | null>(persisted?.commonSize ?? null);
  const [overflow, setOverflow] = useState<Record<string, boolean>>({});
  const [loremHeights, setLoremHeights] = useState<Record<string, number>>({});
  // B2 — habillage
  const [habMode, setHabMode] = useState<Record<string, HabillageMode>>(persisted?.habMode ?? {});
  const [traitSide, setTraitSide] = useState<Record<string, TraitSide>>(persisted?.traitSide ?? {});
  const [habillageValidated, setHabillageValidated] = useState(persisted?.habillageValidated ?? false);

  // Headers (title + subtitle) — positions éditables, texte vient du rendu.
  type HeaderKey = "title" | "subtitle";
  const [headerRects, setHeaderRects] = useState<{ title: ZoneRect; subtitle: ZoneRect } | null>(persisted?.headerRects ?? null);
  const [subtitleEnabled, setSubtitleEnabled] = useState(persisted?.subtitleEnabled ?? true);
  const [selectedHeader, setSelectedHeader] = useState<HeaderKey | null>(null);

  // Outil actif : "select" = clic/glisse sur les cartouches activé ;
  // "view" = aucune capture, le décor reste visible sans interaction.
  type ToolMode = "select" | "view";
  const [toolMode, setToolMode] = useState<ToolMode>("select");
  const selectModeOn = toolMode === "select";

  // Mirror flip / rotation: controlled externally when props are supplied,
  // otherwise fallback to local persisted state (legacy path).
  const [mirroredLocal, setMirroredLocal] = useState<boolean>(persisted?.mirrored ?? false);
  const [rotationLocal, setRotationLocal] = useState<0 | 90 | 180 | 270>(persisted?.rotation ?? 0);
  const mirrored = mirroredProp ?? mirroredLocal;
  const rotation = rotationProp ?? rotationLocal;
  // Keep setters referenced (no-op assignment) for legacy toolbar fallback below.
  void setMirroredLocal; void setRotationLocal;

  // Persist UI state whenever it changes (debounced via micro-task is overkill — direct write is fine).
  useEffect(() => {
    if (!editorStateKey) return;
    try {
      const snap: PersistedEditorState = {
        backplates, loremLen, fontSizePx, habMode, traitSide,
        habillageValidated, headerRects, subtitleEnabled, commonSize, mirrored, rotation,
      };
      localStorage.setItem(editorStateKey, JSON.stringify(snap));
    } catch { /* ignore quota */ }
  }, [
    editorStateKey, backplates, loremLen, fontSizePx, habMode, traitSide,
    habillageValidated, headerRects, subtitleEnabled, commonSize, mirrored, rotation,
  ]);

  // Init / reset headers when a new placement arrives — but only if we don't
  // already have a persisted set (else we'd overwrite the user's edits).
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log("[studio] placement received, headers =", placement?.headers);
    if (headerRects) return; // already have (persisted or set previously)
    if (placement?.headers) {
      setHeaderRects({
        title: { ...placement.headers.title.rect },
        subtitle: { ...placement.headers.subtitle.rect },
      });
    }
  }, [placement]); // eslint-disable-line react-hooks/exhaustive-deps

  // Le viewbox est imposé par le backend (déjà au ratio cible, letterboxé).
  // Le front n'effectue plus aucun recadrage : workViewbox === viewbox backend.
  const workViewbox: Viewbox = viewbox;

  const overlayRef = useRef<SVGSVGElement>(null);
  const loremRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Validation states derived from per-cardinality props.
  const currentValidated = !!validatedByN[card];
  const producedNs = useMemo(
    () => Object.keys(produceByN).map(Number).filter((n) => produceByN[n]).sort((a, b) => a - b),
    [produceByN],
  );
  const pendingNs = producedNs.filter((n) => !validatedByN[n]);
  const allValidated = producedNs.length > 0 && pendingNs.length === 0;
  const placementMode = !allValidated;
  const habillageMode = allValidated; // habillage UI après validation de toutes les cardinalités

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
        occupancy, viewbox, cardinality_max: userMax,
      });
      onPlacementLoaded(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [occupancy, viewbox, userMax, onPlacementLoaded]);

  // Lancer le placement automatiquement au montage (occupancy + viewbox backend).
  const placementTriggeredRef = useRef(false);
  useEffect(() => {
    if (!placement && !loading && !placementTriggeredRef.current && occupancy) {
      placementTriggeredRef.current = true;
      fetchPlacement();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [occupancy]);

  // Re-fetch placement when user changes max cardinality
  const prevUserMaxRef = useRef(userMax);
  useEffect(() => {
    if (prevUserMaxRef.current !== userMax) {
      prevUserMaxRef.current = userMax;
      if (card > userMax) setCard(userMax);
      fetchPlacement();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userMax]);

  // Inheritance: when switching to a cardinality without edits, derive
  // from the next-higher cardinality (drop highest .n, keep settings).
  useEffect(() => {
    if (editedZones[String(card)]) return;
    if (!placement) return;
    for (let n = card + 1; n <= userMax; n++) {
      const higher = editedZones[String(n)];
      if (!higher || higher.length === 0) continue;
      const maxN = Math.max(...higher.map((z) => z.n));
      const inherited = higher.filter((z) => z.n !== maxN);
      if (inherited.length === 0) continue;
      onEditedChange({ ...editedZones, [String(card)]: inherited });
      const copyKeyed = <T,>(map: Record<string, T>): Record<string, T> => {
        const copy = { ...map };
        for (const z of inherited) {
          const src = `${n}:${z.n}`;
          if (map[src] !== undefined) copy[`${card}:${z.n}`] = map[src];
        }
        return copy;
      };
      setHabMode((m) => copyKeyed(m));
      setTraitSide((m) => copyKeyed(m));
      setBackplates((b) => copyKeyed(b));
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card]);

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
    if (headerResizeRef.current || headerDragRef.current) return onHeaderPointerMove(e);
    if (resizeRef.current) return onResizeMove(e);
    const d = dragRef.current;
    if (!d || !overlayRef.current) return;
    const box = overlayRef.current.getBoundingClientRect();
    const sx = workViewbox[2] / box.width;
    const sy = workViewbox[3] / box.height;
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
  const onPointerUp = () => {
    dragRef.current = null; resizeRef.current = null;
    headerDragRef.current = null; headerResizeRef.current = null;
  };

  // Header drag (move)
  const headerDragRef = useRef<{ key: HeaderKey; startX: number; startY: number; orig: ZoneRect } | null>(null);
  const onHeaderMoveDown = (key: HeaderKey, e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (!headerRects) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    headerDragRef.current = { key, startX: e.clientX, startY: e.clientY, orig: { ...headerRects[key] } };
    setSelectedHeader(key);
    setSelectedN(null);
  };
  // Header resize
  const headerResizeRef = useRef<{
    key: HeaderKey; corner: ResizeCorner;
    startX: number; startY: number; orig: ZoneRect;
  } | null>(null);
  const onHeaderResizeDown = (key: HeaderKey, corner: ResizeCorner, e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (!headerRects) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    headerResizeRef.current = {
      key, corner, startX: e.clientX, startY: e.clientY, orig: { ...headerRects[key] },
    };
    setSelectedHeader(key);
  };
  const onHeaderPointerMove = (e: React.PointerEvent) => {
    if (!overlayRef.current) return;
    const box = overlayRef.current.getBoundingClientRect();
    const sx = workViewbox[2] / box.width;
    const sy = workViewbox[3] / box.height;
    const rz = headerResizeRef.current;
    if (rz && headerRects) {
      const dx = (e.clientX - rz.startX) * sx;
      const dy = (e.clientY - rz.startY) * sy;
      const o = rz.orig;
      let nx = o.x, ny = o.y, nw = o.w, nh = o.h;
      if (rz.corner.includes("e")) nw = Math.max(viewbox[2] * 0.04, o.w + dx);
      if (rz.corner.includes("s")) nh = Math.max(viewbox[3] * 0.02, o.h + dy);
      if (rz.corner.includes("w")) { nw = Math.max(viewbox[2] * 0.04, o.w - dx); nx = o.x + (o.w - nw); }
      if (rz.corner.includes("n")) { nh = Math.max(viewbox[3] * 0.02, o.h - dy); ny = o.y + (o.h - nh); }
      setHeaderRects({ ...headerRects, [rz.key]: { x: nx, y: ny, w: nw, h: nh } });
      return;
    }
    const d = headerDragRef.current;
    if (d && headerRects) {
      const dx = (e.clientX - d.startX) * sx;
      const dy = (e.clientY - d.startY) * sy;
      setHeaderRects({
        ...headerRects,
        [d.key]: { ...d.orig, x: d.orig.x + dx, y: d.orig.y + dy },
      });
    }
  };

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
    const sx = workViewbox[2] / box.width;
    const sy = workViewbox[3] / box.height;
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

  // Build the composition payload — zones expressed dans le viewbox backend
  // (le backend a déjà letterboxé l'image au ratio cible).
  const buildComposition = useCallback((): CompositionReadyData | null => {
    if (!commonSize) return null;
    const zbc: Record<string, ExportZone[]> = {};
    for (const n of producedNs) {
      if (!validatedByN[n]) continue;
      const key = String(n);
      const list = (editedZones[key] ?? placement?.by_cardinality?.[key] ?? [])
        .map((p) => ensureRect(p, viewbox));
      const out: ExportZone[] = [];
      for (const z of list) {
        if (!z.rect || !z.icon) continue;
        const rect = {
          x: z.rect.x,
          y: z.rect.y,
          w: commonSize.w,
          h: commonSize.h,
        };
        const habKey = `${n}:${z.n}`;
        const mode = (habMode[habKey] ?? "integre") as "integre" | "cartouche";
        const auto =
          (z.rect.x + z.rect.w / 2) < (viewbox[0] + viewbox[2] / 2) ? "right" : "left";
        const side = (traitSide[habKey] ?? auto) as "left" | "right";
        const bp = !!backplates[habKey];
        let icon: ZoneRect;
        if (mode === "cartouche") {
          const isz = Math.min(z.icon.w, z.icon.h);
          const traitXAbs = side === "left" ? z.rect.x - 4 : z.rect.x + commonSize.w + 4;
          const ixAbs = side === "left" ? traitXAbs - 4 - isz : traitXAbs + 4;
          icon = { x: ixAbs, y: z.rect.y, w: isz, h: isz };
        } else {
          const iconOnRight = z.icon.x >= z.rect.x + z.rect.w / 2;
          const gap = 4;
          const ixAbs = iconOnRight
            ? z.rect.x + commonSize.w + gap
            : z.rect.x - z.icon.w - gap;
          icon = { x: ixAbs, y: z.rect.y, w: z.icon.w, h: z.icon.h };
        }
        out.push({ n: z.n, rect, icon, mode, trait_side: side, backplate: bp });
      }
      zbc[key] = out;
    }
    return {
      viewbox: [viewbox[0], viewbox[1], viewbox[2], viewbox[3]],
      transform: "translate(0,0) scale(1)",
      gabarit: { font_size: fontSizePx, box_w: commonSize.w, box_h: commonSize.h },
      zones_by_cardinality: zbc,
      headers: headerRects
        ? {
            title: { rect: { ...headerRects.title } },
            subtitle: { rect: { ...headerRects.subtitle }, disabled: !subtitleEnabled },
          }
        : undefined,
    };
  }, [commonSize, viewbox, producedNs, validatedByN, editedZones, placement, habMode, traitSide, backplates, fontSizePx, headerRects, subtitleEnabled]);

  // Emit composition once habillage is validated.
  useEffect(() => {
    if (habillageValidated) {
      onCompositionReady(buildComposition());
    } else {
      onCompositionReady(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [habillageValidated, buildComposition]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground mr-1">Max</span>
        <select
          value={userMax}
          onChange={(e) => onUserMaxChange(Number(e.target.value))}
          className="h-7 text-xs rounded border bg-background px-1"
          title="Cardinalité maximale (1 à 8)"
        >
          {Array.from({ length: 8 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground mx-1">·</span>
        <span className="text-xs text-muted-foreground mr-1">Cardinalité</span>
        {Array.from({ length: userMax }, (_, i) => i + 1).map((n) => {
          const isProduced = !!produceByN[n];
          const isValidated = !!validatedByN[n];
          return (
            <div key={n} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={isProduced}
                onChange={(e) => onProduceChange({ ...produceByN, [n]: e.target.checked })}
                title={isProduced ? "Décocher pour ne pas produire" : "Cocher pour produire"}
                className="h-3 w-3 cursor-pointer"
              />
              <button
                onClick={() => setCard(n)}
                disabled={!isProduced}
                className={[
                  "h-7 w-7 text-xs rounded border font-mono relative",
                  n === card
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background hover:bg-muted",
                  !isProduced ? "opacity-40 cursor-not-allowed line-through" : "",
                ].join(" ")}
              >
                {n}
                {isProduced && isValidated && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                    <Check className="w-2 h-2" />
                  </span>
                )}
              </button>
            </div>
          );
        })}
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
        <label className="flex items-center gap-1 ml-3 text-xs cursor-pointer select-none">
          <input
            type="checkbox"
            checked={subtitleEnabled}
            onChange={(e) => setSubtitleEnabled(e.target.checked)}
            className="h-3 w-3 cursor-pointer"
          />
          Sous-titre
        </label>
        {/* Mirror / rotation buttons are now hoisted to the parent toolbar
            (they live in the habillage bar, *before* placements mode). */}
        {ratioLabel && (
          <span className="text-xs text-muted-foreground ml-2 font-mono">
            Ratio backend : {ratioLabel}
          </span>
        )}
        <div className="flex-1" />
        <Button size="sm" variant="outline" onClick={recalc} disabled={loading}>
          {loading
            ? <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            : <RefreshCw className="w-4 h-4 mr-1" />}
          Recalculer
        </Button>
        {placementMode ? (
          <Button
            size="sm"
            onClick={() => onValidateCard(card)}
            disabled={!zones.length || currentValidated || !produceByN[card]}
          >
            <Check className="w-4 h-4 mr-1" /> Valider la cardinalité {card}
          </Button>
        ) : !habillageValidated ? (
          <Button
            size="sm"
            onClick={() => setHabillageValidated(true)}
            disabled={!zones.length}
          >
            <Check className="w-4 h-4 mr-1" /> Valider l'habillage
          </Button>
        ) : null}
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

      {placementMode && pendingNs.length > 0 && (
        <div className="text-xs px-2 py-1 rounded border bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300">
          Validées {producedNs.filter((n) => validatedByN[n]).length}/{producedNs.length} — reste à valider : {pendingNs.join(", ")}
        </div>
      )}
      {producedNs.length > 0 && pendingNs.length === 0 && !habillageValidated && (
        <div className="text-xs px-2 py-1 rounded border bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300">
          Toutes les cardinalités sont validées — passe à l'habillage
        </div>
      )}

      {error && (
        <div className="text-xs text-destructive flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> {error}
        </div>
      )}

      {(() => {
        const vbW = workViewbox[2];
        const vbH = workViewbox[3];
        // The container keeps the ORIGINAL image aspect ratio — placeholders
        // live in this fixed coordinate space and must never rotate/mirror.
        // Only the illustration layer below receives the transform.
        const rotated90 = rotation === 90 || rotation === 270;
        // When the illustration is rotated 90°/270°, its natural box swaps W/H.
        // We scale it to fit inside the (unrotated) container.
        const fitScale = rotated90 ? Math.min(vbW / vbH, vbH / vbW) : 1;
        const illustrationTransform = [
          "translate(-50%, -50%)",
          rotation ? `rotate(${mirrored ? -rotation : rotation}deg)` : "",
          fitScale !== 1 ? `scale(${fitScale})` : "",
          mirrored ? "scaleX(-1)" : "",
        ].filter(Boolean).join(" ");
        return (
          <div
            className="relative bg-background border rounded-md overflow-hidden mx-auto select-none"
            style={{
              aspectRatio: `${vbW} / ${vbH}`,
              width: `min(100%, calc(70vh * ${vbW} / ${vbH}))`,
              maxHeight: "70vh",
              userSelect: "none",
              WebkitUserSelect: "none",
            }}
            onMouseDown={(e) => {
              // Prevent text selection from starting on background drags.
              // Inputs/buttons inside are unaffected.
              const t = e.target as HTMLElement;
              if (t.closest("input, textarea, button, [contenteditable]")) return;
              e.preventDefault();
            }}
          >


            {/* Illustration vectorisée — calque du bas, recevant les transformations
                (miroir / rotation). Le placeholder ci-dessous reste figé. */}
            <div
              className="absolute [&>svg]:w-full [&>svg]:h-full"
              style={{
                top: "50%",
                left: "50%",
                width: "100%",
                height: "100%",
                transform: illustrationTransform,
                transformOrigin: "center center",
                pointerEvents: "none",
                userSelect: "none",
              }}
              dangerouslySetInnerHTML={{ __html: svg }}
            />

            <div style={{ position: "absolute", inset: 0 }}>


              <svg
                ref={overlayRef}
                className="absolute inset-0 w-full h-full"
                viewBox={`${workViewbox[0]} ${workViewbox[1]} ${workViewbox[2]} ${workViewbox[3]}`}
                preserveAspectRatio="xMidYMid meet"
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={onPointerUp}
                onClick={(e) => { if (e.target === e.currentTarget) { setSelectedN(null); setSelectedHeader(null); } }}
              >
          {/* Header boxes — title (always) + subtitle (toggleable) */}
          {headerRects && (["title", "subtitle"] as HeaderKey[]).map((hk) => {
            if (hk === "subtitle" && !subtitleEnabled) return null;
            const r = headerRects[hk];
            const isSel = selectedHeader === hk;
            const label = hk === "title" ? "Titre" : "Sous-titre";
            const handleSize = Math.max(6, Math.min(r.w, r.h) * 0.14);
            const color = "#2563eb"; // blue distinct from placeholders
            return (
              <g key={`header-${hk}`}>
                <rect
                  x={r.x} y={r.y} width={r.w} height={r.h}
                  rx={Math.min(4, r.h * 0.12)}
                  fill="rgba(37, 99, 235, 0.08)"
                  stroke={color}
                  strokeWidth={isSel ? 2 : 1.4}
                  strokeDasharray="6 3"
                  vectorEffect="non-scaling-stroke"
                  onPointerDown={(e) => { if (selectModeOn) onHeaderMoveDown(hk, e); }}
                  style={{ touchAction: "none", cursor: selectModeOn ? "grab" : "default", pointerEvents: selectModeOn ? "all" : "none" }}
                />
                <foreignObject x={r.x} y={r.y} width={r.w} height={r.h} pointerEvents="none">
                  <div
                    style={{
                      width: "100%", height: "100%",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      padding: "0 6px",
                      fontFamily: "system-ui, sans-serif",
                      fontSize: hk === "title" ? Math.max(10, r.h * 0.45) : Math.max(9, r.h * 0.4),
                      fontWeight: hk === "title" ? 700 : 500,
                      color,
                      opacity: 0.85,
                      userSelect: "none",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {label}
                  </div>
                </foreignObject>
                {isSel && (["nw","ne","sw","se"] as ResizeCorner[]).map((c) => {
                  const hx = c === "nw" || c === "sw" ? r.x - handleSize/2 : r.x + r.w - handleSize/2;
                  const hy = c === "nw" || c === "ne" ? r.y - handleSize/2 : r.y + r.h - handleSize/2;
                  const cursor = c === "nw" || c === "se" ? "nwse-resize" : "nesw-resize";
                  return (
                    <rect
                      key={c}
                      x={hx} y={hy} width={handleSize} height={handleSize}
                      fill="hsl(var(--background))"
                      stroke={color}
                      strokeWidth={1.5}
                      vectorEffect="non-scaling-stroke"
                      style={{ cursor, touchAction: "none" }}
                      onPointerDown={(e) => onHeaderResizeDown(hk, c, e)}
                    />
                  );
                })}
              </g>
            );
          })}
          {zones.map((z) => {
            if (!z.rect) return null;
            const r = z.rect;
            const key = zKey(z.n);
            const isSelected = selectedN === z.n;
            const collides = collidesWithGrid(r, occupancy, viewbox);
            const mode = getHabMode(z.n);
            const isCartouche = habillageMode && mode === "cartouche";
            const side: TraitSide = getTraitSide(z.n, r);
            const overflows = !isCartouche && !!overflow[key];
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
            const fontSize = fontSizePx;
            const hasBackplate = !!backplates[key];
            const btnSize = Math.max(6, Math.min(r.w, r.h) * 0.18);
            const btnX = r.x + r.w - btnSize - 2;
            const btnY = r.y + 2;
            const handleSize = Math.max(6, Math.min(r.w, r.h) * 0.14);

            // Trait (cartouche) geometry — suit la hauteur réelle du lorem,
            // mais ne dépasse jamais la hauteur du bloc texte (r.h).
            const indicativeH = fontSize * 1.2 * 3 + 6;
            const rawTraitH = loremHeights[key]
              ? Math.max(loremHeights[key], 6)
              : indicativeH;
            const traitH = Math.min(rawTraitH, r.h);
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
                  onPointerDown={(e) => { if (selectModeOn) onMoveDown(z.n, e); }}
                  style={{ touchAction: "none", cursor: selectModeOn ? "grab" : "default", pointerEvents: selectModeOn ? "all" : "none" }}
                />

                {/* Lorem text (permanent) */}
                <foreignObject x={r.x} y={r.y} width={r.w} height={r.h} pointerEvents="none">
                  <div
                    ref={(el) => { loremRefs.current[key] = el; }}
                    style={{
                      width: "100%", height: "100%",
                      padding: `${Math.min(r.h * 0.08, 4)}px ${Math.min(r.w * 0.04, 4)}px`,
                      fontSize: `${fontSizePx}px`,
                      lineHeight: 1.2,
                      overflow: isCartouche ? "visible" : "hidden",
                      wordBreak: "break-word",
                       color: "hsl(var(--foreground))",
                      fontFamily: "system-ui, sans-serif",
                      boxSizing: "border-box",
                      textAlign: isCartouche ? (side === "left" ? "left" : "right") : "left",
                      userSelect: "none",
                      WebkitUserSelect: "none",
                      cursor: "grab",
                      pointerEvents: "none",
                    }}

                  >
                    <span style={{ opacity: 0.45, fontWeight: 700, marginRight: 4 }}>{z.n}.</span>
                    {LOREM[loremLen]}
                  </div>
                </foreignObject>

                {/* Hit target above SVG/foreignObject content: keeps reconstructed
                    cartouches draggable even when browser text/SVG layers sit on top. */}
                <rect
                  x={r.x} y={r.y} width={r.w} height={r.h}
                  rx={Math.min(4, r.h * 0.08)}
                  fill="transparent"
                  pointerEvents={selectModeOn ? "all" : "none"}
                  onPointerDown={(e) => { if (selectModeOn) onMoveDown(z.n, e); }}
                  style={{ touchAction: "none", cursor: selectModeOn ? "grab" : "default" }}
                />

                {/* Habillage badge (integré) */}
                {habillageMode && !isCartouche && (
                  <text
                    x={r.x + r.w / 2} y={r.y + r.h - 3}
                    fontSize={Math.max(6, fontSize * 0.6)}
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
                {z.icon && (() => {
                  const iconSize = isCartouche
                    ? Math.min(z.icon.w, z.icon.h)
                    : null;
                  const ix = isCartouche
                    ? (side === "left" ? traitX - 4 - (iconSize as number) : traitX + 4)
                    : z.icon.x;
                  const iy = z.icon.y;
                  const iw = isCartouche ? (iconSize as number) : z.icon.w;
                  const ih = isCartouche ? (iconSize as number) : z.icon.h;
                  return (
                    <g
                      onPointerDown={(e) => onMoveDown(z.n, e)}
                      style={{ touchAction: "none", cursor: "grab" }}
                    >
                      <rect
                        x={ix} y={iy}
                        width={iw} height={ih}
                        rx={Math.min(3, ih * 0.08)}
                        fill="hsl(var(--primary) / 0.04)"
                        stroke={strokeBase} strokeWidth={1}
                        strokeDasharray="3 2"
                        vectorEffect="non-scaling-stroke"
                      />
                      <rect
                        x={ix + iw * 0.35}
                        y={iy + ih * 0.35}
                        width={iw * 0.3}
                        height={ih * 0.3}
                        fill="none"
                        stroke={strokeBase} strokeWidth={0.8} strokeOpacity={0.6}
                        vectorEffect="non-scaling-stroke"
                      />
                    </g>
                  );
                })()}
              </g>
            );
          })}
        </svg>
            </div>

            {loading && (
              <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
        );
      })()}

      <p className="text-[11px] text-muted-foreground">
        Clique une zone pour la sélectionner, glisse pour la déplacer, coins pour
        redimensionner. La taille de boîte est <strong>commune</strong> à toutes les cardinalités.
        Le cadre/ratio est fourni par le backend ({ratioLabel ?? "ratio backend"}).
      </p>
    </div>
  );
}
