import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Loader2, Save, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { sicaiApi } from "@/lib/sicaiApi";

const SETTING_KEY = "ai_config";

type AiConfig = {
  model: string;
  temperature: number;
  max_tokens: number;
  thresholds: {
    exclusive_gap: number;
    nuance_gap_min: number;
    nuance_gap_max: number;
    hybrid_score_min: number;
  };
};

const DEFAULTS: AiConfig = {
  model: "gpt-4o-mini",
  temperature: 0.2,
  max_tokens: 2000,
  thresholds: {
    exclusive_gap: 25,
    nuance_gap_min: 10,
    nuance_gap_max: 25,
    hybrid_score_min: 60,
  },
};

const MODELS = [
  "gpt-4o-mini",
  "gpt-4o",
  "gpt-4.1-mini",
  "gpt-4.1",
];

export default function SicaiSettingsPage() {
  const [config, setConfig] = useState<AiConfig>(DEFAULTS);
  const [openaiConfigured, setOpenaiConfigured] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [saved, status] = await Promise.all([
          sicaiApi.getSetting<Partial<AiConfig>>(SETTING_KEY),
          sicaiApi.getOpenAiStatus().catch(() => null),
        ]);
        if (saved) {
          setConfig({
            ...DEFAULTS,
            ...saved,
            thresholds: { ...DEFAULTS.thresholds, ...(saved.thresholds ?? {}) },
          });
        }
        setOpenaiConfigured(status?.openai_configured ?? null);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur de chargement");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await sicaiApi.upsertSetting(SETTING_KEY, config);
      toast.success("Paramètres SICAI enregistrés");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur d'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  const setT = (k: keyof AiConfig["thresholds"], v: number) =>
    setConfig((c) => ({ ...c, thresholds: { ...c.thresholds, [k]: v } }));

  if (loading) {
    return <div className="py-16 flex justify-center"><Loader2 className="animate-spin" /></div>;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin/sicai"><ArrowLeft className="h-4 w-4 mr-1" /> SICAI</Link>
        </Button>
        <h1 className="text-2xl font-bold mt-2">Paramètres SICAI</h1>
        <p className="text-sm text-muted-foreground">
          Configuration du moteur d'analyse IA et des seuils de classification.
        </p>
      </div>

      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Clé OpenAI</h2>
            <p className="text-xs text-muted-foreground">
              Stockée comme secret côté serveur. Jamais affichée.
            </p>
          </div>
          {openaiConfigured == null ? (
            <Badge variant="outline">Inconnu</Badge>
          ) : openaiConfigured ? (
            <Badge className="bg-emerald-600 hover:bg-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Configurée
            </Badge>
          ) : (
            <Badge variant="destructive">
              <XCircle className="h-3.5 w-3.5 mr-1" /> Absente
            </Badge>
          )}
        </div>
      </Card>

      <Card className="p-5 space-y-4">
        <h2 className="font-semibold">Moteur IA</h2>

        <div className="space-y-1">
          <Label>Modèle</Label>
          <Select value={config.model} onValueChange={(v) => setConfig((c) => ({ ...c, model: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {MODELS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Température (0 — 2)</Label>
            <Input
              type="number" min={0} max={2} step={0.1}
              value={config.temperature}
              onChange={(e) => setConfig((c) => ({ ...c, temperature: Number(e.target.value) }))}
            />
          </div>
          <div className="space-y-1">
            <Label>Tokens max</Label>
            <Input
              type="number" min={256} max={8000} step={100}
              value={config.max_tokens}
              onChange={(e) => setConfig((c) => ({ ...c, max_tokens: Number(e.target.value) }))}
            />
          </div>
        </div>
      </Card>

      <Card className="p-5 space-y-4">
        <div>
          <h2 className="font-semibold">Seuils de classification</h2>
          <p className="text-xs text-muted-foreground">
            Règles utilisées pour déterminer le statut (exclusive, dominante avec nuance, hybride stable).
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Exclusive — écart minimum</Label>
            <Input type="number" min={5} max={100}
              value={config.thresholds.exclusive_gap}
              onChange={(e) => setT("exclusive_gap", Number(e.target.value))} />
          </div>
          <div className="space-y-1">
            <Label>Nuance — écart min</Label>
            <Input type="number" min={1} max={100}
              value={config.thresholds.nuance_gap_min}
              onChange={(e) => setT("nuance_gap_min", Number(e.target.value))} />
          </div>
          <div className="space-y-1">
            <Label>Nuance — écart max</Label>
            <Input type="number" min={1} max={100}
              value={config.thresholds.nuance_gap_max}
              onChange={(e) => setT("nuance_gap_max", Number(e.target.value))} />
          </div>
          <div className="space-y-1">
            <Label>Hybride — score min par dimension</Label>
            <Input type="number" min={1} max={100}
              value={config.thresholds.hybrid_score_min}
              onChange={(e) => setT("hybrid_score_min", Number(e.target.value))} />
          </div>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Enregistrer
        </Button>
      </div>
    </div>
  );
}
