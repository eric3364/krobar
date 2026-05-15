import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getFeatureFlags, updateFeatureFlags } from "@/api/featureFlags";
import type { FeatureFlagMeta } from "@/types/featureFlags";

const QUERY_KEY = ["feature-flags"] as const;

type NewShapeEntry = {
  value: unknown;
  type: string;
  description?: string;
  values?: string[];
};

function isNewShape(data: unknown): data is Record<string, NewShapeEntry> {
  if (!data || typeof data !== "object") return false;
  const obj = data as Record<string, unknown>;
  // New shape : pas de _meta, et au moins une entrée { value, type }
  if ("_meta" in obj) return false;
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object" && "value" in (v as object) && "type" in (v as object)) {
      return true;
    }
  }
  return false;
}

export function useFeatureFlags() {
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: getFeatureFlags,
    staleTime: 30_000,
  });

  let flags: Record<string, unknown> = {};
  let meta: Record<string, FeatureFlagMeta> = {};

  if (data) {
    if (isNewShape(data)) {
      for (const [k, entry] of Object.entries(data)) {
        flags[k] = entry.value;
        meta[k] = {
          type: entry.type as FeatureFlagMeta["type"],
          values: entry.values,
          default: entry.value,
          description: entry.description ?? "",
        };
      }
    } else {
      // Ancien format avec _meta
      const d = data as Record<string, unknown> & { _meta?: Record<string, FeatureFlagMeta> };
      meta = d._meta ?? {};
      const { _meta: _m, ...rest } = d;
      flags = rest as Record<string, unknown>;
    }
  }

  return {
    flags,
    meta,
    isLoading,
    error: (error as Error | null) ?? null,
    refresh: () => refetch(),
    update: async (partial: Record<string, unknown>) => {
      const next = await updateFeatureFlags(partial);
      qc.setQueryData(QUERY_KEY, next);
      return next;
    },
  };
}
