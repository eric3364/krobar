import { useEffect, useRef } from "react";

export type ResizeCorner = "nw" | "ne" | "sw" | "se";

export type MovableSlotOverlayProps = {
  /** Bounding rect in viewport (fixed) coordinates of the selected SVG element */
  rect: { left: number; top: number; width: number; height: number };
  /** Called continuously while dragging the frame, with viewport-space delta in CSS pixels */
  onDrag: (deltaX: number, deltaY: number) => void;
  /** Called once when the user releases the pointer after a move */
  onCommit: (deltaX: number, deltaY: number) => void;
  /** Live resize from a corner handle, with viewport-space deltas */
  onResize: (corner: ResizeCorner, deltaX: number, deltaY: number) => void;
  /** Commit a resize from a corner handle */
  onResizeCommit: (corner: ResizeCorner, deltaX: number, deltaY: number) => void;
  /** Called when user presses Escape or clicks the close button */
  onCancel: () => void;
  /** Called on double-click to switch from move mode to edit mode */
  onEdit: () => void;
};

const HANDLE_CURSOR: Record<ResizeCorner, string> = {
  nw: "nwse-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  se: "nwse-resize",
};

/**
 * Floating selection frame around a slot element. The frame is the move handle;
 * the four corner squares are resize handles.
 */
export default function MovableSlotOverlay({
  rect,
  onDrag,
  onCommit,
  onResize,
  onResizeCommit,
  onCancel,
  onEdit,
}: MovableSlotOverlayProps) {
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const lastDeltaRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const resizeCornerRef = useRef<ResizeCorner | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    startRef.current = { x: e.clientX, y: e.clientY };
    lastDeltaRef.current = { x: 0, y: 0 };
    resizeCornerRef.current = null;
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!startRef.current) return;
    e.preventDefault();
    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;
    lastDeltaRef.current = { x: dx, y: dy };
    onDrag(dx, dy);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!startRef.current) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    const { x, y } = lastDeltaRef.current;
    startRef.current = null;
    onCommit(x, y);
  };

  const makeHandlePointerDown =
    (corner: ResizeCorner) => (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      startRef.current = { x: e.clientX, y: e.clientY };
      lastDeltaRef.current = { x: 0, y: 0 };
      resizeCornerRef.current = corner;
    };

  const onHandlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!startRef.current || !resizeCornerRef.current) return;
    e.preventDefault();
    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;
    lastDeltaRef.current = { x: dx, y: dy };
    onResize(resizeCornerRef.current, dx, dy);
  };

  const onHandlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!startRef.current || !resizeCornerRef.current) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    const { x, y } = lastDeltaRef.current;
    const corner = resizeCornerRef.current;
    startRef.current = null;
    resizeCornerRef.current = null;
    onResizeCommit(corner, x, y);
  };

  const handleStyle = (corner: ResizeCorner): React.CSSProperties => {
    const base: React.CSSProperties = {
      position: "absolute",
      width: 12,
      height: 12,
      background: "hsl(var(--background))",
      border: "2px solid hsl(var(--foreground))",
      borderRadius: 2,
      cursor: HANDLE_CURSOR[corner],
      touchAction: "none",
      zIndex: 1,
    };
    const offset = -7;
    if (corner === "nw") return { ...base, left: offset, top: offset };
    if (corner === "ne") return { ...base, right: offset, top: offset };
    if (corner === "sw") return { ...base, left: offset, bottom: offset };
    return { ...base, right: offset, bottom: offset };
  };

  return (
    <div
      ref={frameRef}
      className="fixed z-40 rounded-sm ring-2 ring-foreground shadow-lg cursor-move select-none"
      style={{
        left: rect.left - 4,
        top: rect.top - 4,
        width: rect.width + 8,
        height: rect.height + 8,
        background: "transparent",
        touchAction: "none",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onEdit();
      }}
      title="Glissez pour déplacer • Coins pour redimensionner • Échap pour désélectionner"
    >
      {(["nw", "ne", "sw", "se"] as ResizeCorner[]).map((c) => (
        <div
          key={c}
          style={handleStyle(c)}
          onPointerDown={makeHandlePointerDown(c)}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
          onPointerCancel={onHandlePointerUp}
          onDoubleClick={(e) => e.stopPropagation()}
          aria-label={`Redimensionner (${c})`}
        />
      ))}
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onCancel();
        }}
        aria-label="Désélectionner"
        className="absolute -top-3 -right-3 w-6 h-6 rounded-full bg-foreground text-background text-xs leading-none flex items-center justify-center shadow"
        style={{ zIndex: 2 }}
      >
        ×
      </button>
    </div>
  );
}
