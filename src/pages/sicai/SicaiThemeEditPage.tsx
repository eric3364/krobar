import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, Save, ArrowLeft, Shield, Plus, X, RotateCcw } from "lucide-react";
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
import SicaiCellBriefsEditor, { type CellBriefs } from "./SicaiCellBriefsEditor";

type LexiconKey = "equipments" | "scenes" | "gestures" | "characters" | "abstract_metaphors";

const LEXICON_SECTIONS: { key: LexiconKey; title: string; hint: string }[] = [
  { key: "equipments", title: "Équipements / objets", hint: "Objets matériels et artefacts." },
  { key: "scenes", title: "Lieux / scènes", hint: "Environnements, cadres, décors." },
  { key: "gestures", title: "Gestes / actions", hint: "Verbes d'action observables." },
  { key: "characters", title: "Personnages", hint: "Acteurs humains ou anthropomorphisés." },
  { key: "abstract_metaphors", title: "Métaphores abstraites", hint: "Pour régime systémique." },
];

type Lexicon = Record<LexiconKey, string[]>;

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

function emptyLex(): Lexicon {
  return { equipments: [], scenes: [], gestures: [], characters: [], abstract_metaphors: [] };
}
function normalizeLex(v: unknown): Lexicon {
  const out = emptyLex();
  if (!v || typeof v !== "object") return out;
  const src = v as Record<string, unknown>;
  for (const k of Object.keys(out) as LexiconKey[]) {
    const arr = src[k];
    if (Array.isArray(arr)) out[k] = arr.map((s) => String(s).trim()).filter(Boolean);
  }
  return out;
}

/** Mirrors supabase/functions/_shared/sicai.ts buildBloc05 — keep byte-identical. */
function buildBloc05(args: {
  label_fr: string;
  description: string | null;
  visual_lexicon: Lexicon;
  constraints: string | null;
}): string | null {
  const lex = args.visual_lexicon;
  const constraints = (args.constraints ?? "").trim();
  const equipments = lex.equipments.filter(Boolean);
  const scenes = lex.scenes.filter(Boolean);
  const gestures = lex.gestures.filter(Boolean);
  const characters = lex.characters.filter(Boolean);
  const metaphors = lex.abstract_metaphors.filter(Boolean);
  const anyLex = equipments.length + scenes.length + gestures.length + characters.length + metaphors.length > 0;
  if (!anyLex && !constraints) return null;

  const lines: string[] = [];
  lines.push(`[Bloc 0.5 — Univers thématique imposé : ${args.label_fr}]`);
  const desc = (args.description ?? "").trim();
  if (desc) lines.push(desc);
  if (anyLex) {
    lines.push("");
    lines.push("Lexique visuel à privilégier exclusivement :");
    if (equipments.length) lines.push(`- Équipements/objets : ${equipments.join(", ")}`);
    if (scenes.length) lines.push(`- Lieux/scènes : ${scenes.join(", ")}`);
    if (gestures.length) lines.push(`- Gestes/actions : ${gestures.join(", ")}`);
    if (characters.length) lines.push(`- Personnages : ${characters.join(", ")}`);
    if (metaphors.length) lines.push(`- Métaphores abstraites (pour régime systémique) : ${metaphors.join(", ")}`);
  }
  if (constraints) {
    lines.push("");
    lines.push(`Contraintes spécifiques au domaine : ${constraints}`);
  }
  lines.push("");
  lines.push(
    "Rappel : le régime représentationnel et la cardinalité (voir Bloc 2) " +
    "restent prioritaires sur le domaine thématique. La charte graphique B&W " +
    "éditoriale (Bloc 3) reste strictement identique. Les zones placeholder " +
    "(Bloc 0) doivent rester strictement vides.",
  );
  return lines.join("\n");
}

