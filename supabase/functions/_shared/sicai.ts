// Shared helpers: admin auth check + service client builder for SICAI edge functions.
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

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

export const OPENAI_MODEL = "gpt-image-2-2026-04-21";
export const COST_SYNC = 0.04;
export const COST_BATCH = 0.02;

export function buildOpenAIBody(prompt: string, batchId: string) {
  return {
    model: OPENAI_MODEL,
    prompt,
    size: "1536x864",
    quality: "medium",
    output_format: "png",
    background: "opaque",
    moderation: "auto",
    n: 1,
    user: `sicai-admin:${batchId}`,
  };
}

export function slugifyCustomId(seq: number, illustrationId: string): string {
  const slug = illustrationId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `sicai-${String(seq).padStart(3, "0")}-${slug}`;
}

export async function sha256(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
