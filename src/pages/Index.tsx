import { useEffect, useMemo, useRef, useState } from "react";
import { palettes, paletteLabels, type Palette } from "@/palettes";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Download, Sparkles, Settings, RefreshCw, FlaskConical } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import TestSuiteView from "@/components/TestSuiteView";

type ManifestTemplate = {
  id: string;
  name: string;
  category: string;
  description: string;
  file: string;
  slots: string[];
  best_for: string;
};

type Manifest = { templates: ManifestTemplate[] };

type Suggestion = {
  template_id: string;
  score: number;
  reasoning: string;
  slots: Record<string, string>;
};

const API_KEY_STORAGE = "kroki_claude_api_key";

function applyPaletteVars(el: SVGElement, palette: Palette) {
  el.style.setProperty("--primary", palette.primary);
  el.style.setProperty("--accent", palette.accent);
  el.style.setProperty("--bg", palette.bg);
  el.style.setProperty("--text", palette.text);
}

function fillSlots(svg: SVGElement, slots: Record<string, string>) {
  Object.entries(slots).forEach(([k, v]) => {
    const el = svg.querySelector(`[data-slot="${k}"]`) as HTMLElement | SVGElement | null;
    if (!el) return;
    el.textContent = v;
    // Fallback : si malgré la contrainte le slot dépasse 35 caractères, réduire la police.
    if (v && v.length > 35 && el instanceof HTMLElement) {
      el.style.fontSize = "11px";
    }
  });

  // Post-processing spécifique au donut : recalcul des arcs + repositionnement des labels %.
  if (svg.getAttribute("data-template") === "donut_4_parts") {
    applyDonutPercentages(svg, slots);
  }
  // Post-processing spécifique au stacked bar : recalcul des largeurs/positions des segments + labels.
  if (svg.getAttribute("data-template") === "stacked_bar") {
    applyStackedBarPercentages(svg, slots);
  }
}