function TagsField({
  title, hint, values, onChange,
}: { title: string; hint: string; values: string[]; onChange: (v: string[]) => void }) {
  const [input, setInput] = useState("");
  const add = () => {
    const v = input.trim();
    if (!v) return;
    if (values.includes(v)) { setInput(""); return; }
    onChange([...values, v]);
    setInput("");
  };
  return (
    <div className="grid gap-2">
      <div>
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder="Ajouter un terme et Entrée…"
        />
        <Button type="button" variant="outline" size="icon" onClick={add}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {values.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {values.map((v, i) => (
            <Badge key={`${v}-${i}`} variant="secondary" className="gap-1 pl-2 pr-1 py-1">
              <span>{v}</span>
              <button
                type="button"
                onClick={() => onChange(values.filter((_, j) => j !== i))}
                className="inline-flex items-center justify-center rounded hover:bg-muted-foreground/20 p-0.5"
                aria-label={`Supprimer ${v}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : (
        <div className="text-xs text-muted-foreground italic">Vide — cette catégorie sera omise du Bloc 0.5.</div>
      )}
    </div>
  );
}

export default function SicaiThemeEditPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === "new";

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [original, setOriginal] = useState<ThemeRow | null>(null);

  // Form fields
  const [code, setCode] = useState("");
  const [labelFr, setLabelFr] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("draft");
  const [isProtected, setIsProtected] = useState(false);
  const [constraints, setConstraints] = useState("");
  const [lexicon, setLexicon] = useState<Lexicon>(emptyLex());
  const [cellBriefs, setCellBriefs] = useState<CellBriefs>({});

  // Bloc 0.5 manual override
  const [manualEdit, setManualEdit] = useState(false);
  const [manualText, setManualText] = useState("");

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
        setCode(t.code);
        setLabelFr(t.label_fr);
        setDescription(t.description ?? "");
        setStatus(t.status);
        setIsProtected(t.is_protected);
        setConstraints(t.constraints ?? "");
        setLexicon(normalizeLex(t.visual_lexicon));
        // Normalize cell_briefs into Record<string,string>
        const cb: CellBriefs = {};
        if (t.cell_briefs && typeof t.cell_briefs === "object") {
          for (const [k, v] of Object.entries(t.cell_briefs as Record<string, unknown>)) {
            if (typeof v === "string" && v.trim()) cb[k] = v;
          }
        }
        setCellBriefs(cb);
        const manual = (t.prompt_bloc_addition ?? "").trim();
        if (manual) {
          setManualEdit(true);
          setManualText(t.prompt_bloc_addition ?? "");
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur de chargement");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, isNew, navigate]);

  const protectedLocked = !isNew && !!original?.is_protected;
  const codeLocked = !isNew;

  const autoBloc05 = useMemo(
    () => buildBloc05({
      label_fr: labelFr || "(sans label)",
      description: description || null,
      visual_lexicon: lexicon,
      constraints: constraints || null,
    }),
    [labelFr, description, lexicon, constraints],
  );

  const lexiconNonEmpty = useMemo(
    () => Object.values(lexicon).some((arr) => arr.length > 0),
    [lexicon],
  );

  const onSave = async () => {
    const c = code.trim();
    const l = labelFr.trim();
    if (isNew) {
      if (!c) return toast.error("Le code est requis");
      if (!CODE_RE.test(c)) return toast.error("Code invalide (a-z, 0-9, _ uniquement)");
    }
    if (!l) return toast.error("Le label FR est requis");

    const manualTrim = manualEdit ? manualText.trim() : "";
    if (status === "active" && !lexiconNonEmpty && !manualTrim) {
      return toast.error(
        "Statut actif : au moins une catégorie de lexique ou un Bloc 0.5 manuel non vide est requis.",
      );
    }

    setSaving(true);
    try {
      // Strip empty arrays from lexicon for compactness
      const lexPayload: Record<string, string[]> = {};
      for (const k of Object.keys(lexicon) as LexiconKey[]) {
        if (lexicon[k].length > 0) lexPayload[k] = lexicon[k];
      }

      if (isNew) {
        const { data: ex } = await supabase
          .from("sicai_themes").select("id").eq("code", c).maybeSingle();
        if (ex) {
          toast.error("Ce code est déjà utilisé");
          setSaving(false);
          return;
        }
        const { data, error } = await supabase
          .from("sicai_themes").insert({
            code: c,
            label_fr: l,
            description: description || null,
            status,
            is_protected: isProtected,
            constraints: constraints || null,
            visual_lexicon: lexPayload,
            cell_briefs: cellBriefs,
            prompt_bloc_addition: manualEdit && manualTrim ? manualText : null,
          }).select("id").single();
        if (error) throw error;
        toast.success("Thème créé");
        navigate(`/admin/sicai/themes/${data.id}`);
      } else {
        const { error } = await supabase
          .from("sicai_themes").update({
            label_fr: l,
            description: description || null,
            status,
            constraints: constraints || null,
            visual_lexicon: lexPayload,
            prompt_bloc_addition: manualEdit && manualTrim ? manualText : null,
            version: (original?.version ?? 1) + 1,
            ...(protectedLocked ? {} : { is_protected: isProtected }),
          }).eq("id", id!);
        if (error) throw error;
        toast.success("Thème enregistré");
        const { data: fresh } = await supabase
          .from("sicai_themes").select("*").eq("id", id!).maybeSingle();
        if (fresh) setOriginal(fresh as ThemeRow);
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
                id="code" value={code} disabled={codeLocked}
                onChange={(e) => setCode(e.target.value)}
                placeholder="ex. neutre, energie_renouvelable"
              />
              {isNew && (
                <p className="text-xs text-muted-foreground">Minuscules, chiffres, underscore. Non modifiable après création.</p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="label_fr">Label FR *</Label>
              <Input id="label_fr" value={labelFr} onChange={(e) => setLabelFr(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
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
                  type="checkbox" checked={isProtected} disabled={protectedLocked}
                  onChange={(e) => setIsProtected(e.target.checked)}
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
            <h2 className="font-medium">Contraintes</h2>
            <p className="text-xs text-muted-foreground">Règles dures appliquées au rendu (palette, motifs interdits…).</p>
          </div>
          <Textarea rows={4} value={constraints} onChange={(e) => setConstraints(e.target.value)} />
        </Card>

        <Card className="p-4 grid gap-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-medium">Lexique visuel (Bloc 0.5)</h2>
              <p className="text-xs text-muted-foreground">
                Au moins une catégorie non vide requise pour status=active (sauf si Bloc 0.5 manuel renseigné).
              </p>
            </div>
            <Badge variant={lexiconNonEmpty ? "default" : "outline"}>
              {lexiconNonEmpty ? "Non vide" : "Vide"}
            </Badge>
          </div>
          <div className="grid gap-5">
            {LEXICON_SECTIONS.map(({ key, title, hint }) => (
              <TagsField
                key={key}
                title={title}
                hint={hint}
                values={lexicon[key]}
                onChange={(v) => setLexicon({ ...lexicon, [key]: v })}
              />
            ))}
          </div>
        </Card>

        <Card className="p-4 grid gap-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-medium">Bloc 0.5 — Aperçu auto-généré</h2>
              <p className="text-xs text-muted-foreground">
                Calculé en live depuis le lexique + contraintes. Coche « Édition manuelle » pour figer une version personnalisée.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm whitespace-nowrap">
              <input
                type="checkbox" checked={manualEdit}
                onChange={(e) => {
                  const v = e.target.checked;
                  setManualEdit(v);
                  if (v && !manualText.trim()) setManualText(autoBloc05 ?? "");
                }}
              />
              Édition manuelle
            </label>
          </div>
          {manualEdit ? (
            <>
              <Textarea
                rows={14} className="font-mono text-xs"
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                placeholder="Bloc 0.5 personnalisé…"
              />
              <div>
                <Button
                  type="button" variant="outline" size="sm"
                  onClick={() => { setManualEdit(false); setManualText(""); }}
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1" /> Retour à l'auto-génération
                </Button>
              </div>
            </>
          ) : (
            <Textarea
              rows={14} readOnly
              className="font-mono text-xs bg-muted/30"
              value={autoBloc05 ?? "(aucun Bloc 0.5 — thème neutre : ni lexique, ni contraintes)"}
            />
          )}
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
