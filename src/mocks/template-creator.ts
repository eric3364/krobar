// Mocks pour l'atelier de création de templates.
// Activé via VITE_USE_TEMPLATE_CREATOR_MOCKS=true (par défaut: true tant que le backend n'est pas prêt).
// Simule les endpoints /api/admin/template/{generate,preview,refine,validate,deploy}.

export type SlotRole = {
  id: string;
  label: string;
  type: "unique" | "repeated";
  placement?: string;
  min?: number;
  max?: number;
};

export type GeneratePayload = {
  mode: "description" | "image" | "both";
  description?: string;
  image_base64?: string;
  image_mime_type?: string;
  name: string;
  display_name: string;
  slots: SlotRole[];
  category: string;
  description_short: string;
  best_for?: string;
  textual_markers_seed?: string;
  cardinality_mode: "variants" | "optional_groups" | "fixed_decor_pool";
};

export type GenerateResponse = {
  draft_id: string;
  svg: string;
  manifest_entry: Record<string, unknown>;
  suggested_markers: string[];
  variants?: { cardinality: number; svg: string }[];
  warnings?: string[];
};

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function uuid() {
  return "draft_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// SVG factice illustrant la composition demandée.
function mockSvg(payload: GeneratePayload, cardinality?: number): string {
  const repeated = payload.slots.find((s) => s.type === "repeated");
  const unique = payload.slots.find((s) => s.type === "unique");
  const n = cardinality ?? Math.max(repeated?.min ?? 4, 4);
  const cx = 300;
  const cy = 250;
  const r = 140;

  const items: string[] = [];
  for (let i = 0; i < n; i++) {
    const angle = (i * 2 * Math.PI) / n - Math.PI / 2;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    items.push(
      `<g class="slot-group" data-slot-key="${repeated?.id ?? "item"}_${i + 1}">
        <circle cx="${x}" cy="${y}" r="48" fill="hsl(var(--accent, 220 80% 60%))" opacity="0.15" stroke="hsl(var(--accent, 220 80% 60%))" stroke-width="1.5"/>
        <foreignObject x="${x - 42}" y="${y - 18}" width="84" height="36">
          <div xmlns="http://www.w3.org/1999/xhtml" style="font:500 11px system-ui;color:#1f2937;text-align:center;line-height:1.2;display:flex;align-items:center;justify-content:center;height:100%;">
            ${repeated?.label ?? "Item"} ${i + 1}
          </div>
        </foreignObject>
      </g>`,
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 500" style="--primary:#0F2A44;--accent:#2563EB;--bg:#FAFAF9;background:#FAFAF9;">
    <rect width="600" height="500" fill="#FAFAF9"/>
    <text x="300" y="30" text-anchor="middle" font-family="system-ui" font-size="11" fill="#6B7280">[mock] ${payload.display_name}</text>
    <circle cx="${cx}" cy="${cy}" r="62" fill="hsl(var(--primary, 220 80% 20%))" opacity="0.12" stroke="hsl(var(--primary, 220 80% 20%))" stroke-width="2"/>
    <g class="slot-group" data-slot-key="${unique?.id ?? "title"}">
      <foreignObject x="${cx - 56}" y="${cy - 22}" width="112" height="44">
        <div xmlns="http://www.w3.org/1999/xhtml" style="font:600 13px system-ui;color:#0F2A44;text-align:center;line-height:1.2;display:flex;align-items:center;justify-content:center;height:100%;">
          ${unique?.label ?? "Titre"}
        </div>
      </foreignObject>
    </g>
    ${items.join("\n")}
  </svg>`;
}

export async function mockGenerate(payload: GeneratePayload): Promise<GenerateResponse> {
  // Simule 30-90s : on raccourcit à ~3.5s pour ne pas bloquer le test UX.
  await delay(3500);

  const repeated = payload.slots.find((s) => s.type === "repeated");
  const variants =
    payload.cardinality_mode === "variants" && repeated
      ? Array.from({ length: (repeated.max ?? 6) - (repeated.min ?? 3) + 1 }, (_, i) => {
          const c = (repeated.min ?? 3) + i;
          return { cardinality: c, svg: mockSvg(payload, c) };
        })
      : undefined;

  const baseSvg = mockSvg(payload, repeated?.min);

  // Marqueurs déduits naïvement de la description.
  const seed = (payload.textual_markers_seed || payload.description_short || "").toLowerCase();
  const candidates = ["incarne", "rayonner", "se déploie", "facettes", "pivote", "structure", "déclinaison", "cycle", "tension", "convergence"];
  const suggested_markers = candidates.filter((c) => seed.includes(c.split(" ")[0])).slice(0, 5);
  const finalMarkers =
    suggested_markers.length >= 3
      ? suggested_markers
      : [...new Set([...suggested_markers, "incarne", "rayonner", "facettes", "déclinaison", "structure"])].slice(0, 5);

  return {
    draft_id: uuid(),
    svg: baseSvg,
    manifest_entry: {
      id: payload.name,
      name: payload.display_name,
      category: payload.category,
      description: payload.description_short,
      best_for: payload.best_for ?? "",
      file: `${payload.name}.svg`,
      slots: payload.slots.flatMap((s) =>
        s.type === "unique" ? [s.id] : Array.from({ length: s.max ?? 6 }, (_, i) => `${s.id}_${i + 1}`),
      ),
      cardinality_mode: payload.cardinality_mode,
    },
    suggested_markers: finalMarkers,
    variants,
    warnings:
      payload.cardinality_mode === "optional_groups" && repeated && (repeated.max ?? 0) - (repeated.min ?? 0) > 4
        ? ["Plage de cardinalité large : risque de trous visuels avec slot-groups optionnels."]
        : undefined,
  };
}

export async function mockPreview(args: {
  draft_id: string;
  sample_text: string;
  palette: Record<string, string>;
  force_cardinality?: number;
}): Promise<{ rendered_svg: string; detected_cardinality: number; filled_slots: Record<string, string> }> {
  await delay(700);
  const items = args.sample_text.split(/[\n.;•·-]+/).map((s) => s.trim()).filter(Boolean);
  const card = args.force_cardinality ?? Math.min(Math.max(items.length, 3), 8);
  return {
    rendered_svg: mockSvg(
      { name: "preview", display_name: "Preview", slots: [{ id: "title", type: "unique", label: "Titre" }, { id: "item", type: "repeated", label: "Item", min: card, max: card }], category: "concept", description_short: "", cardinality_mode: "variants", mode: "description" },
      card,
    ),
    detected_cardinality: card,
    filled_slots: { title: items[0] ?? "Titre", ...Object.fromEntries(items.slice(1, card + 1).map((t, i) => [`item_${i + 1}`, t])) },
  };
}

export async function mockRefine(args: { draft_id: string; feedback: string; payload: GeneratePayload }): Promise<GenerateResponse> {
  await delay(2500);
  const r = await mockGenerate(args.payload);
  return { ...r, warnings: [`Affinage appliqué (mock) : "${args.feedback.slice(0, 60)}"`] };
}

export async function mockValidate(_draft_id: string): Promise<{ valid: boolean; issues: { severity: "error" | "warning"; field: string; message: string }[] }> {
  await delay(500);
  return { valid: true, issues: [] };
}

export async function mockDeploy(draft_id: string): Promise<{ deployed: true; template_id: string; manifest_url: string }> {
  await delay(800);
  return { deployed: true, template_id: draft_id, manifest_url: "https://krobar.online/api/templates" };
}
