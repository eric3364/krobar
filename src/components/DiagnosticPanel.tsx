import { useEffect, useMemo, useState } from "react";
import { Copy, Download, X, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import KrobarSvg from "@/components/KrobarSvg";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import type {
  AnnotatorInstance,
  IntermediateSteps,
  OcrRegion,
} from "@/mocks/template-creator";

export type DiagnosticVersion = {
  id: string;
  label: string;
  createdAt: number;
  steps: IntermediateSteps;
};

type TileKey = "source" | "cleaned" | "vectorized" | "annotated";

export function DiagnosticPanel({
  versions,
}: {
  versions: DiagnosticVersion[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(
    versions[versions.length - 1]?.id ?? null,
  );
  const [openTile, setOpenTile] = useState<TileKey | null>(null);

  // Always select the latest version when a new one arrives
  useEffect(() => {
    if (versions.length === 0) return;
    setSelectedId(versions[versions.length - 1].id);
  }, [versions.length]);

  const current = useMemo(
    () => versions.find((v) => v.id === selectedId) ?? versions[versions.length - 1],
    [versions, selectedId],
  );

  if (!current) {
    return (
      <div className="text-sm text-muted-foreground border rounded-md p-6 text-center">
        Les étapes intermédiaires ne sont pas disponibles pour cette génération
        (mode mock ou option désactivée côté backend).
      </div>
    );
  }

  const s = current.steps;
  const m = s.metadata;

  return (
    <div className="space-y-4">
      {versions.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Version :</span>
          <Select value={current.id} onValueChange={setSelectedId}>
            <SelectTrigger className="h-8 w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[...versions].reverse().map((v, idx) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.label} {idx === 0 ? "(actuelle)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <Tile
          n={1}
          title="Source"
          aria="Étape 1 sur 5 : image source"
          caption={`${s.source_image.width ?? "?"}×${s.source_image.height ?? "?"} px • ${s.source_image.mime_type}`}
          onClick={() => setOpenTile("source")}
        >
          <img
            src={`data:${s.source_image.mime_type};base64,${s.source_image.base64}`}
            alt="Image source"
            className="w-full h-[140px] object-contain bg-muted/30"
          />
        </Tile>

        <Tile
          n={2}
          title="Texte effacé"
          aria="Étape 2 sur 5 : texte effacé"
          caption={`${m.ocr.regions_detected} régions OCR • ${m.ocr.elapsed_ms} ms`}
          onClick={() => setOpenTile("cleaned")}
        >
          <img
            src={`data:${s.cleaned_image.mime_type};base64,${s.cleaned_image.base64}`}
            alt="Image nettoyée"
            className="w-full h-[140px] object-contain bg-muted/30"
          />
        </Tile>

        <Tile
          n={3}
          title="SVG vectorisé"
          aria="Étape 3 sur 5 : SVG vectorisé"
          caption={`${m.vectorizer.engine}${
            m.vectorizer.detected_type ? ` (${m.vectorizer.detected_type})` : ""
          } • ${(m.vectorizer.svg_size_bytes / 1024).toFixed(1)} ko • ${m.vectorizer.elapsed_ms} ms`}
          onClick={() => setOpenTile("vectorized")}
        >
          <SvgFrame svg={s.vectorized_svg} />
        </Tile>

        <Tile
          n={4}
          title="SVG annoté"
          aria="Étape 4 sur 5 : SVG annoté"
          caption={`${m.annotator.instances.length} slots • ${m.annotator.model} • $${m.annotator.cost_usd.toFixed(4)} • ${(m.annotator.elapsed_ms / 1000).toFixed(1)} s`}
          onClick={() => setOpenTile("annotated")}
        >
          <SvgFrame svg={s.annotated_svg} />
        </Tile>
      </div>

      <MetadataSection steps={s} />

      <Lightbox
        open={openTile !== null}
        onClose={() => setOpenTile(null)}
        tile={openTile}
        steps={s}
      />
    </div>
  );
}

function Tile({
  n,
  title,
  aria,
  caption,
  onClick,
  children,
}: {
  n: number;
  title: string;
  aria: string;
  caption: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={aria}
      className="text-left border rounded-md overflow-hidden hover:border-primary transition-colors bg-card"
    >
      <div className="px-3 py-2 flex items-center gap-2 border-b bg-muted/30">
        <Badge variant="outline" className="text-[10px]">{n}</Badge>
        <span className="font-medium text-sm">{title}</span>
      </div>
      <div className="bg-background">{children}</div>
      <div className="px-3 py-2 text-xs text-muted-foreground">{caption}</div>
    </button>
  );
}

function SvgFrame({ svg }: { svg: string }) {
  return (
    <KrobarSvg
      svg={svg}
      className="w-full h-[140px] flex items-center justify-center bg-muted/30 [&>svg]:max-w-full [&>svg]:max-h-full"
    />
  );
}

function MetadataSection({ steps }: { steps: IntermediateSteps }) {
  const [showJson, setShowJson] = useState(false);
  const m = steps.metadata;
  const total =
    m.ocr.elapsed_ms +
    m.vectorizer.elapsed_ms +
    m.annotator.elapsed_ms +
    m.normalizer.elapsed_ms;

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(m, null, 2));
      toast.success("JSON copié.");
    } catch {
      toast.error("Échec de la copie.");
    }
  };

  return (
    <div className="border rounded-md">
      <div className="px-3 py-2 border-b bg-muted/30 flex items-center gap-2">
        <Badge variant="outline" className="text-[10px]">5</Badge>
        <span className="font-medium text-sm">Métadonnées détaillées</span>
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowJson((v) => !v)}>
            {showJson ? "Masquer le JSON" : "Voir le JSON brut"}
          </Button>
          <Button variant="ghost" size="sm" onClick={copyJson}>
            <Copy className="w-3.5 h-3.5" /> Copier
          </Button>
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Étape</TableHead>
            <TableHead>Moteur</TableHead>
            <TableHead>Latence</TableHead>
            <TableHead>Détail</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>OCR</TableCell>
            <TableCell>{m.ocr.engine}</TableCell>
            <TableCell>{m.ocr.elapsed_ms} ms</TableCell>
            <TableCell>{m.ocr.regions_detected} régions</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Vectorisation</TableCell>
            <TableCell>{m.vectorizer.engine}</TableCell>
            <TableCell>{m.vectorizer.elapsed_ms} ms</TableCell>
            <TableCell>
              {m.vectorizer.detected_type ?? "?"} •{" "}
              {(m.vectorizer.svg_size_bytes / 1024).toFixed(1)} ko
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Annotation IA</TableCell>
            <TableCell>{m.annotator.model}</TableCell>
            <TableCell>{(m.annotator.elapsed_ms / 1000).toFixed(1)} s</TableCell>
            <TableCell>
              {m.annotator.input_tokens}/{m.annotator.output_tokens} tok • $
              {m.annotator.cost_usd.toFixed(4)} • {m.annotator.instances.length} slots
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Normalisation</TableCell>
            <TableCell>—</TableCell>
            <TableCell>{m.normalizer.elapsed_ms} ms</TableCell>
            <TableCell>
              {m.normalizer.color_replacements} couleurs •{" "}
              {m.normalizer.post_processor_changes} changes
            </TableCell>
          </TableRow>
          <TableRow className="font-medium">
            <TableCell>TOTAL</TableCell>
            <TableCell />
            <TableCell>{(total / 1000).toFixed(1)} s</TableCell>
            <TableCell>${m.annotator.cost_usd.toFixed(4)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
      {showJson && (
        <pre className="text-xs bg-muted/40 p-3 overflow-auto max-h-72 border-t">
          {JSON.stringify(m, null, 2)}
        </pre>
      )}
    </div>
  );
}

/* ---------- Lightbox ---------- */

function Lightbox({
  open,
  onClose,
  tile,
  steps,
}: {
  open: boolean;
  onClose: () => void;
  tile: TileKey | null;
  steps: IntermediateSteps;
}) {
  const [zoom, setZoom] = useState(1);
  const [hoveredRegion, setHoveredRegion] = useState<number | null>(null);
  const [hoveredSlot, setHoveredSlot] = useState<number | null>(null);

  useEffect(() => {
    setZoom(1);
    setHoveredRegion(null);
    setHoveredSlot(null);
  }, [tile]);

  if (!tile) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[95vw] w-[95vw] h-[90vh] p-0 overflow-hidden">
        <div className="h-full grid grid-cols-1 lg:grid-cols-[3fr_2fr]">
          <div className="relative bg-muted/30 overflow-auto">
            <div className="absolute top-2 right-2 z-10 flex gap-1">
              <Button
                size="icon"
                variant="secondary"
                onClick={() => setZoom((z) => Math.min(z + 0.25, 4))}
              >
                <ZoomIn className="w-4 h-4" />
              </Button>
              <Button
                size="icon"
                variant="secondary"
                onClick={() => setZoom((z) => Math.max(z - 0.25, 0.25))}
              >
                <ZoomOut className="w-4 h-4" />
              </Button>
              <Button size="icon" variant="secondary" onClick={onClose}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div
              className="min-h-full flex items-center justify-center p-6"
              style={{ transform: `scale(${zoom})`, transformOrigin: "center center" }}
            >
              <LightboxView
                tile={tile}
                steps={steps}
                hoveredRegion={hoveredRegion}
                hoveredSlot={hoveredSlot}
              />
            </div>
          </div>
          <div className="border-l overflow-auto p-5 space-y-4">
            <LightboxInfo
              tile={tile}
              steps={steps}
              hoveredRegion={hoveredRegion}
              setHoveredRegion={setHoveredRegion}
              hoveredSlot={hoveredSlot}
              setHoveredSlot={setHoveredSlot}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LightboxView({
  tile,
  steps,
  hoveredRegion,
  hoveredSlot,
}: {
  tile: TileKey;
  steps: IntermediateSteps;
  hoveredRegion: number | null;
  hoveredSlot: number | null;
}) {
  if (tile === "source" || tile === "cleaned") {
    const img = tile === "source" ? steps.source_image : steps.cleaned_image;
    const w = img.width ?? 1200;
    const h = img.height ?? 700;
    const region =
      tile === "cleaned" && hoveredRegion !== null
        ? steps.metadata.ocr.regions[hoveredRegion]
        : null;
    return (
      <div className="relative inline-block max-w-full">
        <img
          src={`data:${img.mime_type};base64,${img.base64}`}
          alt={tile}
          className="max-w-full max-h-[80vh] object-contain block"
          style={{ width: w, height: "auto" }}
        />
        {region && (
          <div
            className="absolute border-2 border-destructive bg-destructive/20 pointer-events-none"
            style={{
              left: `${(region.bbox[0] / w) * 100}%`,
              top: `${(region.bbox[1] / h) * 100}%`,
              width: `${(region.bbox[2] / w) * 100}%`,
              height: `${(region.bbox[3] / h) * 100}%`,
            }}
          />
        )}
      </div>
    );
  }

  // SVG tiles
  const svg = tile === "vectorized" ? steps.vectorized_svg : steps.annotated_svg;
  const slot =
    tile === "annotated" && hoveredSlot !== null
      ? steps.metadata.annotator.instances[hoveredSlot]
      : null;
  return (
    <div className="relative inline-block">
      <KrobarSvg svg={svg} className="[&>svg]:max-w-full [&>svg]:max-h-[80vh]" />
      {slot && (
        <div className="absolute top-2 left-2 bg-primary text-primary-foreground text-xs px-2 py-1 rounded shadow">
          {slot.slot_id} → {slot.bbox.join(", ")}
        </div>
      )}
    </div>
  );
}

function LightboxInfo({
  tile,
  steps,
  hoveredRegion,
  setHoveredRegion,
  hoveredSlot,
  setHoveredSlot,
}: {
  tile: TileKey;
  steps: IntermediateSteps;
  hoveredRegion: number | null;
  setHoveredRegion: (n: number | null) => void;
  hoveredSlot: number | null;
  setHoveredSlot: (n: number | null) => void;
}) {
  if (tile === "source") {
    const img = steps.source_image;
    return (
      <>
        <h3 className="font-semibold">Image source</h3>
        <ul className="text-sm space-y-1 text-muted-foreground">
          <li>Dimensions : {img.width}×{img.height} px</li>
          <li>Type : {img.mime_type}</li>
          <li>Taille base64 : {(img.base64.length / 1024).toFixed(1)} ko</li>
        </ul>
        <DownloadButton
          base64={img.base64}
          mime={img.mime_type}
          filename="source.png"
          label="Télécharger l'original"
        />
      </>
    );
  }
  if (tile === "cleaned") {
    return (
      <>
        <h3 className="font-semibold">Régions OCR détectées</h3>
        <p className="text-xs text-muted-foreground">
          Survole une ligne pour voir la bbox correspondante surlignée sur l'image.
        </p>
        <ul className="space-y-1 text-sm">
          {steps.metadata.ocr.regions.map((r: OcrRegion, i) => (
            <li
              key={i}
              onMouseEnter={() => setHoveredRegion(i)}
              onMouseLeave={() => setHoveredRegion(null)}
              className={`px-2 py-1 rounded cursor-default border ${
                hoveredRegion === i ? "bg-destructive/10 border-destructive" : "border-transparent"
              }`}
            >
              <span className="font-mono">"{r.text}"</span>
              <span className="text-muted-foreground"> — conf. {r.confidence}</span>
            </li>
          ))}
        </ul>
        <DownloadButton
          base64={steps.cleaned_image.base64}
          mime={steps.cleaned_image.mime_type}
          filename="cleaned.png"
          label="Télécharger l'image nettoyée"
        />
      </>
    );
  }
  if (tile === "vectorized") {
    const v = steps.metadata.vectorizer;
    return (
      <>
        <h3 className="font-semibold">Vectorisation</h3>
        <ul className="text-sm space-y-1 text-muted-foreground">
          <li>Engine : {v.engine}</li>
          <li>Type détecté : {v.detected_type ?? "—"}</li>
          <li>Taille SVG : {(v.svg_size_bytes / 1024).toFixed(1)} ko</li>
          <li>Latence : {v.elapsed_ms} ms</li>
        </ul>
        <DownloadButton
          text={steps.vectorized_svg}
          mime="image/svg+xml"
          filename="vectorized.svg"
          label="Télécharger le SVG"
        />
      </>
    );
  }
  // annotated
  const a = steps.metadata.annotator;
  return (
    <>
      <h3 className="font-semibold">Slots placés par l'IA</h3>
      {a.overall_rationale && (
        <p className="text-xs italic text-muted-foreground border-l-2 pl-2">
          {a.overall_rationale}
        </p>
      )}
      <ul className="space-y-2 text-sm">
        {a.instances.map((inst: AnnotatorInstance, i) => (
          <li
            key={i}
            onMouseEnter={() => setHoveredSlot(i)}
            onMouseLeave={() => setHoveredSlot(null)}
            className={`px-2 py-1 rounded border cursor-default ${
              hoveredSlot === i ? "bg-primary/10 border-primary" : "border-transparent"
            }`}
          >
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px]">
                #{inst.priority ?? i + 1}
              </Badge>
              <span className="font-mono text-xs">{inst.slot_id}</span>
            </div>
            {inst.rationale && (
              <p className="text-xs text-muted-foreground mt-1">{inst.rationale}</p>
            )}
          </li>
        ))}
      </ul>
      <DownloadButton
        text={steps.annotated_svg}
        mime="image/svg+xml"
        filename="annotated.svg"
        label="Télécharger le SVG"
      />
    </>
  );
}

function DownloadButton({
  base64,
  text,
  mime,
  filename,
  label,
}: {
  base64?: string;
  text?: string;
  mime: string;
  filename: string;
  label: string;
}) {
  const onDownload = () => {
    const url = base64
      ? `data:${mime};base64,${base64}`
      : URL.createObjectURL(new Blob([text ?? ""], { type: mime }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    if (!base64) URL.revokeObjectURL(url);
  };
  return (
    <Button variant="outline" size="sm" onClick={onDownload}>
      <Download className="w-3.5 h-3.5" /> {label}
    </Button>
  );
}
