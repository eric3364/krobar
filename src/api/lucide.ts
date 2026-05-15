// Catalogue Lucide & rendu SVG : appels au backend krobar.online via le proxy
// edge `krobar-proxy`.
//
// Endpoints :
//   GET /api/lucide/catalog       → JSON { version, icons: [...] }   (cache 24h)
//   GET /api/lucide/icon/<name>   → SVG brut (proxy la wrappe en {svg})  (cache 7j)

import { supabase } from "@/integrations/supabase/client";
import type { LucideCatalog, LucideIconMetadata } from "@/types/lucide";

const CATALOG_LS_KEY = "krobar:lucide:catalog:v1";
const SVG_LS_PREFIX = "krobar:lucide:svg:";
const CATALOG_TTL_MS = 24 * 60 * 60 * 1000; // 24 h

type BackendIconMeta = {
  tags?: string[];
  categories?: string[];
  aliases?: string[];
};

type BackendCatalog = {
  version?: string;
  total?: number;
  // Le backend renvoie un OBJET { name: meta }, pas un tableau.
  icons?: Record<string, BackendIconMeta>;
  synonyms_fr?: Record<string, unknown>;
};

let _catalogCached: LucideCatalog | null = null;
let _catalogPromise: Promise<LucideCatalog> | null = null;

async function proxyGet<T = unknown>(path: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke("krobar-proxy", {
    body: { path, method: "GET" },
  });
  if (error) throw new Error(error.message ?? "Erreur de communication avec le proxy");
  if (data && typeof data === "object" && "error" in (data as Record<string, unknown>)) {
    const err = (data as { error?: string }).error;
    if (err) throw new Error(err);
  }
  return data as T;
}

function loadCatalogFromLs(): LucideCatalog | null {
  try {
    const raw = localStorage.getItem(CATALOG_LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { ts: number; catalog: LucideCatalog };
    if (!parsed?.catalog || Date.now() - parsed.ts > CATALOG_TTL_MS) return null;
    return parsed.catalog;
  } catch {
    return null;
  }
}

function saveCatalogToLs(catalog: LucideCatalog) {
  try {
    localStorage.setItem(CATALOG_LS_KEY, JSON.stringify({ ts: Date.now(), catalog }));
  } catch {
    /* quota — ignore */
  }
}

export async function getLucideCatalog(): Promise<LucideCatalog> {
  if (_catalogCached) return _catalogCached;
  const fromLs = loadCatalogFromLs();
  if (fromLs) {
    _catalogCached = fromLs;
    return fromLs;
  }
  if (_catalogPromise) return _catalogPromise;
  _catalogPromise = (async () => {
    const data = await proxyGet<BackendCatalog>("/lucide/catalog");
    const map: Record<string, LucideIconMetadata> = {};
    for (const [name, meta] of Object.entries(data.icons ?? {})) {
      if (!name) continue;
      map[name] = {
        name,
        tags: meta?.tags ?? [],
        categories: meta?.categories ?? [],
        aliases: meta?.aliases ?? [],
      };
    }
    const catalog: LucideCatalog = { version: data.version ?? "unknown", icons: map };
    _catalogCached = catalog;
    saveCatalogToLs(catalog);
    return catalog;
  })();
  try {
    return await _catalogPromise;
  } catch (err) {
    _catalogPromise = null;
    throw err;
  }
}

const _svgMem = new Map<string, string>();
const _svgPromises = new Map<string, Promise<string>>();

export async function getLucideIconSvg(name: string): Promise<string> {
  if (!/^[a-z0-9-]+$/.test(name)) {
    throw new Error(`Nom d'icône Lucide invalide : ${name}`);
  }
  const memHit = _svgMem.get(name);
  if (memHit) return memHit;
  try {
    const ls = localStorage.getItem(SVG_LS_PREFIX + name);
    if (ls) {
      _svgMem.set(name, ls);
      return ls;
    }
  } catch {
    /* */
  }
  const inflight = _svgPromises.get(name);
  if (inflight) return inflight;

  const p = (async () => {
    const data = await proxyGet<{ svg?: string }>(`/lucide/icon/${name}`);
    if (!data?.svg) throw new Error(`Icône Lucide inconnue : ${name}`);
    _svgMem.set(name, data.svg);
    try {
      localStorage.setItem(SVG_LS_PREFIX + name, data.svg);
    } catch {
      /* quota */
    }
    return data.svg;
  })();
  _svgPromises.set(name, p);
  try {
    return await p;
  } finally {
    _svgPromises.delete(name);
  }
}
