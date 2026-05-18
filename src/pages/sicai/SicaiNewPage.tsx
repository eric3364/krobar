import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { sicaiApi, type SicaiSource, countWords } from "@/lib/sicaiApi";

const NONE = "__none__";

export default function SicaiNewPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const presetSourceId = params.get("source");

  const [sources, setSources] = useState<SicaiSource[]>([]);
  const [loadingSources, setLoadingSources] = useState(true);

  const [title, setTitle] = useState("");
  const [sourceId, setSourceId] = useState<string>(NONE);
  const [sourceType, setSourceType] = useState("");
  const [url, setUrl] = useState("");
  const [language, setLanguage] = useState("fr");
  const [rawText, setRawText] = useState("");
  const [summary, setSummary] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await sicaiApi.listSources();
        if (alive) setSources(data);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur de chargement des sources");
      } finally {
        if (alive) setLoadingSources(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Prefill from ?source=<sicai_sources.id>
  useEffect(() => {
    if (!presetSourceId || sources.length === 0) return;
    const s = sources.find((x) => x.id === presetSourceId);
    if (!s) return;
    setSourceId(s.id);
    setTitle((prev) => prev || s.title);
    setSourceType((prev) => prev || s.source_type || "");
    setUrl((prev) => prev || s.url || "");
    setLanguage((prev) => prev || s.language || "fr");
  }, [presetSourceId, sources]);

  const selectedSource = useMemo(
    () => sources.find((s) => s.id === sourceId) ?? null,
    [sources, sourceId],
  );

  const wordCount = useMemo(() => countWords(rawText), [rawText]);

  const handleSourceChange = (v: string) => {
    setSourceId(v);
    if (v === NONE) return;
    const s = sources.find((x) => x.id === v);
    if (!s) return;
    if (!title.trim()) setTitle(s.title);
    if (!sourceType) setSourceType(s.source_type || "");
    if (!url) setUrl(s.url || "");
    if (!language) setLanguage(s.language || "fr");
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Le titre est obligatoire");
      return;
    }
    if (!rawText.trim()) {
      toast.error("Le texte complet est obligatoire");
      return;
    }
    setSaving(true);
    try {
      const doc = await sicaiApi.createDocument({
        title,
        raw_text: rawText,
        source_id: sourceId === NONE ? null : sourceId,
        source_type: sourceType,
        url,
        language,
        summary,
        internal_notes: notes,
      });
      toast.success(`Document créé (${doc.word_count} mots) — statut : draft`);
      navigate(`/admin/sicai/documents/${doc.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur à l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin/sicai/library"><ArrowLeft className="h-4 w-4 mr-1" /> Bibliothèque</Link>
        </Button>
        <h1 className="text-3xl font-bold mt-2">Nouveau document SICAI</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Collez ici le texte complet autorisé. Le document sera créé en statut <code>draft</code> ; la segmentation et l'analyse IA viennent dans des lots ultérieurs.
        </p>
      </div>

      <form onSubmit={onSubmit}>
        <Card className="p-6 space-y-5">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="md:col-span-2 space-y-1.5">
              <Label htmlFor="title">Titre <span className="text-destructive">*</span></Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="src">Source liée (optionnel)</Label>
              <Select value={sourceId} onValueChange={handleSourceChange}>
                <SelectTrigger id="src" disabled={loadingSources}>
                  <SelectValue placeholder={loadingSources ? "Chargement…" : "Aucune"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Aucune</SelectItem>
                  {sources.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.source_id} — {s.title.slice(0, 60)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedSource && (
                <p className="text-xs text-muted-foreground">
                  {selectedSource.source_name ?? "—"} · {selectedSource.language ?? "—"}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="type">Type de source</Label>
              <Input id="type" value={sourceType} onChange={(e) => setSourceType(e.target.value)} placeholder="HBR, McKinsey, presse…" />
            </div>

            <div className="md:col-span-2 space-y-1.5">
              <Label htmlFor="url">URL</Label>
              <Input id="url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lang">Langue</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger id="lang"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fr">Français (fr)</SelectItem>
                  <SelectItem value="en">English (en)</SelectItem>
                  <SelectItem value="es">Español (es)</SelectItem>
                  <SelectItem value="de">Deutsch (de)</SelectItem>
                  <SelectItem value="it">Italiano (it)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="text">Texte complet <span className="text-destructive">*</span></Label>
              <span className="text-xs text-muted-foreground">{wordCount} mots</span>
            </div>
            <Textarea
              id="text"
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              required
              rows={16}
              placeholder="Collez ici le texte autorisé du document…"
              className="font-mono text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="summary">Résumé (optionnel)</Label>
            <Textarea id="summary" value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes internes (optionnel)</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Visible uniquement par les admins" />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t">
            <Button type="button" variant="ghost" onClick={() => navigate("/admin/sicai/library")}>Annuler</Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Enregistrer le document
            </Button>
          </div>
        </Card>
      </form>
    </div>
  );
}
