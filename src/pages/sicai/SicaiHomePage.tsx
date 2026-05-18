import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  BookOpen, FilePlus2, FileText, Layers, Loader2, Settings2, Shapes, Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type Stats = {
  sources: number;
  sourcesFr: number;
  sourcesInitial: number;
  documents: number;
  segmented: number;
  analysesGlobal: number;
  analysesParagraph: number;
  archetypes: number;
};

async function countRows(table:
  | "sicai_sources" | "sicai_documents" | "sicai_paragraphs"
  | "sicai_analyses" | "sicai_archetypes",
  filter?: (q: ReturnType<typeof supabase.from>) => unknown,
): Promise<number> {
  let q = supabase.from(table).select("*", { count: "exact", head: true });
  if (filter) q = filter(q) as typeof q;
  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export default function SicaiHomePage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [sources, sourcesFr, sourcesInitial, documents, segmented, analysesGlobal, analysesParagraph, archetypes] =
          await Promise.all([
            countRows("sicai_sources"),
            countRows("sicai_sources", (q) => q.like("source_id", "SICAI-FR-%")),
            countRows("sicai_sources", (q) => q.like("source_id", "SICAI-%").not("source_id", "like", "SICAI-FR-%")),
            countRows("sicai_documents"),
            countRows("sicai_documents", (q) => q.eq("document_status", "segmented")),
            countRows("sicai_analyses", (q) => q.eq("analysis_level", "global")),
            countRows("sicai_analyses", (q) => q.eq("analysis_level", "paragraph")),
            countRows("sicai_archetypes"),
          ]);
        setStats({ sources, sourcesFr, sourcesInitial, documents, segmented, analysesGlobal, analysesParagraph, archetypes });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur de chargement des statistiques");
        setStats({ sources: 0, sourcesFr: 0, sourcesInitial: 0, documents: 0, segmented: 0, analysesGlobal: 0, analysesParagraph: 0, archetypes: 0 });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <header>
        <h1 className="text-3xl font-bold">SICAI</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Sémantique — Intensité — Cardinalité — Affordance Iconique.
          Tableau de bord de la fonction d'analyse.
        </p>
      </header>

      {loading || !stats ? (
        <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <section className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <StatCard label="Sources (total)" value={stats.sources} to="/admin/sicai/library" icon={<BookOpen className="h-4 w-4" />} />
            <StatCard label="Sources — corpus initial" value={stats.sourcesInitial} to="/admin/sicai/library" icon={<BookOpen className="h-4 w-4" />} />
            <StatCard label="Sources — corpus FR" value={stats.sourcesFr} to="/admin/sicai/library" icon={<BookOpen className="h-4 w-4" />} />
            <StatCard label="Documents créés" value={stats.documents} to="/admin/sicai/library" icon={<FileText className="h-4 w-4" />} />
            <StatCard label="Documents segmentés" value={stats.segmented} to="/admin/sicai/library" icon={<Layers className="h-4 w-4" />} />
            <StatCard label="Analyses globales" value={stats.analysesGlobal} to="/admin/sicai/analyses" icon={<Sparkles className="h-4 w-4" />} />
            <StatCard label="Analyses par paragraphe" value={stats.analysesParagraph} to="/admin/sicai/analyses" icon={<Sparkles className="h-4 w-4" />} />
            <StatCard label="Archétypes disponibles" value={stats.archetypes} to="/admin/sicai/archetypes" icon={<Shapes className="h-4 w-4" />} />
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Raccourcis</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <ShortcutButton to="/admin/sicai/library" icon={<BookOpen className="h-4 w-4" />} label="Bibliothèque" />
              <ShortcutButton to="/admin/sicai/new" icon={<FilePlus2 className="h-4 w-4" />} label="Nouveau texte" />
              <ShortcutButton to="/admin/sicai/analyses" icon={<Sparkles className="h-4 w-4" />} label="Analyses" />
              <ShortcutButton to="/admin/sicai/archetypes" icon={<Shapes className="h-4 w-4" />} label="Archétypes" />
            </div>
            <div className="pt-1">
              <Button asChild variant="ghost" size="sm">
                <Link to="/admin/sicai/settings">
                  <Settings2 className="h-4 w-4 mr-2" /> Paramètres SICAI
                </Link>
              </Button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function StatCard({
  label, value, to, icon,
}: { label: string; value: number; to: string; icon: React.ReactNode }) {
  return (
    <Link to={to} className="block">
      <Card className="p-5 hover:border-primary/50 transition-colors h-full">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {icon}
          <span>{label}</span>
        </div>
        <div className="text-3xl font-bold mt-2 tabular-nums">{value}</div>
      </Card>
    </Link>
  );
}

function ShortcutButton({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Button asChild variant="outline" className="h-auto py-4 justify-start">
      <Link to={to}>
        <span className="mr-2">{icon}</span> {label}
      </Link>
    </Button>
  );
}
