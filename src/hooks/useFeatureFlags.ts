import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getFeatureFlags, updateFeatureFlags } from "@/api/featureFlags";
import type { FeatureFlagMeta, FeatureFlagsResponse } from "@/types/featureFlags";

const QUERY_KEY = ["feature-flags"] as const;

export function useFeatureFlags() {
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: getFeatureFlags,
    staleTime: 30_000,
  });

  const meta: Record<string, FeatureFlagMeta> = data?._meta ?? {};
  const flags: Record<string, unknown> = (() => {
    if (!data) return {};
    const { _meta: _m, ...rest } = data as FeatureFlagsResponse;
    return rest;
  })();

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
