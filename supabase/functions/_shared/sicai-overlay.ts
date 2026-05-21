// Shared helpers for SICAI placeholder overlays + palette.
export const SICAI_PALETTE: Array<[number, number, number, string]> = [
  [255, 255, 255, "#FFFFFF"],
  [250, 250, 248, "#FAFAF8"],
  [236, 236, 232, "#ECECE8"],
  [207, 207, 207, "#CFCFCF"],
  [138, 138, 138, "#8A8A8A"],
  [92, 92, 92, "#5C5C5C"],
  [43, 43, 43, "#2B2B2B"],
  [17, 17, 17, "#111111"],
];

export function quantizeToPalette(r: number, g: number, b: number): [number, number, number] {
  let best = SICAI_PALETTE[0];
  let bestD = Infinity;
  for (const c of SICAI_PALETTE) {
    const dr = r - c[0], dg = g - c[1], db = b - c[2];
    const d = dr * dr + dg * dg + db * db;
    if (d < bestD) { bestD = d; best = c; }
  }
  return [best[0], best[1], best[2]];
}

export type Rect = { x: number; y: number; w: number; h: number; rx: number };

export function getOverlayRects(cardinalityCode: string): { title: Rect; verbatims: Rect[] } {
  const title: Rect = { x: 80, y: 40, w: 1440, h: 140, rx: 16 };
  const c = (cardinalityCode || "").toUpperCase();
  let verbatims: Rect[] = [];
  if (c === "UNITAIRE") {
    verbatims = [{ x: 620, y: 720, w: 360, h: 140, rx: 12 }];
  } else if (c === "BINAIRE") {
    verbatims = [
      { x: 440, y: 720, w: 320, h: 124, rx: 12 },
      { x: 840, y: 720, w: 320, h: 124, rx: 12 },
    ];
  } else if (c === "TERNAIRE") {
    verbatims = [
      { x: 180, y: 720, w: 280, h: 112, rx: 12 },
      { x: 660, y: 720, w: 280, h: 112, rx: 12 },
      { x: 1140, y: 720, w: 280, h: 112, rx: 12 },
    ];
  } else if (c === "MULTIPLE") {
    verbatims = [
      { x: 80, y: 720, w: 240, h: 100, rx: 12 },
      { x: 380, y: 720, w: 240, h: 100, rx: 12 },
      { x: 680, y: 720, w: 240, h: 100, rx: 12 },
      { x: 980, y: 720, w: 240, h: 100, rx: 12 },
      { x: 1280, y: 720, w: 240, h: 100, rx: 12 },
    ];
  }
  return { title, verbatims };
}

export const MIN_SIZES: Record<string, { w: number; h: number }> = {
  UNITAIRE: { w: 360, h: 140 },
  BINAIRE: { w: 320, h: 124 },
  TERNAIRE: { w: 280, h: 112 },
  MULTIPLE: { w: 240, h: 100 },
};

export function buildSvg(opts: {
  pngBase64: string;
  cardinalityCode: string;
  illustrationId: string;
  familyCode: string;
  regimeCode: string;
}): string {
  const { title, verbatims } = getOverlayRects(opts.cardinalityCode);
  const scale = 1600 / 1536; // 1.04167
  const strokeAttrs = `fill="none" stroke="#CFCFCF" stroke-width="0.5" stroke-opacity="0.6" stroke-dasharray="4 4" vector-effect="non-scaling-stroke"`;
  const rectsXml = [
    `<rect data-slot="title" x="${title.x}" y="${title.y}" width="${title.w}" height="${title.h}" rx="8" ry="8" ${strokeAttrs} />`,
    ...verbatims.map((v, i) =>
      `<rect data-slot="verbatim-${i + 1}" x="${v.x}" y="${v.y}" width="${v.w}" height="${v.h}" rx="6" ry="6" ${strokeAttrs} />`
    ),
  ].join("\n  ");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" width="1600" height="900">
  <metadata>
    <krobar-template illustration-id="${opts.illustrationId}" family="${opts.familyCode}" cardinality="${opts.cardinalityCode}" regime="${opts.regimeCode}" title-count="1" verbatim-count="${verbatims.length}" anchor-count="${verbatims.length}" overlay-version="v1" vectorize-strategy="raster_embedded" />
  </metadata>
  <g transform="scale(${scale.toFixed(6)} ${scale.toFixed(6)})">
    <image href="data:image/png;base64,${opts.pngBase64}" x="0" y="0" width="1536" height="864" preserveAspectRatio="xMidYMid meet" />
  </g>
  ${rectsXml}
</svg>`;
}
