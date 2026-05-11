// Wrapper qui rend un SVG Krobar (string HTML) et applique l'auto-fit
// sur les <foreignObject> juste après l'insertion.
//
// Usage : remplace
//   <div dangerouslySetInnerHTML={{ __html: svg }} />
// par
//   <KrobarSvg svg={svg} className="..." />

import { useLayoutEffect, useRef, type CSSProperties } from "react";
import { applyAutoFitToContainer, type AutoFitStats } from "@/lib/autoFitSvg";

type Props = {
  svg: string;
  className?: string;
  style?: CSSProperties;
  onAutoFit?: (stats: AutoFitStats | null) => void;
};

export default function KrobarSvg({ svg, className, style, onAutoFit }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const stats = applyAutoFitToContainer(ref.current);
    onAutoFit?.(stats);
    // Observe les changements de texte (cas futur d'édition live)
    const container = ref.current;
    if (!container) return;
    const observer = new MutationObserver(() => {
      const next = applyAutoFitToContainer(container);
      onAutoFit?.(next);
    });
    observer.observe(container, { characterData: true, subtree: true, childList: true });
    return () => observer.disconnect();
  }, [svg, onAutoFit]);

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
