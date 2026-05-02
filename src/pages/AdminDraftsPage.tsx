import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAdminApi } from "@/lib/adminApi";
import { toast } from "sonner";
import { Loader2, RefreshCw } from "lucide-react";

type Draft = {
  draft_id: string;
  status: string;
  created_at: string;
  deployed_at: string | null;
  metadata: Record<string, string>;
};

const statusColors: Record<string, string> = {
  deployed: "bg-green-100 text-green-800",
  validated: "bg-blue-100 text-blue-800",
  validation_failed: "bg-red-100 text-red-800",
  draft: "bg-gray-100 text-gray-800",
};

export default function AdminDraftsPage() {
  const api = useAdminApi();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listDrafts();
      setDrafts(res.drafts);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Drafts de templates</h1>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Rafraîchir
        </Button>
      </div>

      {loading ? (
        <div className="py-12 text-center"><Loader2 className="animate-spin mx-auto" /></div>
      ) : drafts.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Aucun draft trouvé.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Créé le</TableHead>
                <TableHead>Déployé le</TableHead>
                <TableHead>Catégorie</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {drafts.map((d) => (
                <TableRow key={d.draft_id}>
                  <TableCell className="font-mono text-xs">{d.draft_id}</TableCell>
                  <TableCell>
                    <Badge className={statusColors[d.status] || "bg-gray-100 text-gray-800"} variant="secondary">
                      {d.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{fmt(d.created_at)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{fmt(d.deployed_at)}</TableCell>
                  <TableCell className="text-xs">{d.metadata?.category || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
