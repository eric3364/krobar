import React, { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAdminToken } from "@/contexts/AdminTokenContext";
import { useAdminApi } from "@/lib/adminApi";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Upload, Check, X, AlertTriangle, RotateCcw, Image, FileCode } from "lucide-react";

type DraftResult = {
  draft_id: string;
  metadata: { id: string; name: string; category: string; description: string; best_for: string };
  slots: string[];
  slot_count: number;
  test_text: string;
};

type ValidationResult = {
  draft_id: string;
  success: boolean;
  attempts: { attempt: number; position_in_top3: number; fill_ratio: number; top1_suggested: string }[];
  final_metadata: Record<string, unknown>;
};

type DeployResult = {
  deployed: boolean;
  template_id: string;
  total_templates: number;
  manifest_backup: string;
};

type ConversionMode = "smart" | "trace";

const STEPS = ["Créer", "Valider", "Déployer"] as const;

export default function AdminTemplateCreatePage() {
  const { hasToken } = useAdminToken();
  const api = useAdminApi();

  // Step tracking
  const [currentStep, setCurrentStep] = useState(0);

  // Step 1
  const [svgContent, setSvgContent] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileType, setFileType] = useState<"svg" | "png" | null>(null);
  const [pngPreview, setPngPreview] = useState<string | null>(null);
  const [pngBase64, setPngBase64] = useState<string | null>(null);
  const [conversionMode, setConversionMode] = useState<ConversionMode>("smart");
  const [converting, setConverting] = useState(false);
  const [hint, setHint] = useState("");
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<DraftResult | null>(null);

  // Step 2
  const [maxIter, setMaxIter] = useState(3);
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);

  // Step 3
  const [deploying, setDeploying] = useState(false);
  const [deployResult, setDeployResult] = useState<DeployResult | null>(null);

  const handleFile = useCallback((file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();

    if (ext === "svg") {
      setFileType("svg");
      setFileName(file.name);
      setPngPreview(null);
      setPngBase64(null);
      const reader = new FileReader();
      reader.onload = (e) => setSvgContent(e.target?.result as string);
      reader.readAsText(file);
    } else if (ext === "png" || ext === "jpg" || ext === "jpeg" || ext === "webp") {
      setFileType("png");
      setFileName(file.name);
      setSvgContent("");
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        setPngPreview(dataUrl);
        // Strip data URL prefix for API
        const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, "");
        setPngBase64(base64);
      };
      reader.readAsDataURL(file);
    } else {
      toast.error("Formats acceptés : .svg, .png, .jpg, .webp");
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleConvertPng = async () => {
    if (!pngBase64) return;
    setConverting(true);
    try {
      const { data, error } = await supabase.functions.invoke("png-to-svg", {
        body: { image_base64: pngBase64, mode: conversionMode, hint: hint || undefined },
      });

      if (error) throw new Error(error.message || "Erreur de conversion");
      if (data?.error) throw new Error(data.error);

      setSvgContent(data.svg);
      toast.success(
        conversionMode === "smart"
          ? `SVG généré avec ${data.slot_count} slots détectés`
          : "SVG tracé généré avec succès"
      );
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erreur lors de la conversion PNG → SVG");
    } finally {
      setConverting(false);
    }
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      const result = await api.createDraft(svgContent, hint || undefined);
      setDraft(result);
      setCurrentStep(1);
      toast.success("Draft créé avec succès");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erreur lors de la création");
    } finally {
      setCreating(false);
    }
  };

  const handleValidate = async () => {
    if (!draft) return;
    setValidating(true);
    try {
      const result = await api.validateDraft(draft.draft_id, maxIter);
      setValidation(result);
      if (result.success) setCurrentStep(2);
      toast[result.success ? "success" : "error"](
        result.success ? "Validation réussie !" : "Validation échouée"
      );
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erreur lors de la validation");
    } finally {
      setValidating(false);
    }
  };

  const handleDeploy = async () => {
    if (!draft) return;
    setDeploying(true);
    try {
      const result = await api.deployDraft(draft.draft_id);
      setDeployResult(result);
      toast.success("Template déployé !");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erreur lors du déploiement");
    } finally {
      setDeploying(false);
    }
  };

  const handleForceDeploy = async () => {
    if (!draft) return;
    setDeploying(true);
    try {
      const result = await api.deployDraft(draft.draft_id);
      setDeployResult(result);
      toast.success("Template déployé (forcé) !");
      setCurrentStep(2);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erreur lors du déploiement forcé");
    } finally {
      setDeploying(false);
    }
  };

  const resetAll = () => {
    setSvgContent("");
    setFileName("");
    setFileType(null);
    setPngPreview(null);
    setPngBase64(null);
    setHint("");
    setDraft(null);
    setValidation(null);
    setDeployResult(null);
    setCurrentStep(0);
  };

  const canCreate = svgContent.length > 0 && hasToken && !creating;

  // Deployed state
  if (deployResult) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <Stepper current={3} />
        <Card className="p-8 text-center space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 text-green-600 mx-auto">
            <Check className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold">Template déployé</h2>
          <p className="text-muted-foreground">
            <strong>{deployResult.template_id}</strong> est maintenant actif.
          </p>
          <p className="text-sm text-muted-foreground">
            {deployResult.total_templates} templates dans la bibliothèque
          </p>
          <div className="flex items-center justify-center gap-3 pt-4">
            <Button asChild variant="outline">
              <Link to="/admin/benchmark">Vérifier dans le Benchmark</Link>
            </Button>
            <Button onClick={resetAll}>
              <RotateCcw className="w-4 h-4 mr-2" /> Créer un autre template
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Nouveau template</h1>

      <Stepper current={currentStep} />

      {/* ── STEP 1: Upload + Create ── */}
      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <StepBadge n={1} active={currentStep === 0} done={currentStep > 0} />
          Upload fichier
        </h2>

        {currentStep === 0 ? (
          <>
            {/* Drop zone */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
              onClick={() => document.getElementById("file-input")?.click()}
            >
              <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                {fileName ? (
                  <span className="flex items-center justify-center gap-2">
                    {fileType === "svg" ? <FileCode className="w-4 h-4" /> : <Image className="w-4 h-4" />}
                    {fileName}
                  </span>
                ) : (
                  "Glisser un fichier .svg ou .png ici, ou cliquer pour choisir"
                )}
              </p>
              <p className="text-xs text-muted-foreground mt-1">SVG (direct) • PNG/JPG/WebP (conversion IA)</p>
              <input
                id="file-input"
                type="file"
                accept=".svg,.png,.jpg,.jpeg,.webp"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </div>

            {/* PNG Preview + Conversion */}
            {fileType === "png" && pngPreview && (
              <div className="space-y-3">
                <div className="border rounded-lg p-4 bg-white overflow-auto max-h-64">
                  <img src={pngPreview} alt="Preview" className="max-w-full h-auto mx-auto" />
                </div>

                {/* Mode selector */}
                <div className="flex items-center gap-3">
                  <label className="text-sm font-medium whitespace-nowrap">Mode de conversion :</label>
                  <Select value={conversionMode} onValueChange={(v) => setConversionMode(v as ConversionMode)}>
                    <SelectTrigger className="w-64">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="smart">
                        🧠 Interprétation intelligente (slots éditables)
                      </SelectItem>
                      <SelectItem value="trace">
                        ✏️ Tracé vectoriel fidèle
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <p className="text-xs text-muted-foreground">
                  {conversionMode === "smart"
                    ? "L'IA analyse le schéma et génère un SVG templaté avec des slots {{slot_name}} éditables."
                    : "L'IA reproduit l'image pixel par pixel en SVG. Pas de slots éditables."}
                </p>

                {/* Convert button */}
                {!svgContent && (
                  <Button onClick={handleConvertPng} disabled={converting} variant="secondary">
                    {converting ? (
                      <>
                        <Loader2 className="animate-spin mr-2 h-4 w-4" />
                        Conversion en cours (peut prendre 15-30s)...
                      </>
                    ) : (
                      <>
                        <Image className="w-4 h-4 mr-2" /> Convertir en SVG
                      </>
                    )}
                  </Button>
                )}
              </div>
            )}

            {/* SVG Preview (from direct upload or conversion) */}
            {svgContent && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {fileType === "png" ? "SVG converti" : "SVG importé"}
                  </Badge>
                  {fileType === "png" && (
                    <Button variant="ghost" size="sm" onClick={() => { setSvgContent(""); }} className="text-xs">
                      Reconvertir
                    </Button>
                  )}
                </div>
                <div className="border rounded-lg p-4 bg-white overflow-auto max-h-64">
                  <div dangerouslySetInnerHTML={{ __html: svgContent }} className="[&>svg]:max-w-full [&>svg]:h-auto" />
                </div>
              </div>
            )}

            {/* Hint */}
            <div>
              <label className="text-sm font-medium">Indication libre (optionnel)</label>
              <Textarea
                value={hint}
                onChange={(e) => setHint(e.target.value.slice(0, 500))}
                placeholder="Décrivez à quoi sert ce template..."
                rows={3}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">{hint.length}/500</p>
            </div>

            <Button onClick={handleCreate} disabled={!canCreate}>
              {creating ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : null}
              Créer le draft
            </Button>
          </>
        ) : (
          /* Summary when done */
          draft && (
            <div className="space-y-2 text-sm">
              <p><strong>ID :</strong> <code className="text-base">{draft.draft_id}</code></p>
              <p><strong>Nom :</strong> {draft.metadata.name}</p>
              <p><strong>Catégorie :</strong> {draft.metadata.category}</p>
              <p><strong>Description :</strong> {draft.metadata.description}</p>
              <p><strong>Best for :</strong> {draft.metadata.best_for}</p>
              <p><strong>Slots ({draft.slots.length}) :</strong> {draft.slots.join(", ")}</p>
              <div>
                <strong>Texte de test :</strong>
                <Textarea readOnly value={draft.test_text} rows={4} className="mt-1 bg-muted" />
              </div>
              {currentStep === 1 && (
                <Button variant="ghost" size="sm" onClick={() => { setCurrentStep(0); setDraft(null); setValidation(null); }}>
                  ← Modifier
                </Button>
              )}
            </div>
          )
        )}
      </Card>

      {/* ── STEP 2: Validate ── */}
      {currentStep >= 1 && (
        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <StepBadge n={2} active={currentStep === 1} done={currentStep > 1} />
            Validation automatique
          </h2>

          {!validation ? (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">Itérations max : {maxIter}</label>
                <Slider value={[maxIter]} onValueChange={(v) => setMaxIter(v[0])} min={1} max={5} step={1} className="max-w-xs" />
              </div>

              {validating && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="animate-spin h-4 w-4" />
                  Analyse en cours, jusqu'à {maxIter} itérations possibles (peut prendre 30-60s)...
                </div>
              )}

              <Button onClick={handleValidate} disabled={!hasToken || validating}>
                {validating ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : null}
                Lancer la validation
              </Button>
            </>
          ) : (
            <div className="space-y-4">
              {/* Result badge */}
              <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold ${validation.success ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                {validation.success ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                {validation.success ? "Validé ✅" : "Échec ❌"}
              </div>

              {/* Attempts table */}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tentative</TableHead>
                    <TableHead>Position</TableHead>
                    <TableHead>Remplissage</TableHead>
                    <TableHead>Top 1 suggéré</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {validation.attempts.map((a) => (
                    <TableRow key={a.attempt}>
                      <TableCell>#{a.attempt}</TableCell>
                      <TableCell>
                        <Badge variant={a.position_in_top3 === 0 ? "default" : a.position_in_top3 > 0 ? "secondary" : "destructive"}>
                          {a.position_in_top3 === -1 ? "Absent" : `Top ${a.position_in_top3 + 1}`}
                        </Badge>
                      </TableCell>
                      <TableCell>{Math.round(a.fill_ratio * 100)}%</TableCell>
                      <TableCell className="font-mono text-xs">{a.top1_suggested}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {validation.success ? (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Metadata finales validées. Prêt pour le déploiement.</p>
                  <Button onClick={() => setCurrentStep(2)} variant="default">
                    Continuer vers le déploiement →
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Le template n'arrive pas à se distinguer après {validation.attempts.length} itérations.
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => { setDraft(null); setValidation(null); setCurrentStep(0); }}>
                      <RotateCcw className="w-4 h-4 mr-2" /> Recommencer avec un nouvel hint
                    </Button>
                    <Button variant="destructive" onClick={handleForceDeploy} disabled={deploying || !hasToken}>
                      {deploying ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <AlertTriangle className="w-4 h-4 mr-2" />}
                      Forcer le déploiement
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* ── STEP 3: Deploy ── */}
      {currentStep >= 2 && !deployResult && (
        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <StepBadge n={3} active={currentStep === 2} done={false} />
            Déploiement
          </h2>

          <div className="space-y-2 text-sm">
            <p><strong>Template :</strong> {draft?.draft_id}</p>
            <p><strong>Catégorie :</strong> {draft?.metadata.category}</p>
            <p><strong>Slots :</strong> {draft?.slots.join(", ")}</p>
          </div>

          <div className="flex items-center gap-2 p-3 rounded-md bg-orange-50 border border-orange-200 text-orange-800 text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            Cette action est définitive. Le manifest live et les fichiers SVG seront modifiés. Un backup sera automatiquement créé.
          </div>

          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setCurrentStep(1)}>← Retour</Button>
            <Button onClick={handleDeploy} disabled={!hasToken || deploying}>
              {deploying ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : null}
              Déployer définitivement
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

/* ── Sub-components ── */

function Stepper({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2">
      {STEPS.map((label, i) => (
        <React.Fragment key={label}>
          {i > 0 && <div className={`flex-1 h-0.5 ${i <= current ? "bg-green-500" : "bg-border"}`} />}
          <div className={`flex items-center gap-1.5 text-xs font-medium ${i < current ? "text-green-600" : i === current ? "text-primary" : "text-muted-foreground"}`}>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${i < current ? "bg-green-500 text-white" : i === current ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {i < current ? <Check className="w-3 h-3" /> : i + 1}
            </div>
            {label}
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

function StepBadge({ n, active, done }: { n: number; active: boolean; done: boolean }) {
  if (done) return <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-500 text-white text-xs"><Check className="w-3 h-3" /></span>;
  return (
    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
      {n}
    </span>
  );
}
