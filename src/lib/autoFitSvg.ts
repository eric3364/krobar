// Auto-fit des textes Krobar dans les bbox.
// Convention v2 : chaque slot rend son texte dans
//   <foreignObject><div class="slot-content">…</div></foreignObject>
// On veut :
//   1) wrap multiligne automatique (CSS standard) ;
//   2) si la hauteur déborde, réduire font-size jusqu'à un plancher 8px.

const MIN_FONT_SIZE_PX = 8;
const FONT_SIZE_STEP_PX = 1;
const MAX_ITERATIONS = 30;

export type AutoFitStats = {
  total: number;
  fittedAtBase: number;
  reduced: number;
  overflowing: number;
  /** Saturation moyenne (1 = pleine taille, 0.5 = font divisée par 2). */
  averageRatio: number;
};

export function autoFitTextInForeignObject(fo: SVGForeignObjectElement): {
  baseSize: number;
  finalSize: number;
  overflow: boolean;
} | null {
  const div = fo.querySelector(".slot-content") as HTMLElement | null;
  if (!div) return null;

  const targetWidth = parseFloat(fo.getAttribute("width") || "0");
  const targetHeight = parseFloat(fo.getAttribute("height") || "0");
  if (targetWidth <= 0 || targetHeight <= 0) return null;

  // ÉTAPE 1 — wrap multiligne
  div.style.wordWrap = "break-word";
  div.style.overflowWrap = "anywhere";
  div.style.hyphens = "auto";
  div.style.whiteSpace = "normal";
  if (!div.style.lineHeight) div.style.lineHeight = "1.2";

  // Récupère la font-size "de base" stockée la 1ʳᵉ fois, pour pouvoir
  // ré-évaluer correctement quand le texte change.
  let baseSize = parseFloat(div.dataset.autofitBase || "");
  if (!Number.isFinite(baseSize) || baseSize <= 0) {
    baseSize = parseFloat(getComputedStyle(div).fontSize) || 14;
    div.dataset.autofitBase = String(baseSize);
  }
  // Reset à la taille de base avant chaque mesure
  div.style.fontSize = `${baseSize}px`;
  div.removeAttribute("data-overflow");

  let fontSize = baseSize;
  let iterations = 0;
  let overflow = false;

  while (iterations < MAX_ITERATIONS) {
    const overflowsHeight = div.scrollHeight > targetHeight + 1;
    const overflowsWidth = div.scrollWidth > targetWidth + 1;
    if (!overflowsHeight && !overflowsWidth) break;

    if (fontSize <= MIN_FONT_SIZE_PX) {
      div.style.fontSize = `${MIN_FONT_SIZE_PX}px`;
      div.setAttribute("data-overflow", "true");
      fontSize = MIN_FONT_SIZE_PX;
      overflow = true;
      break;
    }

    fontSize -= FONT_SIZE_STEP_PX;
    div.style.fontSize = `${fontSize}px`;
    iterations++;
  }

  return { baseSize, finalSize: fontSize, overflow };
}

export function applyAutoFitToSvg(svg: SVGSVGElement): AutoFitStats {
  const foreignObjects = svg.querySelectorAll<SVGForeignObjectElement>("foreignObject");
  let total = 0;
  let fittedAtBase = 0;
  let reduced = 0;
  let overflowing = 0;
  let ratioSum = 0;
  foreignObjects.forEach((fo) => {
    const r = autoFitTextInForeignObject(fo);
    if (!r) return;
    total++;
    const ratio = r.finalSize / r.baseSize;
    ratioSum += ratio;
    if (r.overflow) overflowing++;
    else if (r.finalSize < r.baseSize) reduced++;
    else fittedAtBase++;
  });
  return {
    total,
    fittedAtBase,
    reduced,
    overflowing,
    averageRatio: total > 0 ? ratioSum / total : 1,
  };
}

export function applyAutoFitToContainer(container: HTMLElement | null): AutoFitStats | null {
  if (!container) return null;
  const svg = container.querySelector("svg") as SVGSVGElement | null;
  if (!svg) return null;
  return applyAutoFitToSvg(svg);
}
