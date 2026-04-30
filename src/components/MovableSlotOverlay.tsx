import { useEffect, useRef } from "react";

export type MovableSlotOverlayProps = {
  /** Bounding rect in viewport (fixed) coordinates of the selected SVG element */
  rect: { left: number; top: number; width: number; height: number };
  /** Called continuously while dragging, with viewport-space delta in CSS pixels (cumulative since pointerdown) */
  onDrag: (deltaX: number, deltaY: number) => void;
  /** Called once when the user releases the pointer, with the final cumulative delta */
  onCommit: (deltaX: number, deltaY: number) => void;
  /** Called when user presses Escape or clicks the close button */
  onCancel: () => void;
  /** Called on double-click to switch from move mode to edit mode */
  onEdit: () => void;
};

/**
 * Floating selection frame around a slot element. The frame itself is the drag
 * handle: pointer-down anywhere on it starts a move.
 */
export default function MovableSlotOverlay({
  rect,
  onDrag,
  onCommit,
  onCancel,
  onEdit,
}: MovableSlotOverlayProps) {
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const lastDeltaRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
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
    // Capture on the frame itself so subsequent move/up events route here even
    // when the frame is repositioned under the pointer.
    e.currentTarget.setPointerCapture?.(e.pointerId);
    startRef.current = { x: e.clientX, y: e.clientY };
    lastDeltaRef.current = { x: 0, y: 0 };
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
      title="Glissez pour déplacer • Échap pour désélectionner"
    >
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onCancel();
        }}
        aria-label="Désélectionner"
        className="absolute -top-3 -right-3 w-6 h-6 rounded-full bg-foreground text-background text-xs leading-none flex items-center justify-center shadow"
      >
        ×
      </button>
    </div>
  );
}
