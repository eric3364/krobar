import { useEffect, useLayoutEffect, useRef, useState } from "react";

export type EditableSlotProps = {
  rect: { left: number; top: number; width: number; height: number };
  initialValue: string;
  fontStyle: {
    fontFamily?: string;
    fontSize?: string;
    fontWeight?: string;
    color?: string;
    textAlign?: CanvasTextAlign | string;
  };
  onCommit: (value: string) => void;
  onCancel: () => void;
};

/**
 * Floating input rendered above the SVG, positioned via fixed coords (viewport space).
 * Auto-resizes width with the content.
 */
export default function EditableSlot({
  rect,
  initialValue,
  fontStyle,
  onCommit,
  onCancel,
}: EditableSlotProps) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState<number>(rect.width);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useLayoutEffect(() => {
    if (measureRef.current) {
      const w = measureRef.current.getBoundingClientRect().width;
      setWidth(Math.max(rect.width, w + 24));
    }
  }, [value, rect.width]);

  const commit = () => onCommit(value);

  return (
    <>
      <span
        ref={measureRef}
        aria-hidden
        className="invisible absolute whitespace-pre"
        style={{
          fontFamily: fontStyle.fontFamily,
          fontSize: fontStyle.fontSize,
          fontWeight: fontStyle.fontWeight,
        }}
      >
        {value || " "}
      </span>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        onBlur={commit}
        className="fixed z-50 rounded-sm border-2 border-foreground bg-background px-1 py-0.5 outline-none shadow-lg"
        style={{
          left: rect.left,
          top: rect.top,
          width,
          height: Math.max(rect.height, 24),
          fontFamily: fontStyle.fontFamily,
          fontSize: fontStyle.fontSize,
          fontWeight: fontStyle.fontWeight,
          color: fontStyle.color,
          textAlign: (fontStyle.textAlign as CanvasTextAlign) || "left",
        }}
      />
    </>
  );
}