// Helper commun : parse "42", "42%", "42,5" → number ; valeur invalide → fallback.
function parsePctValue(raw: string | undefined, fallback = 25): number {
  if (!raw) return fallback;
  const n = parseFloat(String(raw).replace("%", "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

// Stacked bar (largeur 510 à x=40, h=120 à y=240).
// Segments paramétrés via segment_N_percent ; labels repositionnés au centre.
function applyStackedBarPercentages(svg: SVGElement, slots: Record<string, string>) {
  const X0 = 40;
  const TOTAL_W = 510;
  const Y = 240;
  const H = 120;

  const pcts = [1, 2, 3, 4].map((i) => parsePctValue(slots[`segment_${i}_percent`]));
  const sum = pcts.reduce((a, b) => a + b, 0) || 1;
  const norm = pcts.map((p) => (p / sum) * 100);

  let cursor = X0;
  norm.forEach((pct, idx) => {
    const w = (pct / 100) * TOTAL_W;
    const seg = svg.querySelector(`[data-slot="seg_${idx + 1}"]`) as SVGRectElement | null;
    if (seg) {
      seg.setAttribute("x", String(cursor));
      seg.setAttribute("y", String(Y));
      seg.setAttribute("width", String(w));
      seg.setAttribute("height", String(H));
    }

    const labelFO = svg.querySelector(
      `foreignObject[data-slot-pos="segment_${idx + 1}_percent"]`
    ) as SVGForeignObjectElement | null;
    if (labelFO) {
      const lw = parseFloat(labelFO.getAttribute("width") || "82");
      const lh = parseFloat(labelFO.getAttribute("height") || "32");
      labelFO.setAttribute("x", String(cursor + w / 2 - lw / 2));
      labelFO.setAttribute("y", String(Y + H / 2 - lh / 2));
      // Cache si segment trop étroit pour le label.
      labelFO.setAttribute("opacity", w < lw * 0.55 ? "0" : "1");
    }

    cursor += w;
  });
}

// Calcule les stroke-dasharray/offset des 4 arcs du donut à partir
// des slots percent_1..percent_4, et place chaque label de % au centre
// angulaire de son segment. Les valeurs non numériques retombent à 25.
function applyDonutPercentages(svg: SVGElement, slots: Record<string, string>) {
  const parsePct = (raw: string | undefined): number => {
    if (!raw) return 25;
    const n = parseFloat(String(raw).replace("%", "").replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : 25;
  };

  const pcts = [1, 2, 3, 4].map((i) => parsePct(slots[`percent_${i}`]));
  const sum = pcts.reduce((a, b) => a + b, 0) || 1;
  const norm = pcts.map((p) => (p / sum) * 100);

  // r=130 dans le SVG → C ≈ 816.81
  const C = 2 * Math.PI * 130;
  let cumulative = 0;

  norm.forEach((pct, idx) => {
    const arc = svg.querySelector(`[data-slot="arc_${idx + 1}"]`) as SVGCircleElement | null;
    const len = (pct / 100) * C;
    if (arc) {
      arc.setAttribute("stroke-dasharray", `${len.toFixed(2)} ${(C - len).toFixed(2)}`);
      arc.setAttribute("stroke-dashoffset", `${(-(cumulative / 100) * C).toFixed(2)}`);
    }

    // Centre angulaire du segment (12h = -PI/2, sens horaire).
    const midPct = cumulative + pct / 2;
    const angle = (midPct / 100) * 2 * Math.PI - Math.PI / 2;
    const labelR = 130;
    const cx = 260 + labelR * Math.cos(angle);
    const cy = 340 + labelR * Math.sin(angle);

    const labelFO = svg.querySelector(
      `foreignObject[data-slot-pos="percent_${idx + 1}"]`
    ) as SVGForeignObjectElement | null;
    if (labelFO) {
      const w = parseFloat(labelFO.getAttribute("width") || "80");
      const h = parseFloat(labelFO.getAttribute("height") || "34");
      labelFO.setAttribute("x", String(cx - w / 2));
      labelFO.setAttribute("y", String(cy - h / 2));
      labelFO.setAttribute("opacity", pct < 4 ? "0" : "1");
    }

    cumulative += pct;
  });
}

async function loadSvg(file: string): Promise<SVGElement> {
  const res = await fetch(`/templates/${file}`);
  const txt = await res.text();
  const doc = new DOMParser().parseFromString(txt, "image/svg+xml");
  return doc.documentElement as unknown as SVGElement;
}

function svgToString(svg: SVGElement): string {
  return new XMLSerializer().serializeToString(svg);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const Index = () => {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [text, setText] = useState("");
  const [paletteKey, setPaletteKey] = useState<keyof typeof palettes>("next-u-corporate");
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [apiKey, setApiKey] = useState<string>("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [testSuiteOpen, setTestSuiteOpen] = useState(false);

  const previewRef = useRef<HTMLDivElement>(null);
  const thumbRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    fetch("/templates/manifest.json")
      .then((r) => r.json())
      .then(setManifest);
    const k = localStorage.getItem(API_KEY_STORAGE);
    if (k) setApiKey(k);
  }, []);

  const palette = palettes[paletteKey];

  const selectedSuggestion = selectedIdx !== null ? suggestions[selectedIdx] : null;
  const selectedTemplate = useMemo(
    () =>
      selectedSuggestion && manifest
        ? manifest.templates.find((t) => t.id === selectedSuggestion.template_id) ?? null
        : null,
    [selectedSuggestion, manifest]
  );

  // Render thumbnails when suggestions change
  useEffect(() => {
    if (!manifest) return;
    suggestions.forEach(async (sug, i) => {
      const tpl = manifest.templates.find((t) => t.id === sug.template_id);
      const node = thumbRefs.current[i];
      if (!tpl || !node) return;
      const svg = await loadSvg(tpl.file);
      applyPaletteVars(svg, palette);
      fillSlots(svg, sug.slots);
      svg.setAttribute("width", "100%");
      svg.setAttribute("height", "100%");
      node.innerHTML = "";
      node.appendChild(svg);
    });
  }, [suggestions, manifest, palette]);

  // Render big preview
  useEffect(() => {
    if (!selectedSuggestion || !selectedTemplate || !previewRef.current) return;
    (async () => {
      const svg = await loadSvg(selectedTemplate.file);
      applyPaletteVars(svg, palette);
      fillSlots(svg, selectedSuggestion.slots);
      svg.setAttribute("width", "100%");
      svg.setAttribute("height", "100%");
      previewRef.current!.innerHTML = "";
      previewRef.current!.appendChild(svg);
    })();
  }, [selectedSuggestion, selectedTemplate, palette]);

  const saveApiKey = (v: string) => {
    setApiKey(v);
    localStorage.setItem(API_KEY_STORAGE, v);
  };

  const analyze = async () => {
    if (!text.trim()) {
      toast.error("Collez d'abord un texte à analyser.");
      return;
    }
    if (!manifest) return;
    if (!apiKey) {
      toast.error("Ajoutez votre clé API Claude dans les paramètres.");
      setSettingsOpen(true);
      return;
    }

    setLoading(true);
    setSuggestions([]);
    setSelectedIdx(null);

    // Index compact : on n'envoie pas le manifest entier (lourd avec 20 templates),
    // juste l'essentiel pour la sélection. Le manifest complet sert au remplissage.
    const compactIndex = manifest.templates.map((t) => ({
      id: t.id,
      category: t.category,
      best_for: t.best_for,
      slot_count: t.slots.length,
      slots: t.slots,
    }));

    const systemPrompt = `Tu es un assistant qui sélectionne des templates SVG pour visualiser du texte.

BIBLIOTHÈQUE (index compact) :
${JSON.stringify(compactIndex)}

TEXTE DE L'UTILISATEUR :
${text}

MÉTHODE — suis ces étapes mentalement AVANT de répondre (ne les écris pas) :
1. Identifie la STRUCTURE dominante du texte parmi : séquentielle (process, étapes), comparative (options, alternatives), hiérarchique (niveaux, organigramme), causale (causes/effet, problème/solution), temporelle (dates, jalons, roadmap), partitive (répartition, parts d'un tout), analytique (cadre business : SWOT, BCG, Porter, BMC), métaphorique (iceberg, pont), mentale (idée centrale + ramifications).
2. Choisis les 3 templates dont la "category" et le "best_for" correspondent LE MIEUX à cette structure.
3. Classe-les par score décroissant (le plus pertinent en premier).

CONTRAINTE STRICTE sur chaque valeur de slot — sans exception :
- MAXIMUM 5 mots ET 35 caractères.
- Privilégie les formulations NOMINALES courtes (groupes nominaux, pas de phrases, pas de verbes conjugués si évitable).
- Exemple BON : "Analyse des besoins".
- Exemple MAUVAIS : "On analyse d'abord les besoins pédagogiques".

FORMAT DE RÉPONSE — renvoie UNIQUEMENT un JSON strict (sans markdown, sans préambule, sans commentaire) :
{
  "suggestions": [
    {
      "template_id": "...",
      "score": 0.0,
      "reasoning": "1 phrase expliquant la pertinence",
      "slots": { "title": "...", "...": "..." }
    }
  ]
}

Renvoie EXACTEMENT 3 suggestions, classées par score décroissant. Remplis tous les slots listés pour chaque template choisi avec du contenu synthétique tiré du texte fourni.`;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2000,
          messages: [{ role: "user", content: systemPrompt }],
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`API ${res.status}: ${err}`);
      }
      const data = await res.json();
      const raw: string = data.content?.[0]?.text ?? "";
      const cleaned = raw.replace(/```json\s*|\s*```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      const sug: Suggestion[] = parsed.suggestions ?? [];
      if (sug.length === 0) throw new Error("Aucune suggestion");
      setSuggestions(sug);
      setSelectedIdx(0);
      toast.success(`${sug.length} suggestions générées`);
    } catch (e) {
      console.error(e);
      toast.error("Échec de l'analyse. Vérifiez la clé API et réessayez.");
    } finally {
      setLoading(false);
    }
  };

  const downloadSVG = () => {
    if (!previewRef.current) return;
    const svg = previewRef.current.querySelector("svg");
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGElement;
    // Inline palette for portability
    applyPaletteVars(clone, palette);
    const str = svgToString(clone);
    downloadBlob(new Blob([str], { type: "image/svg+xml" }), "kroki.svg");
  };

  const downloadPNG = async () => {
    if (!previewRef.current) return;
    const svg = previewRef.current.querySelector("svg");
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGElement;
    applyPaletteVars(clone, palette);
    const vb = (clone.getAttribute("viewBox") || "0 0 800 600").split(" ").map(Number);
    const w = vb[2] || 800;
    const h = vb[3] || 600;
    clone.setAttribute("width", String(w));
    clone.setAttribute("height", String(h));
    const str = svgToString(clone);
    const svgBlob = new Blob([str], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const scale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = w * scale;
      canvas.height = h * scale;
      const ctx = canvas.getContext("2d")!;
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((b) => {
        if (b) downloadBlob(b, "kroki.png");
        URL.revokeObjectURL(url);
      }, "image/png");
    };
    img.onerror = () => {
      toast.error("Erreur d'export PNG");
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const cyclePalette = () => {
    const keys = Object.keys(palettes);
    const idx = keys.indexOf(paletteKey);
    setPaletteKey(keys[(idx + 1) % keys.length] as keyof typeof palettes);
  };

  if (testSuiteOpen && manifest) {
    return (
      <TestSuiteView
        manifest={manifest}
        apiKey={apiKey}
        onBack={() => setTestSuiteOpen(false)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl font-black tracking-tight">KROKI</h1>
            <span className="text-sm text-muted-foreground">
              Texte → Visuel SVG
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setTestSuiteOpen(true)}>
              <FlaskConical className="w-4 h-4 mr-2" /> Lancer la suite de tests
            </Button>
            <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Settings className="w-4 h-4 mr-2" /> Paramètres
                </Button>
              </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Clé API Claude</DialogTitle>
                <DialogDescription>
                  Stockée localement (localStorage). Phase prototype uniquement.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="key">Clé API</Label>
                <Input
                  id="key"
                  type="password"
                  placeholder="sk-ant-..."
                  value={apiKey}
                  onChange={(e) => saveApiKey(e.target.value)}
                />
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-3 gap-4 p-4 h-[calc(100vh-65px)]">
        {/* Zone 1 — Saisie */}
        <section className="flex flex-col gap-3">
          <Card className="p-4 flex flex-col gap-3 flex-1">
            <Label className="text-sm font-semibold">Votre texte</Label>
            <Textarea
              placeholder="Collez votre texte ici (extrait de cours, paragraphe, idée)…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="flex-1 resize-none min-h-[260px] font-mono text-sm"
            />
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Palette</Label>
              <div className="grid grid-cols-2 gap-2">
                {Object.keys(palettes).map((k) => {
                  const p = palettes[k];
                  const active = k === paletteKey;
                  return (
                    <button
                      key={k}
                      onClick={() => setPaletteKey(k as keyof typeof palettes)}
                      className={`text-left p-2 rounded-md border transition ${
                        active
                          ? "border-foreground ring-2 ring-foreground/20"
                          : "border-border hover:border-foreground/40"
                      }`}
                    >
                      <div className="flex gap-1 mb-1.5">
                        <span className="w-4 h-4 rounded" style={{ background: p.primary }} />
                        <span className="w-4 h-4 rounded" style={{ background: p.accent }} />
                        <span className="w-4 h-4 rounded border" style={{ background: p.bg }} />
                      </div>
                      <div className="text-xs font-medium">{paletteLabels[k]}</div>
                    </button>
                  );
                })}
              </div>
            </div>
            <Button onClick={analyze} disabled={loading} size="lg" className="w-full">
              {loading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              Analyser et proposer des visuels
            </Button>
          </Card>
        </section>

        {/* Zone 2 — Suggestions */}
        <section className="flex flex-col gap-3 overflow-hidden">
          <Card className="p-4 flex flex-col gap-3 flex-1 overflow-y-auto">
            <Label className="text-sm font-semibold">Suggestions IA</Label>
            {suggestions.length === 0 && !loading && (
              <div className="flex-1 flex items-center justify-center text-center text-sm text-muted-foreground p-6">
                Les vignettes proposées par l'IA apparaîtront ici.
              </div>
            )}
            {loading && (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            )}
            <div className="space-y-3">
              {suggestions.map((sug, i) => {
                const tpl = manifest?.templates.find((t) => t.id === sug.template_id);
                const active = i === selectedIdx;
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedIdx(i)}
                    className={`w-full text-left rounded-lg border-2 p-3 transition ${
                      active
                        ? "border-foreground bg-accent"
                        : "border-border hover:border-foreground/40"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold uppercase tracking-wide">
                        {tpl?.name ?? sug.template_id}
                      </span>
                      <span className="text-xs font-mono px-2 py-0.5 rounded bg-foreground text-background">
                        {Math.round(sug.score * 100)}%
                      </span>
                    </div>
                    <div
                      ref={(el) => (thumbRefs.current[i] = el)}
                      className="w-full aspect-[4/3] bg-card border rounded overflow-hidden"
                    />
                    <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                      {sug.reasoning}
                    </p>
                  </button>
                );
              })}
            </div>
          </Card>
        </section>

        {/* Zone 3 — Aperçu et export */}
        <section className="flex flex-col gap-3 overflow-hidden">
          <Card className="p-4 flex flex-col gap-3 flex-1">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Aperçu</Label>
              {selectedTemplate && (
                <span className="text-xs text-muted-foreground">{selectedTemplate.name}</span>
              )}
            </div>
            <div
              ref={previewRef}
              className="flex-1 min-h-[300px] border rounded-lg bg-card overflow-hidden flex items-center justify-center"
            >
              {!selectedSuggestion && (
                <span className="text-sm text-muted-foreground">
                  Sélectionnez une suggestion
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={downloadSVG} disabled={!selectedSuggestion} variant="outline">
                <Download className="w-4 h-4 mr-2" /> SVG
              </Button>
              <Button onClick={downloadPNG} disabled={!selectedSuggestion} variant="outline">
                <Download className="w-4 h-4 mr-2" /> PNG
              </Button>
            </div>
            <Button onClick={cyclePalette} disabled={!selectedSuggestion} variant="secondary">
              <RefreshCw className="w-4 h-4 mr-2" /> Régénérer avec autre palette
            </Button>
          </Card>
        </section>
      </main>
    </div>
  );
};

export default Index;
