// Shared helpers: admin auth check + service client builder for SICAI edge functions.
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE);
}

/** Returns admin client + user id, or a Response to short-circuit. */
export async function requireAdmin(req: Request): Promise<
  { admin: SupabaseClient; userId: string } | Response
> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return jsonResponse({ error: "unauthorized" }, 401);
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data } = await userClient.auth.getUser();
  if (!data?.user) return jsonResponse({ error: "unauthorized" }, 401);
  const admin = adminClient();
  const { data: roleRow } = await admin.from("user_roles")
    .select("role").eq("user_id", data.user.id).eq("role", "admin").maybeSingle();
  if (!roleRow) return jsonResponse({ error: "forbidden" }, 403);
  return { admin, userId: data.user.id };
}

export const OPENAI_MODEL = "gpt-image-1.5";
export const OPENAI_SIZE = "1536x1024";
export const OPENAI_WIDTH = 1536;
export const OPENAI_HEIGHT = 1024;
export const COST_SYNC = 0.04;
export const COST_BATCH = 0.02;

export function buildOpenAIBody(prompt: string, batchId: string) {
  return {
    model: OPENAI_MODEL,
    prompt,
    size: OPENAI_SIZE,
    quality: "medium",
    output_format: "png",
    moderation: "auto",
    n: 1,
    user: `sicai-admin:${batchId}`,
  };
}

export function slugifyCustomId(seq: number, illustrationId: string, batchId?: string): string {
  const slug = illustrationId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const suffix = batchId ? `-${batchId.replace(/-/g, "").slice(0, 8)}` : "";
  return `sicai-${String(seq).padStart(3, "0")}-${slug}${suffix}`;
}

export async function sha256(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ─────────────────────────────────────────────────────────────
// Theme helpers (Phase A — multi-thèmes)
// ─────────────────────────────────────────────────────────────

export type ThemeRow = {
  id: string;
  code: string;
  label_fr: string;
  description: string | null;
  visual_lexicon: Record<string, string[]> | null;
  constraints: string | null;
  cell_briefs: Record<string, string> | null;
  prompt_bloc_addition: string | null;
};

export type StorageKind = "png_master" | "png_normalized" | "svg_final" | "thumbnails";

const EXT: Record<StorageKind, string> = {
  png_master: "png", png_normalized: "png", svg_final: "svg", thumbnails: "png",
};

export function themedPath(themeCode: string | null | undefined, kind: StorageKind, jobId: string): string {
  const code = themeCode && themeCode.length > 0 ? themeCode : "neutre";
  return `${code}/${kind}/${jobId}.${EXT[kind]}`;
}

/**
 * Build the "[Bloc 0.5 — Univers thématique imposé]" string from a theme.
 * Returns null when nothing should be injected (regression-zero for `neutre`):
 *   - prompt_bloc_addition is non-empty → use it verbatim
 *   - else generate from visual_lexicon + constraints
 *   - if both are effectively empty → return null
 */
export function buildBloc05(theme: ThemeRow | null | undefined): string | null {
  if (!theme) return null;
  const manual = (theme.prompt_bloc_addition ?? "").trim();
  if (manual.length > 0) return manual;

  const lex = theme.visual_lexicon ?? {};
  const constraints = (theme.constraints ?? "").trim();
  const equipments = (lex.equipments ?? []).filter(Boolean);
  const scenes = (lex.scenes ?? []).filter(Boolean);
  const gestures = (lex.gestures ?? []).filter(Boolean);
  const characters = (lex.characters ?? []).filter(Boolean);
  const metaphors = (lex.abstract_metaphors ?? []).filter(Boolean);
  const anyLex = equipments.length + scenes.length + gestures.length +
    characters.length + metaphors.length > 0;
  if (!anyLex && !constraints) return null;

  const lines: string[] = [];
  lines.push(`[Bloc 0.5 — Univers thématique imposé : ${theme.label_fr}]`);
  const desc = (theme.description ?? "").trim();
  if (desc) lines.push(desc);
  if (anyLex) {
    lines.push("");
    lines.push("Lexique visuel à privilégier exclusivement :");
    if (equipments.length) lines.push(`- Équipements/objets : ${equipments.join(", ")}`);
    if (scenes.length) lines.push(`- Lieux/scènes : ${scenes.join(", ")}`);
    if (gestures.length) lines.push(`- Gestes/actions : ${gestures.join(", ")}`);
    if (characters.length) lines.push(`- Personnages : ${characters.join(", ")}`);
    if (metaphors.length) lines.push(`- Métaphores abstraites (pour régime systémique) : ${metaphors.join(", ")}`);
  }
  if (constraints) {
    lines.push("");
    lines.push(`Contraintes spécifiques au domaine : ${constraints}`);
  }
  lines.push("");
  lines.push(
    "Rappel : le régime représentationnel et la cardinalité (voir Bloc 2) " +
    "restent prioritaires sur le domaine thématique. La charte graphique B&W " +
    "éditoriale (Bloc 3) reste strictement identique. Les zones placeholder " +
    "(Bloc 0) doivent rester strictement vides.",
  );
  return lines.join("\n");
}

/** Inject Bloc 0.5 between Bloc 0 and Bloc 1. Byte-identical passthrough if bloc05 is null. */
export function injectBloc05(promptFull: string, bloc05: string | null): string {
  if (!bloc05) return promptFull;
  const marker = "\n\n[Bloc 1 ";
  const idx = promptFull.indexOf(marker);
  if (idx < 0) return promptFull; // safety: don't mangle if structure unexpected
  return promptFull.slice(0, idx) + "\n\n" + bloc05 + promptFull.slice(idx);
}

/** Append a "Brief thématique : ..." line inside Bloc 2 if an override exists. */
export function applyCellBriefOverride(
  promptFull: string,
  illustrationId: string,
  cellBriefs: Record<string, string> | null | undefined,
): string {
  if (!cellBriefs) return promptFull;
  const brief = (cellBriefs[illustrationId] ?? "").trim();
  if (!brief) return promptFull;
  // Insert right after the "Régime : ..." line of Bloc 2, before the rule de placement.
  const lines = promptFull.split("\n");
  const regimeIdx = lines.findIndex((l) => /^Régime\s*:/.test(l));
  if (regimeIdx < 0) return promptFull;
  lines.splice(regimeIdx + 1, 0, `Brief thématique : ${brief}`);
  return lines.join("\n");
}

/** Convenience: full theme application pipeline. */
export function resolveThemedPrompt(
  promptFull: string,
  illustrationId: string,
  theme: ThemeRow | null | undefined,
): string {
  if (!theme) return promptFull;
  return applyCellBriefOverride(
    injectBloc05(promptFull, buildBloc05(theme)),
    illustrationId,
    theme.cell_briefs,
  );
}

