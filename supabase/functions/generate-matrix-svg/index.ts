// Generate an SVG diagram from a matrix description using Lovable AI (text model).
// Two modes:
//  - Skeleton mode (NEW): body = { archetype: "grid_2x2", model? }
//    Produces an SVG-KR v0.1 skeleton with placeholders, validated by 8 audit checks.
//    Returns { status: "valid"|"invalid", checks_passed, checks_failed, failed_checks?, svg }
//  - Legacy mode: body = { name, category, usage, comment, model } — kept for existing UI.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

function extractSvg(text: string): string | null {
  if (!text) return null;
  const fenced = text.match(/```(?:svg|xml|html)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const m = candidate.match(/<svg[\s\S]*?<\/svg>/i);
  return m ? m[0] : null;
}

// ============================================================
// SKELETON MODE — prompts per archetype
// ============================================================

function skeletonSystemPrompt(archetype: string): string {
  if (archetype !== "grid_2x2") {
    throw new Error(`Archetype non supporté: ${archetype}. Seul "grid_2x2" est implémenté.`);
  return `Tu es un illustrateur de gabarits SVG-KR. Tu produis UNIQUEMENT un fichier SVG valide, sans aucun texte autour, sans markdown, sans explication.

CONVENTION SVG-KR v0.1 — OBLIGATOIRE.

Racine SVG :
  <svg xmlns="http://www.w3.org/2000/svg"
       xmlns:html="http://www.w3.org/1999/xhtml"
       xmlns:krobar="http://krobar.online/spec/v1"
       data-svg-kr-version="0.1"
       viewBox="0 0 1024 768"
       font-family="Plus Jakarta Sans, system-ui, sans-serif">

Bloc <metadata> obligatoire :
  <metadata>
    <krobar:krobar-meta>
      <krobar:id>{{TEMPLATE_ID}}</krobar:id>
      <krobar:tier>canonical-matrix</krobar:tier>
      <krobar:archetype>grid_2x2</krobar:archetype>
      <krobar:matrice-id>{{MATRICE_ID}}</krobar:matrice-id>
      <krobar:components-count>4</krobar:components-count>
    </krobar:krobar-meta>
  </metadata>

Note : {{TEMPLATE_ID}} et {{MATRICE_ID}} sont des placeholders à laisser tels quels.

COORDONNÉES IMPOSÉES (NE PAS DÉVIER) :

ViewBox : 0 0 1024 768 (ratio 4:3 paysage strict)

Slot titre :
  - slot-shape data-shape="bbox_title_1" : x=40, y=20, width=944, height=60, fill=none, stroke=none
  - foreignObject : x=40, y=20, width=944, height=60
  - slot-content style : font-size:36px, font-weight:700, color:#0f172a, line-height:1.1, text-align:center

Canonical-labels haut (×2) :
  - canonical_1 (top-left)  : foreignObject x=40,  y=96, width=464, height=36
  - canonical_2 (top-right) : foreignObject x=520, y=96, width=464, height=36
  - canonical-label-content style : font-size:16px, font-weight:600, color:#0f172a, text-align:center

Quadrants haut (×2) :
  - quadrant_1 (top-left)  : slot-shape ET foreignObject x=40,  y=140, width=464, height=276
  - quadrant_2 (top-right) : slot-shape ET foreignObject x=520, y=140, width=464, height=276
  - slot-shape fill=#ffffff, stroke=#0f172a, stroke-width=1.5
  - slot-content style : font-size:18px, line-height:1.35, color:#0f172a, padding:16px

Canonical-labels bas (×2) :
  - canonical_3 (bot-left)  : foreignObject x=40,  y=428, width=464, height=36
  - canonical_4 (bot-right) : foreignObject x=520, y=428, width=464, height=36
  - canonical-label-content style : font-size:16px, font-weight:600, color:#0f172a, text-align:center

Quadrants bas (×2) :
  - quadrant_3 (bot-left)  : slot-shape ET foreignObject x=40,  y=472, width=464, height=276
  - quadrant_4 (bot-right) : slot-shape ET foreignObject x=520, y=472, width=464, height=276
  - slot-shape fill=#ffffff, stroke=#0f172a, stroke-width=1.5
  - slot-content style : font-size:18px, line-height:1.35, color:#0f172a, padding:16px

STRUCTURE — pour chaque slot-group quadrant :
  <g class="slot-group" data-slot-key="quadrant_N">
    <rect class="slot-shape krobar-bbox-fill krobar-bbox-stroke"
          data-shape="bbox_quadrant_N" x="..." y="..." width="..." height="..."
          fill="#ffffff" stroke="#0f172a" stroke-width="1.5" />
    <foreignObject class="slot-label" x="..." y="..." width="..." height="...">
      <html:div xmlns="http://www.w3.org/1999/xhtml" class="slot-content"
                style="font-size:18px;line-height:1.35;color:#0f172a;padding:16px;">
        {{quadrant_N}}
      </html:div>
    </foreignObject>
  </g>

Pour chaque canonical-label :
  <g class="canonical-label" data-for-shape="bbox_quadrant_N">
    <foreignObject x="..." y="..." width="464" height="36">
      <html:div xmlns="http://www.w3.org/1999/xhtml" class="canonical-label-content"
                style="font-size:16px;font-weight:600;color:#0f172a;text-align:center;">
        {{canonical_N}}
      </html:div>
    </foreignObject>
  </g>

Pour le titre :
  <g class="slot-group" data-slot-key="title">
    <rect class="slot-shape krobar-bbox-fill krobar-bbox-stroke"
          data-shape="bbox_title_1" x="40" y="20" width="944" height="60"
          fill="none" stroke="none" />
    <foreignObject class="slot-label" x="40" y="20" width="944" height="60">
      <html:div xmlns="http://www.w3.org/1999/xhtml" class="slot-content"
                style="font-size:36px;font-weight:700;color:#0f172a;line-height:1.1;text-align:center;">
        {{title}}
      </html:div>
    </foreignObject>
  </g>

RÈGLES STRICTES :

1. N va de 1 à 4. Placeholders {{quadrant_1..4}}, {{canonical_1..4}}, {{title}}, {{TEMPLATE_ID}}, {{MATRICE_ID}}.
2. Palette B&W STRICTE. Hex autorisés UNIQUEMENT : #ffffff, #0f172a, #000000, #f1f5f9, #e2e8f0, #cbd5e1, #94a3b8, #64748b. Aucun var(--*), aucun gradient, aucun mot blue/red/green/yellow/orange/purple/gradient.
3. Pas de <text> ni <tspan> SVG. Tout texte via <foreignObject><html:div>.
4. Aucun libellé canonique en dur — uniquement les placeholders.
5. Respecte EXACTEMENT les coordonnées imposées ci-dessus. NE DÉVIE PAS d'un seul pixel.

Réponds avec le code SVG uniquement.`;
}



// ============================================================
// AUDIT — 8 checks
// ============================================================

type CheckResult = { id: number; name: string; reason?: string; ok: boolean };

const ALLOWED_HEX = new Set([
  "#ffffff", "#0f172a", "#000000",
  "#f1f5f9", "#e2e8f0", "#cbd5e1", "#94a3b8", "#64748b",
]);
const FORBIDDEN_COLOR_WORDS = ["blue", "red", "green", "yellow", "orange", "purple", "gradient"];

function audit(svg: string, archetype: string): CheckResult[] {
  const results: CheckResult[] = [];
  const push = (id: number, name: string, ok: boolean, reason?: string) =>
    results.push({ id, name, ok, reason });

  // Check 1 — Racine SVG valide
  {
    const root = svg.match(/<svg\b[^>]*>/i)?.[0] ?? "";
    const checks = [
      ['xmlns="http://www.w3.org/2000/svg"', root.includes('xmlns="http://www.w3.org/2000/svg"')],
      ['xmlns:html="http://www.w3.org/1999/xhtml"', root.includes('xmlns:html="http://www.w3.org/1999/xhtml"')],
      ['xmlns:krobar="http://krobar.online/spec/v1"', root.includes('xmlns:krobar="http://krobar.online/spec/v1"')],
      ['data-svg-kr-version="0.1"', root.includes('data-svg-kr-version="0.1"')],
      ['viewBox present', /viewBox="[^"]+"/.test(root)],

    ] as const;
    const missing = checks.filter(([, ok]) => !ok).map(([n]) => n);
    push(1, "Racine SVG valide", missing.length === 0, missing.length ? `Manquant: ${missing.join(", ")}` : undefined);
  }

  // Check 2 — Metadata
  {
    const meta = svg.match(/<krobar:krobar-meta>[\s\S]*?<\/krobar:krobar-meta>/)?.[0] ?? "";
    const required = ["krobar:id", "krobar:tier", "krobar:archetype", "krobar:matrice-id", "krobar:components-count"];
    const missing = required.filter((r) => !new RegExp(`<${r}>`).test(meta));
    const tier = meta.match(/<krobar:tier>([^<]*)<\/krobar:tier>/)?.[1]?.trim();
    const arch = meta.match(/<krobar:archetype>([^<]*)<\/krobar:archetype>/)?.[1]?.trim();
    const count = meta.match(/<krobar:components-count>([^<]*)<\/krobar:components-count>/)?.[1]?.trim();
    const reasons: string[] = [];
    if (!meta) reasons.push("bloc <krobar:krobar-meta> absent");
    if (missing.length) reasons.push(`enfants manquants: ${missing.join(", ")}`);
    if (tier && tier !== "canonical-matrix") reasons.push(`tier="${tier}" (attendu canonical-matrix)`);
    if (arch && arch !== archetype) reasons.push(`archetype="${arch}" (attendu ${archetype})`);
    if (count && !/^\d+$/.test(count)) reasons.push(`components-count="${count}" non entier`);
    push(2, "Metadata présente et complète", reasons.length === 0, reasons.join(" · ") || undefined);
  }

  // Check 3 — Slot-group titre
  {
    const titleGroups = [...svg.matchAll(/<g\b[^>]*class="slot-group"[^>]*data-slot-key="title"[^>]*>([\s\S]*?)<\/g>/g)];
    const reasons: string[] = [];
    if (titleGroups.length !== 1) reasons.push(`${titleGroups.length} slot-group title (attendu 1)`);
    if (titleGroups.length === 1) {
      const inner = titleGroups[0][1];
      if (!/<rect\b[^>]*class="[^"]*slot-shape[^"]*krobar-bbox-fill[^"]*krobar-bbox-stroke[^"]*"[^>]*data-shape="bbox_title_1"/.test(inner)
        && !/<rect\b[^>]*data-shape="bbox_title_1"[^>]*class="[^"]*slot-shape[^"]*krobar-bbox-fill[^"]*krobar-bbox-stroke[^"]*"/.test(inner))
        reasons.push('rect slot-shape bbox_title_1 manquant ou classes incomplètes');
      if (!/<foreignObject\b[^>]*class="slot-label"[\s\S]*?class="slot-content"[\s\S]*?\{\{title\}\}/.test(inner))
        reasons.push("foreignObject slot-label + slot-content + {{title}} manquant");
    }
    push(3, "Structure slot-group titre", reasons.length === 0, reasons.join(" · ") || undefined);
  }

  // Check 4 — Slot-groups quadrants
  const quadrantGroups = [...svg.matchAll(/<g\b[^>]*class="slot-group"[^>]*data-slot-key="quadrant(?:_\d+)?"[^>]*>([\s\S]*?)<\/g>/g)];
  {
    const reasons: string[] = [];
    if (quadrantGroups.length !== 4) reasons.push(`${quadrantGroups.length} slot-group quadrant (attendu 4)`);
    const seenN: number[] = [];
    for (const m of quadrantGroups) {
      const inner = m[1];
      const rectClassOk = /<rect\b[^>]*class="[^"]*\bslot-shape\b[^"]*\bkrobar-bbox-fill\b[^"]*\bkrobar-bbox-stroke\b[^"]*"/.test(inner)
        || /<rect\b[^>]*class="[^"]*\bkrobar-bbox-fill\b[^"]*\bslot-shape\b[^"]*\bkrobar-bbox-stroke\b[^"]*"/.test(inner)
        || /<rect\b[^>]*class="[^"]*\bkrobar-bbox-fill\b[^"]*\bkrobar-bbox-stroke\b[^"]*\bslot-shape\b[^"]*"/.test(inner);
      const ds = inner.match(/data-shape="bbox_quadrant_(\d+)"/);
      const placeholderN = inner.match(/\{\{quadrant_(\d+)\}\}/);
      if (!rectClassOk) { reasons.push("un quadrant: rect.slot-shape classes incomplètes"); continue; }
      if (!ds) { reasons.push("un quadrant: data-shape bbox_quadrant_N manquant"); continue; }
      if (!placeholderN) { reasons.push("un quadrant: {{quadrant_N}} manquant"); continue; }
      const n1 = parseInt(ds[1], 10);
      const n2 = parseInt(placeholderN[1], 10);
      if (n1 !== n2) reasons.push(`incohérence: bbox_quadrant_${n1} vs {{quadrant_${n2}}}`);
      else seenN.push(n1);
    }
    const expected = [1, 2, 3, 4];
    const sortedSeen = [...seenN].sort();
    if (JSON.stringify(sortedSeen) !== JSON.stringify(expected)) {
      reasons.push(`numérotation quadrants = [${sortedSeen.join(",")}] (attendu 1..4 sans doublon)`);
    }
    push(4, "Structure slot-groups quadrants", reasons.length === 0, reasons.join(" · ") || undefined);
  }

  // Check 5 — Canonical-labels
  const canonicalGroups = [...svg.matchAll(/<g\b[^>]*class="canonical-label"[^>]*data-for-shape="([^"]+)"[^>]*>([\s\S]*?)<\/g>/g)];
  {
    const reasons: string[] = [];
    if (canonicalGroups.length !== 4) reasons.push(`${canonicalGroups.length} canonical-label (attendu 4)`);
    const seenN: number[] = [];
    const allDataShapes = [...svg.matchAll(/data-shape="([^"]+)"/g)].map((m) => m[1]);
    for (const m of canonicalGroups) {
      const target = m[1];
      const inner = m[2];
      const targetMatch = target.match(/^bbox_quadrant_(\d+)$/);
      if (!targetMatch) { reasons.push(`data-for-shape="${target}" hors format bbox_quadrant_N`); continue; }
      if (!allDataShapes.includes(target)) reasons.push(`data-for-shape="${target}" ne correspond à aucun slot-group`);
      const n = parseInt(targetMatch[1], 10);
      const hasFO = /<foreignObject\b[\s\S]*?class="canonical-label-content"[\s\S]*?\{\{canonical_(\d+)\}\}/.exec(inner);
      if (!hasFO) { reasons.push(`canonical-label N=${n}: foreignObject + {{canonical_N}} manquant`); continue; }
      if (parseInt(hasFO[1], 10) !== n) reasons.push(`canonical-label data-for-shape=${target} mais placeholder {{canonical_${hasFO[1]}}}`);
      else seenN.push(n);
    }
    const sortedSeen = [...seenN].sort();
    if (JSON.stringify(sortedSeen) !== JSON.stringify([1, 2, 3, 4])) {
      reasons.push(`numérotation canonical = [${sortedSeen.join(",")}] (attendu 1..4)`);
    }
    push(5, "Canonical-labels présents et liés", reasons.length === 0, reasons.join(" · ") || undefined);
  }

  // Check 6 — classes color-ready
  {
    const reasons: string[] = [];
    const slotShapeRects = [...svg.matchAll(/<rect\b[^>]*class="([^"]*\bslot-shape\b[^"]*)"/g)];
    for (const m of slotShapeRects) {
      const cls = m[1];
      if (!/\bkrobar-bbox-fill\b/.test(cls) || !/\bkrobar-bbox-stroke\b/.test(cls)) {
        reasons.push(`rect slot-shape sans krobar-bbox-fill/stroke (classes="${cls}")`);
      }
    }
    push(6, "Classes color-ready présentes", reasons.length === 0, reasons.join(" · ") || undefined);
  }

  // Check 7 — Palette B&W stricte
  {
    const reasons: string[] = [];
    const hexes = [...svg.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0].toLowerCase());
    for (const h of hexes) {
      // expand 3-digit
      const norm = h.length === 4 ? "#" + h.slice(1).split("").map((c) => c + c).join("") : h.length === 7 ? h : null;
      if (!norm || !ALLOWED_HEX.has(norm)) reasons.push(`hex non autorisé: ${h}`);
    }
    if (/var\(--(primary|accent|secondary|muted|destructive|ring|background|foreground)/i.test(svg)) {
      reasons.push("var(--*) de palette détectée");
    }
    // Strip namespace URL before searching for color words
    const stripped = svg.replace(/xmlns:[a-z]+="[^"]*"/gi, "");
    for (const w of FORBIDDEN_COLOR_WORDS) {
      if (new RegExp(`\\b${w}\\b`, "i").test(stripped)) reasons.push(`mot interdit: ${w}`);
    }
    // dedupe reasons
    const uniq = Array.from(new Set(reasons));
    push(7, "Palette B&W stricte", uniq.length === 0, uniq.slice(0, 5).join(" · ") || undefined);
  }
  // Check 8 — Pas de <text> natif
  {
    const reasons: string[] = [];
    if (/<text\b/i.test(svg)) reasons.push("<text> détecté");
    if (/<tspan\b/i.test(svg)) reasons.push("<tspan> détecté");
    push(8, "Pas de <text> natif SVG", reasons.length === 0, reasons.join(" · ") || undefined);
  }

  // Check 9 — ViewBox 4:3 strict
  {
    const root = svg.match(/<svg\b[^>]*>/i)?.[0] ?? "";
    const m = root.match(/viewBox="([^"]+)"/);
    const got = m?.[1] ?? "(absent)";
    const ok = got === "0 0 1024 768";
    push(9, "ViewBox 4:3 strict", ok, ok ? undefined : `Trouvé viewBox='${got}', attendu '0 0 1024 768'`);
  }

  // Check 10 — Non-chevauchement géométrique
  {
    type Rect = { id: string; x: number; y: number; w: number; h: number };
    const overlap = (a: Rect, b: Rect) =>
      a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

    const slotShapes: Rect[] = [];
    const rectRe = /<rect\b([^>]*)\/?>/g;
    let rm: RegExpExecArray | null;
    while ((rm = rectRe.exec(svg)) !== null) {
      const attrs = rm[1];
      if (!/\bclass="[^"]*\bslot-shape\b/.test(attrs)) continue;
      const ds = attrs.match(/data-shape="([^"]+)"/)?.[1];
      const x = parseFloat(attrs.match(/\bx="([^"]+)"/)?.[1] ?? "NaN");
      const y = parseFloat(attrs.match(/\by="([^"]+)"/)?.[1] ?? "NaN");
      const w = parseFloat(attrs.match(/\bwidth="([^"]+)"/)?.[1] ?? "NaN");
      const h = parseFloat(attrs.match(/\bheight="([^"]+)"/)?.[1] ?? "NaN");
      if (ds && [x, y, w, h].every((n) => !isNaN(n))) slotShapes.push({ id: ds, x, y, w, h });
    }

    const canonicalRects: Array<Rect & { forShape: string }> = [];
    const canonGroupRe = /<g\b[^>]*class="canonical-label"[^>]*data-for-shape="([^"]+)"[^>]*>([\s\S]*?)<\/g>/g;
    let cgm: RegExpExecArray | null;
    while ((cgm = canonGroupRe.exec(svg)) !== null) {
      const forShape = cgm[1];
      const inner = cgm[2];
      const fo = inner.match(/<foreignObject\b([^>]*)>/);
      if (!fo) continue;
      const attrs = fo[1];
      const x = parseFloat(attrs.match(/\bx="([^"]+)"/)?.[1] ?? "NaN");
      const y = parseFloat(attrs.match(/\by="([^"]+)"/)?.[1] ?? "NaN");
      const w = parseFloat(attrs.match(/\bwidth="([^"]+)"/)?.[1] ?? "NaN");
      const h = parseFloat(attrs.match(/\bheight="([^"]+)"/)?.[1] ?? "NaN");
      if ([x, y, w, h].every((n) => !isNaN(n))) {
        canonicalRects.push({ id: `canonical(${forShape})`, forShape, x, y, w, h });
      }
    }

    const reasons: string[] = [];
    for (let i = 0; i < slotShapes.length; i++) {
      for (let j = i + 1; j < slotShapes.length; j++) {
        const a = slotShapes[i], b = slotShapes[j];
        // Title bbox has fill=none — but still must not overlap quadrants geometrically.
        if (overlap(a, b)) {
          reasons.push(`slot-shape ${a.id} (x=${a.x},y=${a.y},w=${a.w},h=${a.h}) chevauche slot-shape ${b.id} (x=${b.x},y=${b.y},w=${b.w},h=${b.h})`);
        }
      }
    }
    for (const c of canonicalRects) {
      for (const s of slotShapes) {
        if (s.id === c.forShape) continue;
        if (overlap(c, s)) {
          reasons.push(`canonical-label data-for-shape='${c.forShape}' (y=${c.y},h=${c.h}) chevauche slot-shape '${s.id}' (y=${s.y},h=${s.h})`);
        }
      }
    }
    push(10, "Non-chevauchement géométrique", reasons.length === 0, reasons.slice(0, 5).join(" · ") || undefined);
  }

  return results;
}
}



// ============================================================
// LEGACY MODE prompt (kept for backward compat with current UI)
// ============================================================

const LEGACY_SYSTEM = `Tu es un illustrateur de diagrammes business. Tu produis UNIQUEMENT un fichier SVG valide, sans aucun texte autour, sans markdown, sans explication.
Contraintes :
- Format <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1040 600"> avec font-family="Plus Jakarta Sans, system-ui, sans-serif".
- Design éditorial Krobar : STRICTEMENT NOIR & BLANC, palette: #ffffff, #0f172a, #000000, #f1f5f9, #e2e8f0, #cbd5e1, #94a3b8, #64748b.
- Libellés dans <foreignObject><div data-slot="...">.
- Titres canoniques à l'extérieur des zones de saisie, intérieur vide.`;

// ============================================================
// HANDLER
// ============================================================

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY missing" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { archetype, name, category, usage, comment, model } = body ?? {};

    const isSkeletonMode = typeof archetype === "string" && archetype.length > 0;

    let sys: string;
    let user: string;

    if (isSkeletonMode) {
      sys = skeletonSystemPrompt(archetype);
      user = `Génère le squelette SVG-KR pour l'archétype "${archetype}". Conforme strictement aux conventions. Réponds avec le code SVG uniquement.`;
    } else {
      if (!name || typeof name !== "string") {
        return new Response(JSON.stringify({ error: "name or archetype required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      sys = LEGACY_SYSTEM;
      user = `Crée le SVG de : ${name} (${category ?? ""}). Usage : ${usage ?? ""}. ${comment ? `Directives: ${comment}` : ""}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 140_000);

    let resp: Response;
    try {
      resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        },
        body: JSON.stringify({
          model: model || "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: sys },
            { role: "user", content: user },
          ],
        }),
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timeoutId);
      const aborted = (e as any)?.name === "AbortError";
      return new Response(JSON.stringify({
        error: aborted ? "Timeout IA (140s)." : (e instanceof Error ? e.message : String(e)),
      }), {
        status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    clearTimeout(timeoutId);

    if (!resp.ok) {
      const t = await resp.text();
      return new Response(JSON.stringify({ error: `AI gateway ${resp.status}: ${t.slice(0, 500)}` }), {
        status: resp.status === 429 || resp.status === 402 ? resp.status : 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const text = data?.choices?.[0]?.message?.content ?? "";
    const svg = extractSvg(text);
    if (!svg) {
      return new Response(JSON.stringify({ error: "No <svg> in response", raw: text.slice(0, 1000) }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (isSkeletonMode) {
      const results = audit(svg, archetype);
      const passed = results.filter((r) => r.ok).length;
      const failed = results.filter((r) => !r.ok);
      console.log(`[generate-matrix-svg] audit ${archetype}: ${passed}/10 passed, failed: [${failed.map((f) => f.id).join(", ")}]`);
      if (failed.length === 0) {
        return new Response(JSON.stringify({
          status: "valid", checks_passed: 10, checks_failed: 0, svg,

        }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({
        status: "invalid",
        checks_passed: passed,
        checks_failed: failed.length,
        failed_checks: failed.map((f) => ({ id: f.id, name: f.name, reason: f.reason ?? "" })),
        svg: null,
        raw_svg: svg, // for debugging only — not consumed when valid
      }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Legacy mode response
    return new Response(JSON.stringify({ svg }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
