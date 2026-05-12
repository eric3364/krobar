import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";

type Plan = "free" | "basic" | "premium";
const planLabels: Record<Plan, string> = { free: "Gratuit", basic: "Basique", premium: "Premium" };

type Profile = {
  id: string;
  email: string | null;
  display_name: string | null;
  plan: Plan;
  is_active: boolean;
  created_at: string;
};

type Quota = { plan: Plan; monthly_limit: number };

export default function Admin() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [quotas, setQuotas] = useState<Quota[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: profs, error: e1 }, { data: qs, error: e2 }] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("plan_quotas").select("*").order("monthly_limit"),
    ]);
    if (e1) toast.error(e1.message);
    if (e2) toast.error(e2.message);
    setProfiles((profs as Profile[]) ?? []);
    setQuotas((qs as Quota[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateProfile = async (id: string, patch: Partial<Profile>) => {
    const { error } = await supabase.from("profiles").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Mis à jour");
    setProfiles((p) => p.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  };

  const updateQuota = async (plan: Plan, monthly_limit: number) => {
    if (Number.isNaN(monthly_limit) || monthly_limit < 0) return;
    const { error } = await supabase.from("plan_quotas").update({ monthly_limit }).eq("plan", plan);
    if (error) return toast.error(error.message);
    toast.success(`Quota ${planLabels[plan]} mis à jour`);
    setQuotas((qs) => qs.map((q) => (q.plan === plan ? { ...q, monthly_limit } : q)));
  };

  const filtered = profiles.filter(
    (p) =>
      !search ||
      p.email?.toLowerCase().includes(search.toLowerCase()) ||
      p.display_name?.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="min-h-screen p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Button asChild variant="ghost" size="sm"><Link to="/"><ArrowLeft className="w-4 h-4" /> Retour</Link></Button>
          <h1 className="text-3xl font-bold mt-2">Back-office</h1>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm"><Link to="/admin/test-suite">Suite de tests</Link></Button>
          <Button asChild variant="outline" size="sm"><Link to="/admin/familles">Familles</Link></Button>
          <Button asChild variant="outline" size="sm"><Link to="/admin/templates/new">Upload template</Link></Button>
          <Button asChild variant="outline" size="sm"><Link to="/admin/templates/atelier">Atelier IA</Link></Button>
          <Button asChild size="sm"><Link to="/admin/studio">Studio</Link></Button>
        </div>
      </div>

      <Card className="p-6 space-y-4">
        <h2 className="text-xl font-semibold">Quotas mensuels par plan</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          {(["free", "basic", "premium"] as Plan[]).map((plan) => {
            const q = quotas.find((x) => x.plan === plan);
            return (
              <div key={plan} className="space-y-2">
                <label className="text-sm font-medium">{planLabels[plan]}</label>
                <Input
                  type="number"
                  min={0}
                  defaultValue={q?.monthly_limit ?? 0}
                  onBlur={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (q && v !== q.monthly_limit) updateQuota(plan, v);
                  }}
                />
                <p className="text-xs text-muted-foreground">générations / mois</p>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold">Utilisateurs ({filtered.length})</h2>
          <Input
            placeholder="Rechercher email ou nom…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
        </div>
        {loading ? (
          <div className="py-12 text-center"><Loader2 className="animate-spin mx-auto" /></div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Nom</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Actif</TableHead>
                  <TableHead>Inscrit le</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-mono text-xs">{u.email}</TableCell>
                    <TableCell>{u.display_name ?? <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell>
                      <Select value={u.plan} onValueChange={(v) => updateProfile(u.id, { plan: v as Plan })}>
                        <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(["free", "basic", "premium"] as Plan[]).map((p) => (
                            <SelectItem key={p} value={p}>{planLabels[p]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Switch checked={u.is_active} onCheckedChange={(v) => updateProfile(u.id, { is_active: v })} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(u.created_at).toLocaleDateString("fr-FR")}
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Aucun utilisateur</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Pour donner le rôle administrateur à un utilisateur, ajoutez une ligne dans la table <code>user_roles</code> via le backend.
        </p>
        <Button asChild variant="outline" size="sm" className="w-fit">
          <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">Ouvrir le backend</a>
        </Button>
      </Card>
    </div>
  );
}
