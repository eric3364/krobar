import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Save, Download, FileJson, FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  sicaiApi, type SicaiAnalysis, type SicaiDocument, type SicaiParagraph,
} from "@/lib/sicaiApi";
import {
  analysesToCSV, analysesToJSON, analysesToMarkdown, downloadFile,
} from "@/lib/sicaiExports";
import { SicaiIdentityCard } from "@/components/SicaiIdentityCard";

type Form = {
  dominant_textual_function: string;
  classification_status: string;
  graphic_family: string;
  sicai_archetype_id: string;
  abstraction_level: string;
  temporality: string;
  spatiality: string;
  agency: string;
  tension: string;
  transformation: string;
  image_prompt: string;
  intensitiesText: string;
  cardinalityText: string;
  visualBriefText: string;
};

const toText = (v: unknown): string => {
  if (v == null) return "";
  if (typeof v === "string") return v;
  try { return JSON.stringify(v, null, 2); } catch { return String(v); }
};

const fromJson = (s: string): unknown => {
  const t = s.trim();
  if (!t) return {};
  try { return JSON.parse(t); } catch { throw new Error("JSON invalide"); }
};

export default function SicaiAnalysisEditPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [analysis, setAnalysis] = useState<SicaiAnalysis | null>(null);
  const [doc, setDoc] = useState<SicaiDocument | null>(null);
  const [para, setPara] = useState<SicaiParagraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Form | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const a = await sicaiApi.getAnalysis(id);
        if (!alive) return;
        setAnalysis(a);
        if (a) {
          setForm({
            dominant_textual_function: a.dominant_textual_function ?? "",
            classification_status: a.classification_status ?? "",
            graphic_family: a.graphic_family ?? "",
            sicai_archetype_id: a.sicai_archetype_id ?? "",
            abstraction_level: a.abstraction_level ?? "",
            temporality: a.temporality ?? "",
            spatiality: a.spatiality ?? "",
            agency: a.agency ?? "",
            tension: a.tension ?? "",
            transformation: a.transformation ?? "",
            image_prompt: a.image_prompt ?? "",
            intensitiesText: toText(a.intensities),
            cardinalityText: toText(a.cardinality),
            visualBriefText: toText(a.visual_brief),
          });
          if (a.document_id) {
            const d = await sicaiApi.getDocument(a.document_id);
            if (alive) setDoc(d);
          }
          if (a.paragraph_id) {
            const ps = await sicaiApi.listParagraphsMap();
            if (alive) setPara(ps.get(a.paragraph_id) ?? null);
          }
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur de chargement");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  const save = async () => {
    if (!analysis || !form) return;
    setSaving(true);
    try {
      let intensities: unknown, cardinality: unknown, visual_brief: unknown;
      try { intensities = fromJson(form.intensitiesText); }
      catch { throw new Error("Champ Intensités : JSON invalide"); }
      try { cardinality = fromJson(form.cardinalityText); }
      catch { throw new Error("Champ Cardinalité : JSON invalide"); }
      try { visual_brief = fromJson(form.visualBriefText); }
      catch { throw new Error("Champ Brief visuel : JSON invalide"); }

      const updated = await sicaiApi.updateAnalysis(analysis.id, {
        dominant_textual_function: form.dominant_textual_function || null,
        classification_status: form.classification_status || null,
        graphic_family: form.graphic_family || null,
        sicai_archetype_id: form.sicai_archetype_id || null,
        abstraction_level: form.abstraction_level || null,
        temporality: form.temporality || null,
        spatiality: form.spatiality || null,
        agency: form.agency || null,
        tension: form.tension || null,
        transformation: form.transformation || null,
        image_prompt: form.image_prompt || null,
        intensities,
        cardinality,
        visual_brief,
      });
      setAnalysis(updated);
      toast.success("Correction humaine enregistrée");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur d'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  const ctx = useMemo(() => ({
    documents: new Map(doc ? [[doc.id, doc]] : []),
    paragraphs: new Map(para ? [[para.id, para]] : []),
  }), [doc, para]);

  const stamp = () => new Date().toISOString().slice(0, 10);
  const exportOne = (fmt: "json" | "csv" | "md") => {
    if (!analysis) return;
    const base = `sicai-analyse-${analysis.id.slice(0, 8)}-${stamp()}`;
    if (fmt === "json") downloadFile(`${base}.json`, analysesToJSON([analysis], ctx), "application/json");
    else if (fmt === "csv") downloadFile(`${base}.csv`, analysesToCSV([analysis], ctx), "text/csv");
    else downloadFile(`${base}.md`, analysesToMarkdown([analysis], ctx), "text/markdown");
  };

  if (loading) return <div className="py-16 flex justify-center"><Loader2 className="animate-spin" /></div>;
  if (!analysis || !form) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin/sicai/analyses"><ArrowLeft className="h-4 w-4 mr-1" /> Analyses</Link>
        </Button>
        <Card className="p-10 text-center text-muted-foreground">Analyse introuvable.</Card>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin/sicai/analyses"><ArrowLeft className="h-4 w-4 mr-1" /> Analyses</Link>
        </Button>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Édition d'analyse SICAI</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="outline">{analysis.analysis_level}</Badge>
              {doc && <span className="text-muted-foreground">{doc.title}</span>}
              {para && <span className="text-muted-foreground">· Paragraphe {para.paragraph_index}</span>}
              {analysis.ai_model && <Badge variant="secondary">{analysis.ai_model}</Badge>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <Download className="h-4 w-4 mr-2" /> Exporter
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => exportOne("json")}>
                  <FileJson className="h-4 w-4 mr-2" /> JSON
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportOne("csv")}>
                  <FileSpreadsheet className="h-4 w-4 mr-2" /> CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportOne("md")}>
                  <FileText className="h-4 w-4 mr-2" /> Markdown
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Enregistrer
            </Button>
          </div>
        </div>
      </div>

      <Tabs defaultValue="card">
        <TabsList>
          <TabsTrigger value="card">Carte SICAI</TabsTrigger>
          <TabsTrigger value="edit">Édition manuelle</TabsTrigger>
          <TabsTrigger value="raw">Réponse IA brute</TabsTrigger>
        </TabsList>

        <TabsContent value="card" className="mt-4">
          <SicaiIdentityCard analysis={analysis} />
        </TabsContent>


        <TabsContent value="edit" className="mt-4 space-y-4">
          <Card className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Fonction dominante">
              <Input value={form.dominant_textual_function}
                onChange={(e) => set("dominant_textual_function", e.target.value)} />
            </Field>
            <Field label="Statut de classification">
              <Input value={form.classification_status}
                onChange={(e) => set("classification_status", e.target.value)} />
            </Field>
            <Field label="Famille graphique">
              <Input value={form.graphic_family}
                onChange={(e) => set("graphic_family", e.target.value)} />
            </Field>
            <Field label="Archétype SICAI">
              <Input value={form.sicai_archetype_id}
                onChange={(e) => set("sicai_archetype_id", e.target.value)} />
            </Field>
            <Field label="Niveau d'abstraction">
              <Input value={form.abstraction_level}
                onChange={(e) => set("abstraction_level", e.target.value)} />
            </Field>
            <Field label="Temporalité">
              <Input value={form.temporality} onChange={(e) => set("temporality", e.target.value)} />
            </Field>
            <Field label="Spatialité">
              <Input value={form.spatiality} onChange={(e) => set("spatiality", e.target.value)} />
            </Field>
            <Field label="Agency">
              <Input value={form.agency} onChange={(e) => set("agency", e.target.value)} />
            </Field>
            <Field label="Tension">
              <Input value={form.tension} onChange={(e) => set("tension", e.target.value)} />
            </Field>
            <Field label="Transformation">
              <Input value={form.transformation} onChange={(e) => set("transformation", e.target.value)} />
            </Field>
          </Card>

          <Card className="p-4 space-y-4">
            <Field label="Intensités (JSON)">
              <Textarea rows={5} className="font-mono text-xs"
                value={form.intensitiesText}
                onChange={(e) => set("intensitiesText", e.target.value)} />
            </Field>
            <Field label="Cardinalité (JSON)">
              <Textarea rows={5} className="font-mono text-xs"
                value={form.cardinalityText}
                onChange={(e) => set("cardinalityText", e.target.value)} />
            </Field>
            <Field label="Brief visuel (JSON)">
              <Textarea rows={8} className="font-mono text-xs"
                value={form.visualBriefText}
                onChange={(e) => set("visualBriefText", e.target.value)} />
            </Field>
            <Field label="Prompt image">
              <Textarea rows={5} value={form.image_prompt}
                onChange={(e) => set("image_prompt", e.target.value)} />
            </Field>
          </Card>
        </TabsContent>

        <TabsContent value="raw" className="mt-4">
          <Card className="p-4">
            <p className="text-xs text-muted-foreground mb-2">
              Cette trace IA est immuable et ne peut pas être modifiée — elle est conservée comme référence.
            </p>
            <pre className="text-xs bg-muted p-3 rounded max-h-[60vh] overflow-auto whitespace-pre-wrap">
              {analysis.ai_raw_response
                ? JSON.stringify(analysis.ai_raw_response, null, 2)
                : "(aucune réponse IA enregistrée)"}
            </pre>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
