import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

type Quotas = Record<"free" | "basic" | "premium", number>;

export function useQuota() {
  const { user, profile } = useAuth();
  const [quotas, setQuotas] = useState<Quotas | null>(null);
  const [used, setUsed] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setUsed(0);
      setLoading(false);
      return;
    }
    const startOfMonth = new Date();
    startOfMonth.setUTCDate(1);
    startOfMonth.setUTCHours(0, 0, 0, 0);
    const [{ data: q }, { count }] = await Promise.all([
      supabase.from("plan_quotas").select("plan,monthly_limit"),
      supabase
        .from("generations")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("created_at", startOfMonth.toISOString()),
    ]);
    if (q) {
      const map = {} as Quotas;
      q.forEach((row: { plan: keyof Quotas; monthly_limit: number }) => {
        map[row.plan] = row.monthly_limit;
      });
      setQuotas(map);
    }
    setUsed(count ?? 0);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const limit = quotas && profile ? quotas[profile.plan] : 0;
  const remaining = Math.max(0, limit - used);
  const canGenerate = Boolean(profile?.is_active) && remaining > 0;

  const recordGeneration = async (templateId?: string) => {
    if (!user) throw new Error("Non connecté");
    const { error } = await supabase
      .from("generations")
      .insert({ user_id: user.id, template_id: templateId ?? null });
    if (error) throw error;
    await refresh();
  };

  return { quotas, used, limit, remaining, canGenerate, loading, refresh, recordGeneration };
}
