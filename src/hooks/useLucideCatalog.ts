import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getLucideCatalog } from "@/api/lucide";
import type { LucideIconMetadata } from "@/types/lucide";

const QUERY_KEY = ["lucide-catalog"] as const;

export function useLucideCatalog() {
  const { data, isLoading, error } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: getLucideCatalog,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const icons = useMemo<LucideIconMetadata[]>(() => {
    if (!data?.icons) return [];
    return Object.values(data.icons);
  }, [data]);

  const search = useCallback(
    (query: string): LucideIconMetadata[] => {
      const q = query.trim().toLowerCase();
      if (!q) return icons;
      return icons.filter((icon) => {
        if (icon.name.toLowerCase().includes(q)) return true;
        if (icon.tags?.some((t) => t.toLowerCase().includes(q))) return true;
        if (icon.aliases?.some((a) => a.toLowerCase().includes(q))) return true;
        if (icon.categories?.some((c) => c.toLowerCase().includes(q))) return true;
        return false;
      });
    },
    [icons],
  );

  const filterByCategory = useCallback(
    (category: string): LucideIconMetadata[] => {
      return icons.filter((icon) => icon.categories?.includes(category));
    },
    [icons],
  );

  return {
    icons,
    isLoading,
    error: (error as Error | null) ?? null,
    search,
    filterByCategory,
  };
}
