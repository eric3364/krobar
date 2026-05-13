import { adminFetch } from "@/lib/adminApi";
import type { LucideCatalog } from "@/types/lucide";

// Le catalogue Lucide est public côté backend mais on passe par le même proxy
// `krobar-proxy` que le reste de l'application pour éviter les problèmes CORS.

export function getLucideCatalog(): Promise<LucideCatalog> {
  return adminFetch<LucideCatalog>("/lucide/catalog", { method: "GET" });
}

export async function getLucideIconSvg(name: string): Promise<string> {
  const res = await adminFetch<{ svg: string } | string>(
    `/lucide/icon/${encodeURIComponent(name)}`,
    { method: "GET" },
  );
  if (typeof res === "string") return res;
  return res.svg;
}
