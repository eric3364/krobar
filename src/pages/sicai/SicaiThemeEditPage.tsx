import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, Save, ArrowLeft, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

type ThemeRow = {
  id: string;
  code: string;
  label_fr: string;
  description: string | null;
  status: string;
  is_protected: boolean;
  version: number;
  prompt_bloc_addition: string | null;
  constraints: string | null;
  cell_briefs: Record<string, unknown>;
  visual_lexicon: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

const CODE_RE = /^[a-z0-9_]+$/;

function emptyTheme(): Partial<ThemeRow> {
  return {
    code: "",
    label_fr: "",
    description: "",
    status: "draft",
    is_protected: false,
    version: 1,
    prompt_bloc_addition: "",
    constraints: "",
    cell_briefs: {},
    visual_lexicon: {},
  };
}

function jsonStringify(v: unknown): string {
  try {
    return JSON.stringify(v ?? {}, null, 2);
  } catch {
    return "{}";
  }
}

export default function SicaiThemeEditPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === "new";

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [original, setOriginal] = useState<ThemeRow | null>(null);
  const [form, setForm] = useState<Partial<ThemeRow>>(emptyTheme());
  const [lexiconText, setLexiconText] = useState("{}");
  const [briefsText, setBriefsText] = useState("{}");
  const [lexiconErr, setLexiconErr] = useState<string | null>(null);
  const [briefsErr, setBriefsErr] = useState<string | null>(null);

  useEffect(() => {
    if (isNew) return;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("sicai_themes").select("*").eq("id", id!).maybeSingle();
        if (error) throw error;
        if (!data) {
          toast.error("Thème introuvable");
          navigate("/admin/sicai/themes");
          return;
        }
        const t = data as ThemeRow;
        setOriginal(t);
        setForm(t);
        setLexiconText(jsonStringify(t.visual_lexicon));
        setBriefsText(jsonStringify(t.cell_briefs));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur de chargement");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, isNew, navigate]);

  const codeLocked = !isNew;
  const protectedLocked = !isNew && !!original?.is_protected;

  const parsedLexicon = useMemo(() => {
    try { const v = JSON.parse(lexiconText); setLexiconErr(null); return v; }
    catch (e) { setLexiconErr((e as Error).message); return null; }
  }, [lexiconText]);
  const parsedBriefs = useMemo(() => {
    try { const v = JSON.parse(briefsText); setBriefsErr(null); return v; }
    catch (e) { setBriefsErr((e as Error).message); return null; }
  }, [briefsText]);

  const lexiconNonEmpty = useMemo(() => {
    if (!parsedLexicon || typeof parsedLexicon !== "object") return false;
    return Object.values(parsedLexicon as Record<string, unknown>).some((v) => {
      if (Array.isArray(v)) return v.length > 0;
      if (v && typeof v === "object") return Object.keys(v).length > 0;
      return !!v;
    });
  }, [parsedLexicon]);

  const onSave = async () => {
    // Validation
    const code = (form.code ?? "").trim();
    const label = (form.label_fr ?? "").trim();
    if (isNew) {
      if (!code) return toast.error("Le code est requis");
      if (!CODE_RE.test(code)) return toast.error("Code invalide (a-z, 0-9, _ uniquement)");
    }
    if (!label) return toast.error("Le label FR est requis");
    if (lexiconErr) return toast.error(`visual_lexicon: ${lexiconErr}`);
    if (briefsErr) return toast.error(`cell_briefs: ${briefsErr}`);
    if (parsedLexicon && typeof parsedLexicon !== "object")
      return toast.error("visual_lexicon doit être un objet JSON");
    if (parsedBriefs && typeof parsedBriefs !== "object")
      return toast.error("cell_briefs doit être un objet JSON");
    if (form.status === "active" && !lexiconNonEmpty)
      return toast.error("Un thème actif doit avoir au moins une catégorie de lexique non vide (Bloc 0.5)");

    setSaving(true);
    try {
      if (isNew) {
        // Unique code check
        const { data: ex } = await supabase
          .from("sicai_themes").select("id").eq("code", code).maybeSingle();
        if (ex) {
          toast.error("Ce code est déjà utilisé");
          setSaving(false);
          return;
        }
        const payload = {
          code,
          label_fr: label,
          description: form.description || null,
          status: form.status ?? "draft",
          is_protected: !!form.is_protected,
          prompt_bloc_addition: form.prompt_bloc_addition || null,
          constraints: form.constraints || null,
          visual_lexicon: parsedLexicon ?? {},
          cell_briefs: parsedBriefs ?? {},
        };
        const { data, error } = await supabase
          .from("sicai_themes").insert(payload).select("id").single();
        if (error) throw error;
        toast.success("Thème créé");
        navigate(`/admin/sicai/themes/${data.id}`);
      } else {
        const payload = {
          label_fr: label,
          description: form.description || null,
          status: form.status ?? "draft",
          prompt_bloc_addition: form.prompt_bloc_addition || null,
          constraints: form.constraints || null,
          visual_lexicon: parsedLexicon ?? {},
          cell_briefs: parsedBriefs ?? {},
          version: (original?.version ?? 1) + 1,
          ...(protectedLocked ? {} : { is_protected: !!form.is_protected }),
        };
        const { error } = await supabase
          .from("sicai_themes").update(payload).eq("id", id!);
        if (error) throw error;
        toast.success("Thème enregistré");
        const { data: fresh } = await supabase
          .from("sicai_themes").select("*").eq("id", id!).maybeSingle();
        if (fresh) {
          setOriginal(fresh as ThemeRow);
          setForm(fresh as ThemeRow);
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur d'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">
              <Link to="/admin/sicai" className="hover:underline">SICAI</Link> /{" "}
              <Link to="/admin/sicai/themes" className="hover:underline">Thèmes</Link> /{" "}
              {isNew ? "Nouveau" : original?.code}
            </div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              {isNew ? "Nouveau thème" : original?.label_fr}
              {protectedLocked && (
                <Badge variant="outline" className="gap-1">
                  <Shield className="h-3 w-3" /> Protégé
                </Badge>
              )}
            </h1>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/admin/sicai/themes")}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Retour
            </Button>
            <Button onClick={onSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
              Enregistrer
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 grid gap-6 max-w-4xl">
        <Card className="p-4 grid gap-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="code">Code {codeLocked && <span className="text-xs text-muted-foreground">(immuable)</span>}</Label>
              <Input
                id="code"
                value={form.code ?? ""}
                disabled={codeLocked}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="ex. neutre, energie_renouvelable"
              />
              {isNew && (
                <p className="text-xs text-muted-foreground">Minuscules, chiffres, underscore. Non modifiable après création.</p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="label_fr">Label FR *</Label>
              <Input
                id="label_fr"
                value={form.label_fr ?? ""}
                onChange={(e) => setForm({ ...form, label_fr: e.target.value })}
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              rows={2}
              value={form.description ?? ""}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label>Status</Label>
              <Select
                value={form.status ?? "draft"}
                onValueChange={(v) => setForm({ ...form, status: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="archived">Archivé</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Protection</Label>
              <label className="flex items-center gap-2 h-10 text-sm">
                <input
                  type="checkbox"
                  checked={!!form.is_protected}
                  disabled={protectedLocked}
                  onChange={(e) => setForm({ ...form, is_protected: e.target.checked })}
                />
                <span>Thème protégé (non archivable, non modifiable en lot)</span>
              </label>
              {protectedLocked && (
                <p className="text-xs text-muted-foreground">La protection ne peut pas être retirée depuis l'UI.</p>
              )}
            </div>
          </div>
        </Card>

        <Card className="p-4 grid gap-4">
          <div>
            <h2 className="font-medium">Bloc prompt — Addition thématique</h2>
            <p className="text-xs text-muted-foreground">
              Texte ajouté au prompt résolu (Bloc 1). Vide = thème neutre.
            </p>
          </div>
          <Textarea
            rows={6}
            value={form.prompt_bloc_addition ?? ""}
            onChange={(e) => setForm({ ...form, prompt_bloc_addition: e.target.value })}
            placeholder="Ex. Univers visuel énergies renouvelables : éoliennes stylisées, panneaux solaires…"
          />
        </Card>

        <Card className="p-4 grid gap-4">
          <div>
            <h2 className="font-medium">Contraintes</h2>
            <p className="text-xs text-muted-foreground">
              Règles dures appliquées au rendu (palette imposée, motifs interdits…).
            </p>
          </div>
          <Textarea
            rows={4}
            value={form.constraints ?? ""}
            onChange={(e) => setForm({ ...form, constraints: e.target.value })}
          />
        </Card>

        <Card className="p-4 grid gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-medium">Lexique visuel (Bloc 0.5)</h2>
              <p className="text-xs text-muted-foreground">
                JSON : catégorie → liste de termes. Au moins une catégorie non vide pour status=active.
              </p>
            </div>
            <Badge variant={lexiconNonEmpty ? "default" : "outline"}>
              {lexiconNonEmpty ? "Non vide" : "Vide"}
            </Badge>
          </div>
          <Textarea
            rows={10}
            className="font-mono text-xs"
            value={lexiconText}
            onChange={(e) => setLexiconText(e.target.value)}
          />
          {lexiconErr && <p className="text-xs text-destructive">JSON invalide : {lexiconErr}</p>}
        </Card>

        <Card className="p-4 grid gap-4">
          <div>
            <h2 className="font-medium">Cell briefs</h2>
            <p className="text-xs text-muted-foreground">
              JSON : clé composite (famille|cardinalité|régime) → brief thématique additif.
            </p>
          </div>
          <Textarea
            rows={10}
            className="font-mono text-xs"
            value={briefsText}
            onChange={(e) => setBriefsText(e.target.value)}
          />
          {briefsErr && <p className="text-xs text-destructive">JSON invalide : {briefsErr}</p>}
        </Card>

        {!isNew && original && (
          <div className="text-xs text-muted-foreground">
            Version actuelle : v{original.version} · Mis à jour {new Date(original.updated_at).toLocaleString("fr-FR")}
          </div>
        )}
      </main>
    </div>
  );
}
