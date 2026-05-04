import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight,
  FileText,
  Sparkles,
  Palette,
  Edit3,
  Download,
  History,
  Clock,
} from "lucide-react";
import AccountMenu from "@/components/AccountMenu";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type LastGen = {
  id: string;
  created_at: string;
  input_text: string | null;
  template_id: string | null;
};

export default function Welcome() {
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();
  const [hide, setHide] = useState(false);
  const [last, setLast] = useState<LastGen | null>(null);

  useEffect(() => {
    if (profile) setHide(profile.hide_welcome);
  }, [profile]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("generations")
      .select("id,created_at,input_text,template_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setLast(data as LastGen | null));
  }, [user]);

  const persistHide = async (value: boolean) => {
    setHide(value);
    if (!user) return;
    const { error } = await supabase
      .from("profiles")
      .update({ hide_welcome: value })
      .eq("id", user.id);
    if (error) {
      toast.error("Impossible d'enregistrer la préférence");
      setHide(!value);
    } else {
      await refreshProfile();
    }
  };

  const goWorkspace = () => navigate("/workspace");
  const resumeLast = () => {
    if (!last) return;
    navigate(`/workspace?resume=${last.id}`);
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold text-[#0F2A44]">Krobar</h1>
          <AccountMenu />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-10 space-y-10">
        {/* Hero */}
        <section className="text-center space-y-3">
          <Badge variant="secondary" className="mx-auto">
            <Sparkles className="w-3 h-3 mr-1" /> Bienvenue
            {profile?.display_name ? `, ${profile.display_name}` : ""}
          </Badge>
          <h2 className="text-3xl md:text-4xl font-bold">
            Transformez votre texte en visuel
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Krobar analyse votre contenu et propose des schémas prêts à
            l'emploi, personnalisables en quelques clics.
          </p>
        </section>

        {/* Reprise rapide */}
        {last && (
          <Card className="p-5 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between border-primary/30">
            <div className="flex items-start gap-3 min-w-0">
              <Clock className="w-5 h-5 text-primary shrink-0 mt-1" />
              <div className="min-w-0">
                <p className="font-medium">Reprendre votre dernière session</p>
                <p className="text-sm text-muted-foreground truncate">
                  {last.input_text
                    ? last.input_text.slice(0, 120)
                    : "Génération sans texte enregistré"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(last.created_at).toLocaleString("fr-FR")}
                </p>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={() => navigate("/historique")}>
                <History className="w-4 h-4" /> Historique
              </Button>
              <Button size="sm" onClick={resumeLast}>
                Reprendre <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </Card>
        )}

        {/* Schéma stylisé de la zone de travail */}
        <section className="space-y-4">
          <h3 className="text-xl font-semibold text-center">
            Comment fonctionne la zone de travail
          </h3>
          <Card className="p-6">
            <div className="grid md:grid-cols-[1.1fr_auto_1fr] gap-4 items-stretch">
              {/* Colonne entrée */}
              <div className="space-y-3">
                <div className="rounded-lg border-2 border-dashed border-primary/40 p-4 space-y-2 bg-primary/5">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-primary" />
                    <span className="font-medium text-sm">1. Votre texte</span>
                  </div>
                  <div className="space-y-1.5">
                    <div className="h-2 rounded bg-primary/30 w-full" />
                    <div className="h-2 rounded bg-primary/30 w-5/6" />
                    <div className="h-2 rounded bg-primary/30 w-4/6" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Collez ou tapez votre contenu à visualiser.
                  </p>
                </div>

                <div className="rounded-lg border p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Palette className="w-4 h-4 text-primary" />
                    <span className="font-medium text-sm">2. Palette</span>
                  </div>
                  <div className="flex gap-1.5">
                    {["bg-sky-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500"].map(
                      (c) => (
                        <div key={c} className={`w-6 h-6 rounded ${c}`} />
                      ),
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Choisissez l'identité visuelle.
                  </p>
                </div>
              </div>

              {/* Flèche */}
              <div className="hidden md:flex items-center justify-center">
                <div className="flex flex-col items-center gap-1 text-primary">
                  <Sparkles className="w-6 h-6" />
                  <ArrowRight className="w-8 h-8" />
                  <span className="text-xs uppercase tracking-wider">Analyse IA</span>
                </div>
              </div>

              {/* Colonne sortie */}
              <div className="space-y-3">
                <div className="rounded-lg border-2 border-dashed border-emerald-500/40 p-4 space-y-2 bg-emerald-500/5">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-600" />
                    <span className="font-medium text-sm">3. Suggestions</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="aspect-square rounded bg-gradient-to-br from-emerald-200 to-sky-200 border"
                      />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Plusieurs schémas générés ; choisissez le meilleur.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border p-3 space-y-1">
                    <Edit3 className="w-4 h-4 text-primary" />
                    <p className="text-xs font-medium">4. Personnaliser</p>
                    <p className="text-xs text-muted-foreground">
                      Texte, icônes, position.
                    </p>
                  </div>
                  <div className="rounded-lg border p-3 space-y-1">
                    <Download className="w-4 h-4 text-primary" />
                    <p className="text-xs font-medium">5. Exporter</p>
                    <p className="text-xs text-muted-foreground">SVG ou PNG.</p>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </section>

        {/* CTA */}
        <section className="flex flex-col items-center gap-4 pb-6">
          <Button size="lg" onClick={goWorkspace} className="px-8">
            Accéder à la plateforme <ArrowRight className="w-4 h-4" />
          </Button>
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <Checkbox
              checked={hide}
              onCheckedChange={(v) => persistHide(Boolean(v))}
            />
            Ne plus afficher cette page au démarrage
          </label>
        </section>
      </main>
    </div>
  );
}
