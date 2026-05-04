import { useNavigate } from "react-router-dom";
import { ArrowRight, Sparkles, Palette, Download, LogIn, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="min-h-dvh antialiased flex flex-col items-center py-8 px-4 bg-secondary text-foreground selection:bg-primary selection:text-primary-foreground">
      {/* Main Frame */}
      <div className="w-full max-w-[1280px] bg-card border border-border shadow-sm flex flex-col">

        {/* Navigation */}
        <nav className="border-b border-border px-8 h-16 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="size-4 bg-[#2563EB]" />
            <span className="font-semibold text-lg tracking-tight text-[#2563EB]">Krobar</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Fonctionnalités</a>
            <a href="#how" className="hover:text-foreground transition-colors">Comment ça marche</a>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/auth")}
              className="text-sm font-medium bg-foreground text-background px-5 h-9 hover:bg-foreground/90 transition-colors rounded-md"
            >
              Ouvrir l'éditeur
            </button>
          </div>
        </nav>

        {/* Hero */}
        <div className="grid grid-cols-1 lg:grid-cols-2">
          {/* Left */}
          <div className="p-12 lg:p-20 border-b lg:border-b-0 lg:border-r border-border flex flex-col justify-center">
            <span className="inline-block self-start px-2.5 py-1 bg-secondary border border-border text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-8">
              Moteur de templates visuels
            </span>

            <h1 className="text-4xl lg:text-5xl xl:text-6xl font-semibold tracking-tight text-balance leading-[1.1] mb-6">
              Votre texte. <br />Des visuels instantanés.
            </h1>

            <p className="text-lg text-muted-foreground text-pretty max-w-[44ch] mb-10 leading-relaxed">
              Krobar transforme vos contenus bruts en schémas, diagrammes et infographies professionnels — en quelques secondes, sans compétence graphique.
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={() => navigate("/auth")}
                className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white px-8 h-12 font-medium text-sm transition-colors rounded-md flex items-center justify-center gap-2"
              >
                Essayer gratuitement <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-16 pt-8 border-t border-border grid grid-cols-2 gap-8">
              <div>
                <div className="text-2xl font-semibold tabular-nums tracking-tight mb-1">50+</div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Templates disponibles</div>
              </div>
              <div>
                <div className="text-2xl font-semibold tabular-nums tracking-tight mb-1">SVG &amp; PNG</div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Export haute qualité</div>
              </div>
            </div>
          </div>

          {/* Right — Preview mockup */}
          <div className="bg-secondary p-8 lg:p-16 flex items-center justify-center relative overflow-hidden">
            {/* Grid background */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:32px_32px] opacity-40" />

            {/* Mockup */}
            <div className="relative w-full max-w-lg bg-card border border-border shadow-lg flex flex-col rounded-md overflow-hidden">
              <div className="h-10 border-b border-border bg-secondary/50 flex items-center px-4 justify-between">
                <span className="text-[11px] font-medium text-muted-foreground font-mono">process_5_steps.svg</span>
                <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Aperçu</span>
              </div>

              {/* Simulated diagram */}
              <div className="p-8 flex flex-col items-center gap-4">
                {["Définir l'objectif", "Structurer les idées", "Choisir le template", "Personnaliser", "Exporter"].map((step, i) => (
                  <div key={i} className="flex items-center gap-3 w-full max-w-xs">
                    <div
                      className="size-8 rounded-md flex items-center justify-center text-xs font-bold text-white shrink-0"
                      style={{ backgroundColor: ["#2563EB", "#7C3AED", "#0EA5E9", "#F59E0B", "#10B981"][i] }}
                    >
                      {i + 1}
                    </div>
                    <div className="text-sm font-medium">{step}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Features */}
        <div id="features" className="border-t border-border bg-card">
          <div className="grid grid-cols-1 md:grid-cols-3">
            {[
              {
                icon: <Sparkles className="w-5 h-5 text-[#2563EB]" />,
                num: "01",
                title: "Analyse IA du contenu",
                desc: "Collez votre texte et l'intelligence artificielle identifie automatiquement la structure, les étapes et les relations pour choisir le meilleur template.",
              },
              {
                icon: <Palette className="w-5 h-5 text-[#2563EB]" />,
                num: "02",
                title: "Palettes professionnelles",
                desc: "Des jeux de couleurs soigneusement sélectionnés pour garantir lisibilité et cohérence visuelle. Changez l'ambiance d'un clic.",
              },
              {
                icon: <Download className="w-5 h-5 text-[#2563EB]" />,
                num: "03",
                title: "Export SVG & PNG",
                desc: "Récupérez vos visuels en SVG vectoriel ou PNG haute résolution, prêts pour vos présentations, documents ou sites web.",
              },
            ].map((f, i) => (
              <div
                key={i}
                className={`p-10 lg:p-12 ${i < 2 ? "border-b md:border-b-0 md:border-r border-border" : ""}`}
              >
                <div className="size-10 bg-secondary border border-border mb-6 flex items-center justify-center text-sm font-semibold text-muted-foreground rounded-md">
                  {f.num}
                </div>
                <h3 className="text-lg font-semibold tracking-tight mb-3 flex items-center gap-2">
                  {f.icon} {f.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* How it works */}
        <div id="how" className="border-t border-border bg-secondary">
          <div className="p-12 lg:p-20 max-w-3xl mx-auto text-center">
            <h2 className="text-3xl font-semibold tracking-tight mb-4">Comment ça fonctionne</h2>
            <p className="text-muted-foreground mb-12 text-pretty">
              Trois étapes suffisent pour passer d'un texte brut à un visuel professionnel.
            </p>
            <div className="grid md:grid-cols-3 gap-8 text-left">
              {[
                { step: "1", title: "Collez votre texte", desc: "Contenu de réunion, process métier, idées en vrac… tout fonctionne." },
                { step: "2", title: "L'IA propose des visuels", desc: "Krobar analyse la structure et génère 3 suggestions de templates adaptés." },
                { step: "3", title: "Personnalisez et exportez", desc: "Ajustez les couleurs, le texte, les icônes puis téléchargez en SVG ou PNG." },
              ].map((s, i) => (
                <div key={i} className="bg-card border border-border rounded-md p-6">
                  <div className="size-8 bg-[#2563EB] text-white rounded-md flex items-center justify-center text-sm font-bold mb-4">
                    {s.step}
                  </div>
                  <h3 className="font-semibold mb-2">{s.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="border-t border-border bg-card p-12 lg:p-20 text-center">
          <h2 className="text-2xl lg:text-3xl font-semibold tracking-tight mb-4">
            Prêt à transformer vos idées en visuels ?
          </h2>
          <p className="text-muted-foreground mb-8 max-w-lg mx-auto">
            Aucune inscription requise. Commencez à créer des diagrammes professionnels en quelques secondes.
          </p>
          <button
            onClick={() => navigate("/auth")}
            className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white px-8 h-12 font-medium text-sm transition-colors rounded-md inline-flex items-center gap-2"
          >
            Lancer l'éditeur <ArrowRight className="w-4 h-4" />
          </button>
        </div>

      </div>
    </div>
  );
}
