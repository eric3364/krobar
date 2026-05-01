import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Clock, Play, FileText } from "lucide-react";
import AccountMenu from "@/components/AccountMenu";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

type Gen = {
  id: string;
  created_at: string;
  input_text: string | null;
  template_id: string | null;
  palette_key: string | null;
};

const PAGE_SIZE = 20;

export default function Historique() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [items, setItems] = useState<Gen[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE; // fetch one extra to detect more
    supabase
      .from("generations")
      .select("id,created_at,input_text,template_id,palette_key")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(from, to)
      .then(({ data }) => {
        const rows = (data ?? []) as Gen[];
        setHasMore(rows.length > PAGE_SIZE);
        setItems(rows.slice(0, PAGE_SIZE));
        setLoading(false);
      });
  }, [user, page]);

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate("/welcome")}>
              <ArrowLeft className="w-4 h-4" /> Accueil
            </Button>
            <h1 className="text-xl font-bold">Historique</h1>
          </div>
          <AccountMenu />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-3">
        {loading && (
          <p className="text-sm text-muted-foreground text-center py-8">
            Chargement…
          </p>
        )}

        {!loading && items.length === 0 && (
          <Card className="p-8 text-center space-y-3">
            <FileText className="w-10 h-10 mx-auto text-muted-foreground" />
            <div>
              <p className="font-medium">Aucune production pour l'instant</p>
              <p className="text-sm text-muted-foreground">
                Créez votre premier visuel pour le voir apparaître ici.
              </p>
            </div>
            <Button onClick={() => navigate("/workspace")}>
              Aller à la plateforme
            </Button>
          </Card>
        )}

        {!loading &&
          items.map((g) => (
            <Card key={g.id} className="p-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  {new Date(g.created_at).toLocaleString("fr-FR")}
                  {g.template_id && (
                    <Badge variant="secondary" className="text-[10px]">
                      {g.template_id}
                    </Badge>
                  )}
                </div>
                <p className="text-sm line-clamp-2">
                  {g.input_text || (
                    <span className="text-muted-foreground italic">
                      Texte non enregistré (ancienne génération)
                    </span>
                  )}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={!g.input_text}
                onClick={() => navigate(`/workspace?resume=${g.id}`)}
              >
                <Play className="w-3 h-3" /> Reprendre
              </Button>
            </Card>
          ))}

        {!loading && (page > 0 || hasMore) && (
          <div className="flex justify-between pt-4">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Précédent
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!hasMore}
              onClick={() => setPage((p) => p + 1)}
            >
              Suivant
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
