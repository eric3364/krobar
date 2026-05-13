import { adminFetch } from "@/lib/adminApi";
import type { FeatureFlagsResponse } from "@/types/featureFlags";

// Note : l'auth admin est gérée côté backend via la fonction edge `krobar-proxy`
// (token KROBAR_ADMIN_TOKEN injecté côté serveur). Pas besoin de header
// `x-admin-token` côté client — c'est la convention du projet.

export function getFeatureFlags(): Promise<FeatureFlagsResponse> {
  return adminFetch<FeatureFlagsResponse>("/admin/feature-flags", { method: "GET" });
}

export function updateFeatureFlags(
  partial: Record<string, unknown>,
): Promise<FeatureFlagsResponse> {
  return adminFetch<FeatureFlagsResponse>("/admin/feature-flags", {
    method: "POST",
    body: partial,
  });
}
