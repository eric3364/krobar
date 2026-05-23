// One-shot migration: prefix all existing sicai-assets Storage paths with
// "neutre/" (the default theme). Idempotent: skips files already prefixed by
// any known theme code. Also rewrites DB paths (sicai_assets,
// sicai_archetypes).
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

const BUCKET = "sicai-assets";
const FOLDERS = ["png_master", "png_normalized", "svg_final", "thumbnails"];
const DEFAULT_THEME = "neutre";
const BATCH = 50;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), {
    status: s, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

  // Auth: admin only
  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: u } = await userClient.auth.getUser();
  if (!u?.user) return json({ error: "unauthorized" }, 401);
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: role } = await admin.from("user_roles")
    .select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
  if (!role) return json({ error: "forbidden" }, 403);

  // Load known theme codes for idempotency check
  const { data: themes } = await admin.from("sicai_themes").select("code");
  const knownThemes = new Set((themes ?? []).map((t) => t.code));
  if (!knownThemes.has(DEFAULT_THEME)) {
    return json({ error: `default theme '${DEFAULT_THEME}' not seeded` }, 500);
  }

  const body = await req.json().catch(() => ({} as any));
  const background = body?.background !== false; // default: run in background

  const result: any = { moved: 0, skipped: 0, errors: 0, by_folder: {}, error_details: [] };

  for (const folder of FOLDERS) {
    const fStats = { moved: 0, skipped: 0, errors: 0, total: 0 };
    // Paginated list
    let offset = 0;
    const all: string[] = [];
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data: files, error } = await admin.storage.from(BUCKET).list(folder, {
        limit: 1000, offset, sortBy: { column: "name", order: "asc" },
      });
      if (error) {
        result.error_details.push({ folder, op: "list", error: error.message });
        fStats.errors++;
        break;
      }
      if (!files || files.length === 0) break;
      for (const f of files) {
        // skip "folders" (no id) and empty
        if (!f.name) continue;
        all.push(`${folder}/${f.name}`);
      }
      if (files.length < 1000) break;
      offset += 1000;
    }
    fStats.total = all.length;

    // Move in batches of 50, sequential
    for (let i = 0; i < all.length; i += BATCH) {
      const chunk = all.slice(i, i + BATCH);
      for (const oldPath of chunk) {
        // Idempotency: skip if first segment is a known theme code
        const firstSeg = oldPath.split("/")[0];
        if (knownThemes.has(firstSeg)) {
          fStats.skipped++;
          result.skipped++;
          continue;
        }
        const newPath = `${DEFAULT_THEME}/${oldPath}`;
        const { error: mvErr } = await admin.storage.from(BUCKET).move(oldPath, newPath);
        if (mvErr) {
          fStats.errors++;
          result.errors++;
          result.error_details.push({ folder, path: oldPath, error: mvErr.message });
          continue;
        }
        fStats.moved++;
        result.moved++;
      }
    }
    result.by_folder[folder] = fStats;
  }

  // DB path rewrites (idempotent: only rows not yet prefixed by a known theme)
  // We use simple prefix matching against each folder root.
  const dbUpdates = { sicai_assets: 0, sicai_archetypes_svg: 0, sicai_archetypes_thumb: 0 };
  for (const folder of FOLDERS) {
    // sicai_assets.storage_path
    const { data: rows, error: selErr } = await admin.from("sicai_assets")
      .select("id, storage_path").like("storage_path", `${folder}/%`);
    if (selErr) {
      result.error_details.push({ table: "sicai_assets", op: "select", error: selErr.message });
    } else {
      for (const r of rows ?? []) {
        const newPath = `${DEFAULT_THEME}/${r.storage_path}`;
        const { error: upErr } = await admin.from("sicai_assets")
          .update({ storage_path: newPath }).eq("id", r.id);
        if (upErr) result.error_details.push({ table: "sicai_assets", id: r.id, error: upErr.message });
        else dbUpdates.sicai_assets++;
      }
    }
  }

  // sicai_archetypes svg_storage_path / thumbnail_storage_path
  for (const folder of FOLDERS) {
    const { data: rowsSvg } = await admin.from("sicai_archetypes")
      .select("id, svg_storage_path").like("svg_storage_path", `${folder}/%`);
    for (const r of rowsSvg ?? []) {
      const np = `${DEFAULT_THEME}/${r.svg_storage_path}`;
      const { error } = await admin.from("sicai_archetypes")
        .update({ svg_storage_path: np }).eq("id", r.id);
      if (!error) dbUpdates.sicai_archetypes_svg++;
    }
    const { data: rowsThumb } = await admin.from("sicai_archetypes")
      .select("id, thumbnail_storage_path").like("thumbnail_storage_path", `${folder}/%`);
    for (const r of rowsThumb ?? []) {
      const np = `${DEFAULT_THEME}/${r.thumbnail_storage_path}`;
      const { error } = await admin.from("sicai_archetypes")
        .update({ thumbnail_storage_path: np }).eq("id", r.id);
      if (!error) dbUpdates.sicai_archetypes_thumb++;
    }
  }
  result.db_updates = dbUpdates;

  return json(result);
});
