import { useState } from "react";
import { toast } from "sonner";
import { Check, Copy } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { SicaiAnalysis } from "@/lib/sicaiApi";

const INTENSITY_KEYS = [
  "narration", "description", "explication", "argumentation",
  "emotion", "conceptualisation", "procedure", "opposition",
  "transformation", "synthese",
] as const;

type Intensities = Partial<Record<(typeof INTENSITY_KEYS)[number], number>>;

function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x) => typeof x === "string") as string[];
  return [];
}
function pickString(o: Record<string, unknown>, k: string): string {
  const v = o[k];
  return typeof v === "string" ? v : "";
}

export function SicaiIdentityCard({ analysis }: { analysis: SicaiAnalysis }) {
  const intensities = asObject(analysis.intensities) as Intensities;
  const cardinality = asObject(analysis.cardinality);
  const iconic = asObject(analysis.iconic_affordance);
  const brief = asObject(analysis.visual_brief);
  const secondary = asStringArray(analysis.secondary_categories);
  const confidence = asObject((analysis.ai_raw_response as Record<string, unknown> | null)?.confidence ?? {});

  return (
    <Card className="p-5 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="uppercase">{analysis.analysis_level}</Badge>
        {analysis.dominant_textual_function && (
          <Badge>{analysis.dominant_textual_function}</Badge>
        )}
        {analysis.classification_status && (
          <Badge variant="secondary">{analysis.classification_status}</Badge>
        )}
        {analysis.graphic_family && (
          <Badge variant="outline" className="text-[10px] font-mono">{analysis.graphic_family}</Badge>
        )}
        {analysis.sicai_archetype_id && (
          <Badge variant="outline" className="text-[10px] font-mono break-all">
            {analysis.sicai_archetype_id}
          </Badge>
        )}
        {analysis.ai_model && (
          <span className="ml-auto text-[10px] text-muted-foreground">{analysis.ai_model}</span>
        )}
      </div>

      {secondary.length > 0 && (
        <div className="text-xs">
          <span className="text-muted-foreground mr-2">Catégories secondaires :</span>
          <span className="space-x-1">
            {secondary.map((s) => <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>)}
          </span>
        </div>
      )}

      {/* Intensities */}
      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Intensités sémantiques
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
          {INTENSITY_KEYS.map((k) => {
            const value = Number(intensities[k] ?? 0);
            return (
              <div key={k} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="capitalize">{k}</span>
                  <span className="text-muted-foreground tabular-nums">{value}</span>
                </div>
                <Progress value={Math.max(0, Math.min(100, value))} className="h-1.5" />
              </div>
            );
          })}
        </div>
      </section>

      {/* SICAI grid */}
      <section className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KV label="Cardinalité (type)" value={pickString(cardinality, "type")} />
        <KV label="Cardinalité de base" value={pickString(cardinality, "base_cardinality_for_archetype")} />
        <KV label="Nb d'éléments" value={String(cardinality.number_of_elements ?? "—")} />
        <KV label="Temporalité" value={analysis.temporality ?? ""} />
        <KV label="Spatialité" value={analysis.spatiality ?? ""} />
        <KV label="Agency" value={analysis.agency ?? ""} />
        <KV label="Tension" value={analysis.tension ?? ""} badge />
        <KV label="Transformation" value={analysis.transformation ?? ""} />
        <KV label="Niveau d'abstraction" value={analysis.abstraction_level ?? ""} />
        <KV label="Affordance (primary)" value={pickString(iconic, "primary")} badge />
      </section>

      {asStringArray(iconic.secondary).length > 0 && (
        <div className="text-xs">
          <span className="text-muted-foreground mr-2">Affordances secondaires :</span>
          {asStringArray(iconic.secondary).map((s) => (
            <Badge key={s} variant="outline" className="text-[10px] mr-1">{s}</Badge>
          ))}
        </div>
      )}

      {/* Visual brief */}
      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Brief visuel</h3>
        <div className="rounded-md border bg-muted/30 p-3 space-y-2 text-sm">
          <BriefLine label="Résumé" value={pickString(brief, "summary")} />
          <BriefLine label="Composition" value={pickString(brief, "composition")} />
          <BriefList label="Éléments visuels" items={asStringArray(brief.visual_elements)} />
          <BriefList label="À éviter" items={asStringArray(brief.elements_to_avoid)} />
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
            <BriefInline label="Tonalité" value={pickString(brief, "tone")} />
            <BriefInline label="Style" value={pickString(brief, "style")} />
          </div>
        </div>
      </section>

      {/* Image prompt */}
      {analysis.image_prompt && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Prompt image
            </h3>
            <CopyButton text={analysis.image_prompt} />
          </div>
          <pre className="rounded-md border bg-muted/30 p-3 text-xs whitespace-pre-wrap break-words">
            {analysis.image_prompt}
          </pre>
        </section>
      )}

      {/* Confidence */}
      {(confidence.score !== undefined || confidence.comment) && (
        <section className="text-xs text-muted-foreground flex items-center gap-3 pt-1 border-t">
          <span>
            Confiance IA :{" "}
            <span className="font-mono tabular-nums text-foreground">
              {typeof confidence.score === "number" ? confidence.score : "—"}
            </span>
          </span>
          {typeof confidence.comment === "string" && confidence.comment && (
            <span className="italic">— {confidence.comment}</span>
          )}
        </section>
      )}
    </Card>
  );
}

function KV({ label, value, badge }: { label: string; value: string; badge?: boolean }) {
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      {value
        ? badge
          ? <Badge variant="secondary" className="text-[11px]">{value}</Badge>
          : <div className="text-sm">{value}</div>
        : <div className="text-sm text-muted-foreground">—</div>}
    </div>
  );
}

function BriefLine({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div>{value}</div>
    </div>
  );
}

function BriefList({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <ul className="list-disc pl-5">
        {items.map((it, i) => <li key={i}>{it}</li>)}
      </ul>
    </div>
  );
}

function BriefInline({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return <span><span className="text-muted-foreground">{label} :</span> {value}</span>;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Prompt image copié");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Impossible de copier");
    }
  };
  return (
    <Button size="sm" variant="ghost" onClick={onCopy} className="h-7 px-2 text-xs">
      {copied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
      Copier le prompt image
    </Button>
  );
}
