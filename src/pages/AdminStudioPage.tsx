import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, ArrowLeftCircle, Copy, Loader2, RotateCcw, Save, Trash2, Upload, X, Rocket, MousePointer2, Square as SquareIcon, Plus, Library } from "lucide-react";
import matricesData from "@/data/matrices.json";
import { getAllStates, markInProduction, subscribe as subscribeMatrice } from "@/lib/matriceLibrary";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import StudioCanvas, { type Anchor, colorForSlot, type Tool } from "@/components/studio/StudioCanvas";
import { studioApi, type MatchingType, type UploadResponse, validateStudioUploadFile } from "@/lib/studioApi";
import { getTemplates, type TemplateMetadata } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import { STUDIO_RECENT_DEPLOYS_STORAGE } from "@/data/test-suite";
import {
  deleteSnapshot,
  hydrateSnapshots,
  listSnapshots,
  listSnapshotIds,
  loadSnapshot,
  saveSnapshot,
  subscribeSnapshots,
  type StudioSnapshot,
} from "@/lib/studioSnapshots";
import { palettes, defaultPalette, type PaletteKey } from "@/palettes";
import { applyPaletteToSvg, PALETTE_ROLES, detectColorsInSvg, autoMapDetectedColors } from "@/lib/paletteRemap";

type Phase = 1 | 2 | 3 | 4 | 5 | 6;

type CardinalityConfig = {
  slotName: string;
  mode: "optional_groups" | "variants";
  min: number;
  max: number;
};

const CATEGORIES = [
  { value: "process", label: "Process" },
  { value: "comparison", label: "Comparison" },
  { value: "hierarchy", label: "Hierarchy" },
  { value: "matrix", label: "Matrix" },
  { value: "network", label: "Network" },
  { value: "timeline", label: "Timeline" },
  { value: "concept", label: "Concept" },
] as const;

const PHASE_LABELS: Record<Phase, string> = {
  1: "Upload", 2: "Ancres", 3: "Palette", 4: "Cardinalité", 5: "Matching", 6: "Méta + go",
};

const SLOT_NAME_RX = /^[a-z][a-z0-9_]{0,30}$/;
const TPL_ID_RX = /^[a-z][a-z0-9_]{2,50}$/;

export default function AdminStudioPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [snapshots, setSnapshots] = useState<StudioSnapshot[]>(() => listSnapshots());
  useEffect(() => {
    void hydrateSnapshots();
    const unsub = subscribeSnapshots(() => setSnapshots(listSnapshots()));
    return unsub;
  }, []);
  const [knownPremiumTemplates, setKnownPremiumTemplates] = useState<TemplateMetadata[]>([]);

  const [phase, setPhase] = useState<Phase>(1);


  // Phase 1
  const [uploading, setUploading] = useState(false);
  const [upload, setUpload] = useState<UploadResponse | null>(null);

  // Phase 2
  const [anchors, setAnchors] = useState<Anchor[]>([]);
  const [tool, setTool] = useState<Tool>("rect");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [snap, setSnap] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [namePromptOpen, setNamePromptOpen] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [nameError, setNameError] = useState("");
  const namePromptCb = useRef<((n: string | null) => void) | null>(null);
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Phase 3 — Palette
  const [detectedColors, setDetectedColors] = useState<Array<{ hex_value: string; occurrences: number; is_neutral: boolean }>>([]);
  const [paletteMapping, setPaletteMapping] = useState<Record<string, string | null>>({});
  const [autoPaletteMapping, setAutoPaletteMapping] = useState<Record<string, string | null>>({});
  const [paletteLoading, setPaletteLoading] = useState(false);
  const [previewPaletteKey, setPreviewPaletteKey] = useState<PaletteKey>(defaultPalette);

  // Phase 4 — Cardinalité (ex-Phase 3)
  const [cardinality, setCardinality] = useState<CardinalityConfig[]>([]);

  // Phase 5 — Matching (ex-Phase 4)
  const [matchingTypes, setMatchingTypes] = useState<MatchingType[]>([]);
  const [matchingIds, setMatchingIds] = useState<string[]>([]);
  const [otherChecked, setOtherChecked] = useState(false);
  const [otherText, setOtherText] = useState("");
  const [matchingLoading, setMatchingLoading] = useState(false);

  // Phase 6 — Méta + go (ex-Phase 5)
  const [tplId, setTplId] = useState("");
  const [tplName, setTplName] = useState("");
  const [tplCategory, setTplCategory] = useState<typeof CATEGORIES[number]["value"]>("network");
  const [tplDescription, setTplDescription] = useState("");
  const [tplMarkers, setTplMarkers] = useState<string[]>([]);
  const [newMarker, setNewMarker] = useState("");
  const [tplTestText, setTplTestText] = useState("");
  const [deployOpen, setDeployOpen] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [existingIds, setExistingIds] = useState<Set<string>>(new Set());
  const [reconnecting, setReconnecting] = useState<string | null>(null);
  const [reconstructedBanner, setReconstructedBanner] = useState<string | null>(null);
  // ID du template existant en cours d'édition (snapshot ou reconnect).
  // Permet d'autoriser le redéploiement sous le même ID sans déclencher "ID déjà utilisé".
  const [editingExistingId, setEditingExistingId] = useState<string | null>(null);

  // Charge l'ensemble des IDs déjà utilisés (manifest statique + corpus backend)
  // pour prévenir l'utilisateur en amont du déploiement.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ids = new Set<string>();
      try {
        const r = await fetch("/templates/manifest.json");
        if (r.ok) {
          const m = await r.json();
          for (const t of m?.templates ?? []) if (t?.id) ids.add(String(t.id));
        }
      } catch { /* ignore */ }
      try {
        const resp = await supabase.functions.invoke("krobar-proxy", {
          body: { endpoint: "test-texts" },
        });
        const tests = (resp.data as { tests?: { template_id?: string }[] } | null)?.tests ?? [];
        for (const t of tests) if (t.template_id) ids.add(String(t.template_id));
      } catch { /* ignore */ }
      if (!cancelled) setExistingIds(ids);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getTemplates();
        const snapshotIds = new Set(listSnapshotIds());
        const premiumTemplates = (data.templates ?? [])
          .filter((tpl) =>
            tpl.premium === true ||
            tpl.tier === "premium" ||
            tpl.family === "premium" ||
            tpl.created_via === "studio_v1" ||
            tpl.source === "studio",
          )
          .sort((a, b) => {
            const aHas = snapshotIds.has(a.id);
            const bHas = snapshotIds.has(b.id);
            if (aHas !== bHas) return aHas ? -1 : 1;
            return a.name.localeCompare(b.name, "fr");
          });
        if (!cancelled) setKnownPremiumTemplates(premiumTemplates);
      } catch {
        if (!cancelled) setKnownPremiumTemplates([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [snapshots]);

  const idTaken = tplId.length > 0 && existingIds.has(tplId) && tplId !== editingExistingId;

  // UI
  const [resetOpen, setResetOpen] = useState(false);
  const [dragState, setDragState] = useState<"idle" | "accept" | "reject">("idle");
  const [dragMessage, setDragMessage] = useState<string | null>(null);

  // ─── Restauration d'un template existant ──────────────────────────────
  const restoreSnapshot = (snap: StudioSnapshot, jumpTo: Phase = 6) => {
    setUpload(snap.upload);
    setAnchors(snap.anchors ?? []);
    setCardinality(snap.cardinality ?? []);
    setMatchingIds(snap.matchingIds ?? []);
    setOtherChecked(!!snap.otherChecked);
    setOtherText(snap.otherText ?? "");
    setTplId(snap.tplId ?? "");
    setEditingExistingId(snap.tplId ?? snap.template_id ?? null);
    setTplName(snap.tplName ?? "");
    setTplCategory((snap.tplCategory ?? "network") as typeof tplCategory);
    setTplDescription(snap.tplDescription ?? "");
    setTplMarkers(snap.tplMarkers ?? []);
    setTplTestText(snap.tplTestText ?? "");
    setDetectedColors(snap.detectedColors ?? []);
    setPaletteMapping(snap.paletteMapping ?? {});
    setAutoPaletteMapping(snap.paletteMapping ?? {});
    setSelectedId(null);
    setPhase(snap.upload ? jumpTo : 1);
    toast.success(`Template « ${snap.tplName || snap.template_id} » chargé pour modification`);
  };

  // ─── Reconnecter un template historique via le backend Krobar ────────
  // Le backend reconstitue ancres/cardinalité/markers depuis le SVG déployé.
  // L'utilisateur arrive en Phase 2 pour vérifier avant de sauvegarder.
  const reconnectFromBackend = async (tpl: TemplateMetadata) => {
    setReconnecting(tpl.id);
    setReconstructedBanner(null);
    try {
      const res = await studioApi.getStudioParams(tpl.id);
      const sp = res.studio_params;
      if (!sp || !Array.isArray(sp.anchors) || sp.anchors.length === 0) {
        throw new Error("Réponse backend incomplète (aucune ancre).");
      }

      // Construit un UploadResponse synthétique pour alimenter Phase 2+.
      let previewUrl = "";
      try {
        previewUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(sp.cleaned_svg)))}`;
      } catch { /* preview optionnelle */ }
      const synthUpload: UploadResponse = {
        session_id: sp.session_id ?? `reconnect-${tpl.id}`,
        source_format: sp.source_format ?? "svg",
        image_width: sp.image_width,
        image_height: sp.image_height,
        rendered_png_url: previewUrl,
        cleaned_svg: sp.cleaned_svg,
        native_text_count: 0,
        sanitization: { elements_removed: 0, attributes_removed: 0, external_refs_blocked: 0 },
      };

      const restoredAnchors: Anchor[] = sp.anchors.map((a, idx) => ({
        id: `anch_${idx}_${Math.random().toString(36).slice(2, 8)}`,
        slotName: a.slot_name,
        bbox: { x: a.x, y: a.y, w: a.w, h: a.h },
      }));

      const restoredCard: CardinalityConfig[] = (sp.cardinality_configs ?? []).map((c) => ({
        slotName: c.slot_name,
        mode: c.mode,
        min: c.min,
        max: c.max,
      }));

      // Résolution des matching_types par label (les types peuvent ne pas être chargés
      // encore — on tente une résolution best-effort, le reste passe en "otherText").
      const labels = sp.matching_types ?? [];
      const resolvedIds: string[] = [];
      const unresolved: string[] = [];
      for (const label of labels) {
        const found = matchingTypes.find((t) => t.label === label);
        if (found) resolvedIds.push(found.id);
        else unresolved.push(label);
      }

      setUpload(synthUpload);
      setAnchors(restoredAnchors);
      setCardinality(restoredCard);
      setMatchingIds(resolvedIds);
      setOtherChecked(unresolved.length > 0);
      setOtherText(unresolved.join(" · "));
      setTplId(tpl.id);
      setEditingExistingId(tpl.id);
      setTplName(tpl.name || tpl.id);
      setTplDescription(tpl.description || "");
      setTplMarkers(sp.textual_markers ?? []);
      // La palette du template historique n'est pas connue : on la repart vierge
      // pour qu'elle soit auto-analysée à l'entrée de la Phase 3 « Palette ».
      setDetectedColors([]);
      setPaletteMapping({});
      setAutoPaletteMapping({});
      setSelectedId(null);
      setPhase(2);

      if (res.source === "reconstructed_from_svg") {
        setReconstructedBanner(
          `Paramètres de « ${tpl.name || tpl.id} » reconstitués depuis le SVG déployé. Vérifie les ${restoredAnchors.length} ancres avant de sauvegarder.`,
        );
      }
      toast.success(`Template « ${tpl.name || tpl.id} » prêt à être ajusté.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Échec de la reconnexion";
      // Fallback : démarre la re-saisie manuelle (comportement précédent)
      setTplId(tpl.id);
      setEditingExistingId(tpl.id);
      setTplName(tpl.name || tpl.id);
      setTplDescription(tpl.description || "");
      setPhase(1);
      toast.error(
        `Reconnexion automatique impossible (${msg}). Re-uploade le SVG manuellement.`,
        { duration: 8000 },
      );
    } finally {
      setReconnecting(null);
    }
  };


  const restoredEditRef = useRef<string | null>(null);
  useEffect(() => {
    const editId = searchParams.get("edit");
    if (!editId || restoredEditRef.current === editId) return;
    let cancelled = false;
    (async () => {
      await hydrateSnapshots();
      if (cancelled) return;
      const snap = loadSnapshot(editId);
      if (snap) {
        restoredEditRef.current = editId;
        restoreSnapshot(snap, 6);
      } else {
        toast.error(
          `Aucun snapshot trouvé pour « ${editId} ». Re-saisis ses paramètres une fois pour le rendre éditable.`,
        );
      }
      const next = new URLSearchParams(searchParams);
      next.delete("edit");
      setSearchParams(next, { replace: true });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);


  // ─── Phase 1: upload ──────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [libraryPickerOpen, setLibraryPickerOpen] = useState(false);
  const [matriceStates, setMatriceStates] = useState(getAllStates());
  useEffect(() => subscribeMatrice(() => setMatriceStates(getAllStates())), []);
  const libraryItems = useMemo(() => {
    return (matricesData as Array<{id:string;name:string;category:string;usage:string}>)
      .filter((m) => matriceStates[m.id]?.validatedSvg)
      .map((m) => ({ ...m, svg: matriceStates[m.id]!.validatedSvg!, inProduction: !!matriceStates[m.id]?.inProduction }));
  }, [matriceStates]);

  const pickFromLibrary = async (item: { id: string; name: string; svg: string }) => {
    setLibraryPickerOpen(false);
    const file = new File([item.svg], `${item.name.replace(/[^a-z0-9]+/gi, "_")}.svg`, { type: "image/svg+xml" });
    await handleFile(file);
    markInProduction(item.id);
    toast.success(`« ${item.name} » marquée En production`);
  };

  const handleFile = async (file: File) => {
    if (!/\.(svg|eps|ai|pdf)$/i.test(file.name)) {
      toast.error("Format non supporté. Utilisez SVG, EPS, AI ou PDF.");
      return;
    }

    const validation = validateStudioUploadFile(file);
    if (validation.ok === false) {
      toast.error(validation.error, { duration: 8000 });
      return;
    }

    setUploading(true);
    try {
      const res = await studioApi.upload(file);
      setUpload(res);
      toast.success("Fichier accepté");
    } catch (e: any) {
      toast.error(e?.message ?? "Échec de l'upload");
    } finally {
      setUploading(false);
    }
  };

  const updateDragState = (file: File | null) => {
    if (!file) {
      setDragState("idle");
      setDragMessage(null);
      return;
    }

    if (!/\.(svg|eps|ai|pdf)$/i.test(file.name)) {
      setDragState("reject");
      setDragMessage("Format non supporté");
      return;
    }

    const validation = validateStudioUploadFile(file);
    if (validation.ok === false) {
      setDragState("reject");
      setDragMessage("Fichier trop volumineux");
      return;
    }

    setDragState("accept");
    setDragMessage("Fichier accepté");
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDragState("idle");
    setDragMessage(null);
  };

  // ─── Phase 2 helpers ──────────────────────────────────────────────────
  const slotGroups = useMemo(() => {
    const map = new Map<string, Anchor[]>();
    for (const a of anchors) {
      const arr = map.get(a.slotName) ?? [];
      arr.push(a);
      map.set(a.slotName, arr);
    }
    return Array.from(map.entries()).map(([name, items]) => ({ name, items }));
  }, [anchors]);

  const allNames = slotGroups.map((g) => g.name);

  const onPromptName = (cb: (n: string | null) => void) => {
    namePromptCb.current = cb;
    setNameValue("");
    setNameError("");
    setNamePromptOpen(true);
  };
  const submitName = () => {
    const v = nameValue.trim();
    if (!SLOT_NAME_RX.test(v)) {
      setNameError("Nom invalide. Format snake_case (a-z, 0-9, _, max 31).");
      return;
    }
    setNamePromptOpen(false);
    namePromptCb.current?.(v);
    namePromptCb.current = null;
  };
  const cancelName = () => {
    setNamePromptOpen(false);
    namePromptCb.current?.(null);
    namePromptCb.current = null;
  };

  const duplicateSelected = () => {
    if (!selectedId) return;
    const a = anchors.find((x) => x.id === selectedId);
    if (!a) return;
    const copy: Anchor = {
      id: "anch_" + Math.random().toString(36).slice(2, 10),
      slotName: a.slotName,
      bbox: { ...a.bbox, x: Math.min(a.bbox.x + 20, (upload?.image_width ?? 1) - a.bbox.w), y: Math.min(a.bbox.y + 20, (upload?.image_height ?? 1) - a.bbox.h) },
    };
    setAnchors([...anchors, copy]);
    setSelectedId(copy.id);
  };
  const deleteSelected = () => {
    if (!selectedId) return;
    setAnchors(anchors.filter((a) => a.id !== selectedId));
    setSelectedId(null);
  };
  const renameGroup = () => {
    if (!renameTarget) return;
    const v = renameValue.trim();
    if (!SLOT_NAME_RX.test(v)) {
      toast.error("Nom invalide");
      return;
    }
    setAnchors(anchors.map((a) => (a.slotName === renameTarget ? { ...a, slotName: v } : a)));
    setRenameTarget(null);
  };
  const deleteGroup = (name: string) => {
    setAnchors(anchors.filter((a) => a.slotName !== name));
  };

  // ─── Phase 3 sync from anchors ────────────────────────────────────────
  useEffect(() => {
    const repeated = slotGroups.filter((g) => g.items.length >= 2);
    setCardinality((prev) => {
      return repeated.map((g) => {
        const existing = prev.find((c) => c.slotName === g.name);
        const max = g.items.length;
        const defaultMin = Math.max(2, Math.round(max * 0.5));
        return existing
          ? { ...existing, max, min: Math.min(existing.min, max - 1 < 2 ? 2 : max - 1) }
          : { slotName: g.name, mode: "optional_groups", min: defaultMin, max };
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(slotGroups.map((g) => [g.name, g.items.length]))]);

  // ─── Phase 4 load ─────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    setMatchingLoading(true);
    studioApi.matchingTypes()
      .then((mt) => { if (mounted) setMatchingTypes(mt); })
      .catch(() => toast.error("Impossible de charger les matching types"))
      .finally(() => { if (mounted) setMatchingLoading(false); });
    return () => { mounted = false; };
  }, []);

  const matchingByCategory = useMemo(() => {
    const m = new Map<string, MatchingType[]>();
    for (const t of matchingTypes) {
      const arr = m.get(t.category) ?? [];
      arr.push(t);
      m.set(t.category, arr);
    }
    return Array.from(m.entries());
  }, [matchingTypes]);

  // Décompte des templates Premium déjà rattachés à chaque matching type
  // (basé sur les snapshots Studio enregistrés). Permet à l'utilisateur
  // d'identifier les intentions sous-couvertes par le catalogue actuel.
  const templateCountByMatchingId = useMemo(() => {
    const counts = new Map<string, number>();
    for (const snap of snapshots) {
      for (const id of snap.matchingIds ?? []) {
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    return counts;
  }, [snapshots]);

  const templateCountByCategory = useMemo(() => {
    const counts = new Map<string, number>();
    for (const [cat, items] of matchingByCategory) {
      const ids = new Set(items.map((t) => t.id));
      const tplSet = new Set<string>();
      for (const snap of snapshots) {
        if ((snap.matchingIds ?? []).some((id) => ids.has(id))) {
          tplSet.add(snap.template_id);
        }
      }
      counts.set(cat, tplSet.size);
    }
    return counts;
  }, [matchingByCategory, snapshots]);

  // ─── Phase 4 → 5 derivation ───────────────────────────────────────────
  const selectedMatching = matchingTypes.filter((t) => matchingIds.includes(t.id));

  const derivedPrimaryIntent = useMemo<typeof CATEGORIES[number]["value"]>(() => {
    if (selectedMatching.length === 0) return "network";
    const counts = new Map<string, number>();
    for (const t of selectedMatching) counts.set(t.primary_intent, (counts.get(t.primary_intent) ?? 0) + 1);
    let best: string = selectedMatching[0].primary_intent;
    let bestCount = 0;
    for (const [k, v] of counts.entries()) {
      if (v > bestCount || (v === bestCount && k < best)) { best = k; bestCount = v; }
    }
    return best as typeof CATEGORIES[number]["value"];
  }, [selectedMatching]);

  const derivedMarkers = useMemo(() => {
    const set = new Set<string>();
    for (const t of selectedMatching) for (const m of t.textual_markers) set.add(m);
    return Array.from(set);
  }, [selectedMatching]);

  const derivedBestFor = useMemo(() => {
    const labels = selectedMatching.map((t) => t.label);
    let s = "";
    if (labels.length === 1) s = labels[0];
    else if (labels.length === 2) s = `${labels[0]} et ${labels[1]}`;
    else if (labels.length >= 3) s = `${labels.slice(0, -1).join(", ")} et ${labels[labels.length - 1]}`;
    if (otherChecked && otherText.trim()) s = `${s}. Note : ${otherText.trim()}`;
    return s;
  }, [selectedMatching, otherChecked, otherText]);

  // ─── Phase 3 — Auto-analyse de la palette à l'entrée ─────────────────
  useEffect(() => {
    if (phase !== 3) return;
    if (!upload?.cleaned_svg) return;
    if (detectedColors.length > 0) return; // déjà analysé (snapshot ou précédent)
    let cancelled = false;
    setPaletteLoading(true);
    const applyLocal = () => {
      const local = detectColorsInSvg(upload.cleaned_svg);
      const auto = autoMapDetectedColors(local);
      setDetectedColors(local);
      setAutoPaletteMapping(auto);
      setPaletteMapping((prev) => Object.keys(prev).length > 0 ? prev : auto);
    };
    studioApi.analyzePalette(upload.cleaned_svg)
      .then((res) => {
        if (cancelled) return;
        const colors = res.detected_colors ?? [];
        if (colors.length === 0) {
          applyLocal();
          return;
        }
        setDetectedColors(colors);
        setAutoPaletteMapping(res.auto_mapping ?? {});
        setPaletteMapping((prev) => Object.keys(prev).length > 0 ? prev : (res.auto_mapping ?? {}));
      })
      .catch(() => {
        if (cancelled) return;
        // Fallback silencieux client-side si le backend n'expose pas l'endpoint
        applyLocal();
      })
      .finally(() => { if (!cancelled) setPaletteLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, upload?.cleaned_svg]);

  const previewPalette = palettes[previewPaletteKey];
  const previewSvg = useMemo(() => {
    if (!upload?.cleaned_svg) return "";
    return applyPaletteToSvg(upload.cleaned_svg, paletteMapping, previewPalette);
  }, [upload?.cleaned_svg, paletteMapping, previewPalette]);

  const duplicatePaletteRoles = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of Object.values(paletteMapping)) {
      if (!r) continue;
      counts.set(r, (counts.get(r) ?? 0) + 1);
    }
    return Array.from(counts.entries()).filter(([, n]) => n > 1).map(([r]) => r);
  }, [paletteMapping]);

  // ─── Init phase 6 fields when entering ────────────────────────────────
  const phase6Initialized = useRef(false);
  useEffect(() => {
    if (phase === 6 && !phase6Initialized.current) {
      setTplCategory(derivedPrimaryIntent);
      if (!tplDescription) setTplDescription(derivedBestFor.slice(0, 250));
      if (tplMarkers.length === 0) setTplMarkers(derivedMarkers);
      phase6Initialized.current = true;
    }
    if (phase !== 6) phase6Initialized.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => {
    if (tplName && !tplId) {
      const id = tplName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 50);
      if (id) setTplId(id);
    }
  }, [tplName]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Navigation ───────────────────────────────────────────────────────
  const goNext = () => {
    if (phase === 1 && !upload) return;
    if (phase === 2 && anchors.length === 0) return;
    if (phase === 5 && matchingIds.length === 0) {
      toast.error("Coche au moins une intention pour continuer.");
      return;
    }
    if (phase === 5 && otherChecked && !otherText.trim()) {
      toast.error("Précise le texte « Autre » ou décoche la case.");
      return;
    }
    if (phase === 3 && duplicatePaletteRoles.length > 0) {
      toast.warning(`Plusieurs couleurs partagent le même rôle (${duplicatePaletteRoles.join(", ")}).`);
    }
    let next = (phase + 1) as Phase;
    // Skip phase 4 (cardinalité) si pas de slots répétés
    if (next === 4 && cardinality.length === 0) {
      toast("Pas de cardinalité à configurer, on passe à la suite.");
      next = 5;
    }
    if (next > 6) return;
    setPhase(next);
  };
  const goPrev = () => {
    let prev = (phase - 1) as Phase;
    if (prev === 4 && cardinality.length === 0) prev = 3;
    if (prev < 1) return;
    setPhase(prev);
  };

  const resetAll = () => {
    setPhase(1);
    setUpload(null);
    setAnchors([]);
    setSelectedId(null);
    setCardinality([]);
    setMatchingIds([]);
    setOtherChecked(false);
    setOtherText("");
    setDetectedColors([]);
    setPaletteMapping({});
    setAutoPaletteMapping({});
    setTplId(""); setTplName(""); setTplDescription(""); setTplMarkers([]); setTplTestText("");
    setEditingExistingId(null);
    setResetOpen(false);
  };

  // ─── Phase 5 actions ──────────────────────────────────────────────────
  const buildPayload = () => {
    const matchingLabels = selectedMatching.map((t) => t.label);
    if (otherChecked && otherText.trim()) matchingLabels.push(otherText.trim());
    return {
      session_id: upload?.session_id,
      template_id: tplId,
      name: tplName,
      category: tplCategory,
      description: tplDescription,
      best_for: derivedBestFor,
      cleaned_svg: upload?.cleaned_svg ?? "",
      image_width: upload?.image_width ?? 0,
      image_height: upload?.image_height ?? 0,
      source_format: upload?.source_format ?? "svg",
      anchors: anchors.map((a) => ({
        slot_name: a.slotName,
        x: Math.round(a.bbox.x),
        y: Math.round(a.bbox.y),
        w: Math.round(a.bbox.w),
        h: Math.round(a.bbox.h),
      })),
      cardinality_configs: cardinality.map((c) => ({
        slot_name: c.slotName, mode: c.mode, min: c.min, max: c.max,
      })),
      textual_markers: tplMarkers,
      matching_types: matchingLabels,
      test_text: tplTestText.trim(),
      add_to_test_suite: tplTestText.trim().length > 0,
      palette_mapping: paletteMapping,
      approved_by: "admin",
    };
  };

  const saveDraft = async () => {
    try {
      await studioApi.saveDraft(buildPayload());
      toast.success("Brouillon sauvegardé.");
    } catch (e: any) {
      toast.error(e?.message ?? "Échec de la sauvegarde");
    }
  };

  const validateBeforeDeploy = (): string | null => {
    if (!TPL_ID_RX.test(tplId)) return "Nom interne invalide (snake_case, 3-51 caractères).";
    if (idTaken) return `L'ID interne « ${tplId} » est déjà utilisé. Choisis un nom unique.`;
    if (!tplName.trim()) return "Nom affiché requis.";
    if (tplDescription.length > 250) return "Description trop longue (max 250 caractères).";
    if (tplTestText.trim().length < 20) return "Texte de test requis (min 20 caractères) pour ajout à la suite de test.";
    if (tplTestText.trim().length > 1000) return "Texte de test trop long (max 1000 caractères).";
    return null;
  };
  const onDeployClick = () => {
    const err = validateBeforeDeploy();
    if (err) { toast.error(err); return; }
    setDeployOpen(true);
  };
  const confirmDeploy = async () => {
    setDeploying(true);
    try {
      const res = await studioApi.deploy(buildPayload());
      try {
        const raw = localStorage.getItem(STUDIO_RECENT_DEPLOYS_STORAGE);
        const existing = raw ? JSON.parse(raw) : [];
        const next = Array.isArray(existing)
          ? existing.filter((item) => item?.template_id !== res.template_id)
          : [];
        next.unshift({
          template_id: res.template_id,
          name: tplName,
          category: "Premium",
          test_text: tplTestText.trim(),
          deployed_at: new Date().toISOString(),
        });
        localStorage.setItem(STUDIO_RECENT_DEPLOYS_STORAGE, JSON.stringify(next.slice(0, 20)));
      } catch {
        /* ignore local cache failures */
      }
      // Persiste un snapshot complet (Supabase + cache local).
      try {
        await saveSnapshot({
          template_id: res.template_id,
          tplId,
          tplName,
          tplCategory,
          tplDescription,
          tplMarkers,
          tplTestText: tplTestText.trim(),
          anchors,
          cardinality,
          matchingIds,
          otherChecked,
          otherText,
          upload,
          paletteMapping,
          detectedColors,
          saved_at: new Date().toISOString(),
        });
      } catch {
        toast.warning("Template déployé, mais la sauvegarde des paramètres a échoué.");
      }
      toast.success("✅ Template déployé !");
      setDeployOpen(false);
      navigate("/admin");
      void res;
    } catch (e: any) {
      toast.error(e?.message ?? "Échec du déploiement");
    } finally {
      setDeploying(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="sm">
              <Link to="/admin"><ArrowLeft className="w-4 h-4" /> Back-office</Link>
            </Button>
            <div>
              <h1 className="text-xl font-semibold">Studio Krobar</h1>
              <p className="text-xs text-muted-foreground">Pattern designer Premium · {studioApi.isMockMode() ? "Mode mock" : "Backend connecté"}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setResetOpen(true)}>
            <RotateCcw className="w-4 h-4" /> Recommencer
          </Button>
        </div>
        {/* Progress bar */}
        <div className="max-w-7xl mx-auto px-6 pb-4 grid grid-cols-6 gap-2">
          {([1, 2, 3, 4, 5, 6] as Phase[]).map((p) => {
            const done = p < phase;
            const current = p === phase;
            return (
              <div key={p} className="space-y-1">
                <div className={`h-1.5 rounded-full ${done ? "bg-primary" : current ? "bg-primary/60" : "bg-muted"}`} />
                <p className={`text-xs ${current ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                  {p}/6 · {PHASE_LABELS[p]}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {reconstructedBanner && (
          <Card className="mb-6 p-4 border-amber-500/50 bg-amber-500/5 flex items-start justify-between gap-3">
            <div className="text-sm">
              <p className="font-medium text-amber-700 dark:text-amber-400">Paramètres reconstitués depuis le SVG déployé</p>
              <p className="text-muted-foreground">{reconstructedBanner}</p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setReconstructedBanner(null)}>
              <X className="w-4 h-4" />
            </Button>
          </Card>
        )}
        {/* PHASE 1 */}
        {phase === 1 && (
          <div className="max-w-2xl mx-auto space-y-6">
            <Card
              className={`p-12 border-2 border-dashed cursor-pointer transition-colors ${
                dragState === "reject"
                  ? "border-destructive bg-destructive/5"
                  : dragState === "accept"
                    ? "border-primary bg-primary/5"
                    : "hover:bg-muted/40"
              }`}
              onClick={() => fileInputRef.current?.click()}
              onDragEnter={(e) => {
                e.preventDefault();
                updateDragState(e.dataTransfer.items?.[0]?.kind === "file" ? e.dataTransfer.files?.[0] ?? null : null);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                updateDragState(e.dataTransfer.items?.[0]?.kind === "file" ? e.dataTransfer.files?.[0] ?? null : null);
              }}
              onDragLeave={handleDragLeave}
              onDrop={(e) => {
                e.preventDefault();
                setDragState("idle");
                setDragMessage(null);
                const f = e.dataTransfer.files?.[0];
                if (f) void handleFile(f);
              }}
            >
              <div className="text-center space-y-3">
                <Upload className="w-10 h-10 mx-auto text-muted-foreground" />
                <p className="font-medium">Glissez votre fichier vectoriel ici ou cliquez pour le choisir</p>
                <p className="text-sm text-muted-foreground">SVG · EPS · AI · PDF</p>
                <p className="text-xs text-muted-foreground">Taille maximale : 3 Mo</p>
                <p className="text-xs italic text-muted-foreground">
                  ⓘ Limite imposée par le transport via Supabase Edge Functions.
                  <br />
                  Pour les fichiers plus volumineux, utilise un outil de simplification SVG.
                </p>
                {dragMessage && (
                  <p className={`text-xs font-medium ${dragState === "reject" ? "text-destructive" : "text-primary"}`}>
                    {dragMessage}
                  </p>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".svg,.eps,.ai,.pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleFile(f);
                    e.currentTarget.value = "";
                  }}
                />
              </div>
            </Card>

            <div className="flex items-center gap-3 justify-center">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground uppercase tracking-wider">ou</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => setLibraryPickerOpen(true)}
            >
              <Library className="w-4 h-4" />
              Choisir depuis la bibliothèque académique ({libraryItems.length})
            </Button>

            <Dialog open={libraryPickerOpen} onOpenChange={setLibraryPickerOpen}>
              <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Bibliothèque matrice académique</DialogTitle>
                  <DialogDescription>
                    Sélectionne une matrice validée pour la transformer en template premium.
                  </DialogDescription>
                </DialogHeader>
                {libraryItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    Aucune matrice validée dans la bibliothèque. Va dans <Link to="/admin/matrice" className="underline">Matrice</Link> pour en générer.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {libraryItems.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => pickFromLibrary(item)}
                        className="text-left border rounded-md overflow-hidden hover:ring-2 hover:ring-primary transition"
                      >
                        <div className="aspect-[16/9] bg-white">
                          <div
                            className="w-full h-full [&>svg]:w-full [&>svg]:h-full"
                            dangerouslySetInnerHTML={{ __html: item.svg }}
                          />
                        </div>
                        <div className="p-2">
                          <div className="text-xs font-medium line-clamp-1">{item.name}</div>
                          <div className="text-[10px] text-muted-foreground line-clamp-1">{item.category}</div>
                          {item.inProduction && (
                            <Badge variant="default" className="mt-1 text-[9px]">En production</Badge>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </DialogContent>
            </Dialog>

            {uploading && (
              <Card className="p-4 flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin" />
                <p className="text-sm">Conversion en cours… (cela peut prendre 5-10 secondes pour les EPS/AI)</p>
              </Card>
            )}

            {upload && (
              <>
                <Card className="p-4">
                  <img
                    src={upload.rendered_png_url}
                    alt="Aperçu"
                    className="max-w-full max-h-96 mx-auto rounded border"
                  />
                </Card>
                <Card className="p-4 border-green-600/40 bg-green-600/5 space-y-1 text-sm">
                  <p className="font-medium text-green-700 dark:text-green-400">✅ Fichier accepté</p>
                  <p><span className="text-muted-foreground">Format détecté :</span> {upload.source_format.toUpperCase()}</p>
                  <p><span className="text-muted-foreground">Dimensions :</span> {upload.image_width} × {upload.image_height} pixels</p>
                  <p><span className="text-muted-foreground">Sanitization :</span> {upload.sanitization.elements_removed} élément(s) suspect(s) retiré(s)</p>
                  <p><span className="text-muted-foreground">Textes natifs :</span> {upload.native_text_count}</p>
                </Card>
              </>
            )}

            {/* Templates Premium connus — double-clic pour rouvrir */}
            {knownPremiumTemplates.length > 0 && (
              <Card className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold">Templates Premium du Studio</h3>
                    <p className="text-xs text-muted-foreground">
                      Double-clique sur un template pour rouvrir son édition. Paramètres synchronisés via Lovable Cloud (partagés entre tous tes navigateurs).
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs">{knownPremiumTemplates.length}</Badge>
                </div>
                <ul className="divide-y border rounded-md">
                  {knownPremiumTemplates.map((tpl) => {
                    const snap = snapshots.find((item) => item.template_id === tpl.id);
                    const editable = !!snap;
                    return (
                      <li
                        key={tpl.id}
                        onDoubleClick={() => editable && restoreSnapshot(snap, 5)}
                        className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-muted/50 select-none"
                        title={editable ? "Double-cliquer pour modifier" : "Paramètres historiques absents — re-saisis-les une fois pour rendre ce template éditable"}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm truncate">{snap?.tplName || tpl.name || tpl.id}</span>
                            <Badge variant="secondary" className="text-[10px] font-mono">{tpl.id}</Badge>
                            <Badge variant={editable ? "outline" : "secondary"} className="text-[10px]">
                              {editable ? "modifiable" : "à reconnecter"}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {snap
                              ? (
                                <>
                                  {snap.anchors?.length ?? 0} ancre{(snap.anchors?.length ?? 0) > 1 ? "s" : ""}
                                  {snap.tplCategory && <> · {snap.tplCategory}</>}
                                  {snap.saved_at && <> · {new Date(snap.saved_at).toLocaleDateString("fr-FR")}</>}
                                </>
                              )
                              : (tpl.description || "Template Premium existant")}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            size="sm"
                            variant={editable ? "outline" : "secondary"}
                            className="h-7 text-xs"
                            disabled={reconnecting === tpl.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (snap) {
                                restoreSnapshot(snap, 5);
                              } else {
                                void reconnectFromBackend(tpl);
                              }
                            }}
                          >
                            {reconnecting === tpl.id ? (
                              <><Loader2 className="w-3 h-3 animate-spin" /> Reconnexion…</>
                            ) : (
                              editable ? "Modifier" : "Reconnecter"
                            )}
                          </Button>
                          {snap && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (confirm(`Supprimer les paramètres Studio de « ${snap.tplName || snap.template_id} » ? Le template déployé n'est pas affecté.`)) {
                                  try { await deleteSnapshot(snap.template_id); }
                                  catch { toast.error("Échec de la suppression"); }
                                }
                              }}
                              aria-label="Supprimer le snapshot"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            )}
          </div>
        )}

        {/* PHASE 2 */}
        {phase === 2 && upload && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Button size="sm" variant={tool === "rect" ? "default" : "outline"} onClick={() => setTool("rect")}>
                  <SquareIcon className="w-4 h-4" /> Rectangle
                </Button>
                <Button size="sm" variant={tool === "select" ? "default" : "outline"} onClick={() => setTool("select")}>
                  <MousePointer2 className="w-4 h-4" /> Sélection
                </Button>
                <Button size="sm" variant="outline" onClick={duplicateSelected} disabled={!selectedId}>
                  <Copy className="w-4 h-4" /> Dupliquer
                </Button>
                <Button size="sm" variant="outline" onClick={deleteSelected} disabled={!selectedId}>
                  <Trash2 className="w-4 h-4" /> Supprimer
                </Button>
                <div className="ml-auto flex items-center gap-2 text-sm">
                  <Button size="icon" variant="ghost" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}>−</Button>
                  <span className="w-12 text-center">{Math.round(zoom * 100)}%</span>
                  <Button size="icon" variant="ghost" onClick={() => setZoom((z) => Math.min(3, z + 0.25))}>+</Button>
                </div>
              </div>
              <StudioCanvas
                imageUrl={upload.rendered_png_url}
                imageWidth={upload.image_width}
                imageHeight={upload.image_height}
                anchors={anchors}
                setAnchors={setAnchors}
                tool={tool}
                setTool={setTool}
                selectedId={selectedId}
                setSelectedId={setSelectedId}
                snap={snap}
                zoom={zoom}
                onPromptName={onPromptName}
                onRenameSlot={(name) => { setRenameTarget(name); setRenameValue(name); }}
              />
              <p className="text-xs text-muted-foreground">
                Astuce : dessine la première instance d'un slot répété, sélectionne-la et utilise « Dupliquer » pour les suivantes.
              </p>
            </div>

            <div className="space-y-4">
              <Card className="p-4 space-y-3">
                <h3 className="text-sm font-semibold">Ancres placées</h3>
                {slotGroups.length === 0 && (
                  <p className="text-xs text-muted-foreground">Aucune ancre. Dessine un rectangle pour commencer.</p>
                )}
                {slotGroups.map((g) => {
                  const c = colorForSlot(g.name, allNames);
                  const isUnique = g.items.length === 1;
                  return (
                    <div key={g.name} className="border rounded-md p-2 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full inline-block" style={{ background: c }} />
                        <span className="font-mono text-sm">{g.name}</span>
                        <Badge variant="outline" className="text-xs ml-auto">{isUnique ? "unique" : `×${g.items.length}`}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {g.items.length <= 5
                          ? g.items.map((a) => `${Math.round(a.bbox.x)},${Math.round(a.bbox.y)} · ${Math.round(a.bbox.w)}×${Math.round(a.bbox.h)}`).join(" • ")
                          : `${g.items.length} emplacements`}
                      </p>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                          onClick={() => { setRenameTarget(g.name); setRenameValue(g.name); }}>Renommer</Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                          onClick={() => deleteGroup(g.name)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
                <Button size="sm" variant="outline" className="w-full" onClick={() => setTool("rect")}>
                  <Plus className="w-4 h-4" /> Nouveau slot
                </Button>
              </Card>

              <Card className="p-4 space-y-2">
                <h3 className="text-sm font-semibold">Outils</h3>
                <div className="flex items-center justify-between">
                  <Label htmlFor="snap" className="text-sm">Snap to grid (10px)</Label>
                  <Switch id="snap" checked={snap} onCheckedChange={setSnap} />
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* PHASE 3 — Palette */}
        {phase === 3 && upload && (
          <div className="max-w-3xl mx-auto space-y-4">
            <div>
              <h2 className="text-xl font-semibold">Palette du template</h2>
              <p className="text-sm text-muted-foreground">
                {paletteLoading
                  ? "Analyse des couleurs en cours…"
                  : detectedColors.length === 0
                    ? "Aucune couleur détectée."
                    : `J'ai détecté ${detectedColors.length} couleur${detectedColors.length > 1 ? "s" : ""}. Assigne chaque couleur à un rôle de la palette Krobar, ou laisse-la inchangée.`}
              </p>
            </div>

            {paletteLoading && (
              <Card className="p-4 flex items-center gap-3">
                <Loader2 className="w-4 h-4 animate-spin" />
                <p className="text-sm">Détection des couleurs dominantes…</p>
              </Card>
            )}

            {detectedColors.length > 0 && (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    {Object.values(paletteMapping).filter(Boolean).length} / {detectedColors.length} assignée(s)
                  </p>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setPaletteMapping({ ...autoPaletteMapping })}
                  >
                    <RotateCcw className="w-3 h-3" /> Reset auto
                  </Button>
                </div>

                {duplicatePaletteRoles.length > 0 && (
                  <Card className="p-3 border-amber-500/50 bg-amber-500/5">
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      ⚠️ Plusieurs couleurs partagent le même rôle : {duplicatePaletteRoles.join(", ")}.
                      Le rendu pourra être ambigu.
                    </p>
                  </Card>
                )}

                <Card className="divide-y">
                  {detectedColors.map((c, idx) => {
                    const isDominant = idx === 0;
                    const role = paletteMapping[c.hex_value] ?? null;
                    return (
                      <div key={c.hex_value} className="p-3 flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded border shrink-0"
                          style={{ background: c.hex_value }}
                          aria-label={c.hex_value}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-sm">{c.hex_value}</span>
                            <span className="text-xs text-muted-foreground">
                              {c.occurrences} occurrence{c.occurrences > 1 ? "s" : ""}
                            </span>
                            {isDominant && <Badge variant="outline" className="text-[10px]">dominante</Badge>}
                            {c.is_neutral && <Badge variant="secondary" className="text-[10px]">neutre détecté</Badge>}
                          </div>
                        </div>
                        <Select
                          value={role ?? "__keep__"}
                          onValueChange={(v) => {
                            setPaletteMapping((prev) => ({
                              ...prev,
                              [c.hex_value]: v === "__keep__" ? null : v,
                            }));
                          }}
                        >
                          <SelectTrigger className="w-44 shrink-0"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__keep__">garder telle quelle</SelectItem>
                            {PALETTE_ROLES.map((r) => (
                              <SelectItem key={r} value={r}>{r}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}
                </Card>

                {/* Aperçu live */}
                <Card className="p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold">Aperçu avec palette « {previewPalette.name} »</h3>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="preview-palette" className="text-xs text-muted-foreground">Palette d'aperçu :</Label>
                      <Select value={previewPaletteKey} onValueChange={(v) => setPreviewPaletteKey(v as PaletteKey)}>
                        <SelectTrigger id="preview-palette" className="w-40 h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.values(palettes).map((p) => (
                            <SelectItem key={p.key} value={p.key}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div
                    className="rounded border p-3"
                    style={{ background: previewPalette.colors.bg }}
                    dangerouslySetInnerHTML={{ __html: previewSvg }}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    L'aperçu remplace localement les couleurs ; au déploiement, le SVG en prod utilisera <code>var(--xxx)</code>.
                  </p>
                </Card>
              </>
            )}
          </div>
        )}

        {/* PHASE 4 — Cardinalité */}
        {phase === 4 && (
          <div className="max-w-2xl mx-auto space-y-4">
            <h2 className="text-xl font-semibold">Cardinalité des slots répétés</h2>
            {cardinality.length === 0 ? (
              <Card className="p-8 text-center text-muted-foreground">Aucun slot répété à configurer.</Card>
            ) : cardinality.map((c, idx) => (
              <Card key={c.slotName} className="p-5 space-y-3">
                <h3 className="font-semibold">Slot « {c.slotName} » — {c.max} ancres dessinées</h3>
                <RadioGroup
                  value={c.mode}
                  onValueChange={(v) => {
                    const next = [...cardinality];
                    next[idx] = { ...c, mode: v as CardinalityConfig["mode"], min: v === "variants" ? c.max : c.min };
                    setCardinality(next);
                  }}
                  className="space-y-3"
                >
                  <Card className="p-4 space-y-2">
                    <div className="flex items-start gap-2">
                      <RadioGroupItem value="optional_groups" id={`om-${c.slotName}`} className="mt-1" />
                      <div className="space-y-1 flex-1">
                        <Label htmlFor={`om-${c.slotName}`} className="font-medium cursor-pointer">Cardinalité maximale (recommandé)</Label>
                        <p className="text-sm text-muted-foreground">
                          Le template sera proposé pour des contenus avec {c.min} à {c.max} items. Les emplacements non utilisés seront masqués.
                        </p>
                        <div className="flex items-center gap-2 pt-1">
                          <Label className="text-sm">Minimum :</Label>
                          <Select
                            value={String(c.min)}
                            onValueChange={(v) => {
                              const next = [...cardinality];
                              next[idx] = { ...c, min: parseInt(v, 10) };
                              setCardinality(next);
                            }}
                            disabled={c.mode !== "optional_groups"}
                          >
                            <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {Array.from({ length: Math.max(1, c.max - 1) }, (_, i) => i + 2).map((n) => (
                                <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <span className="text-sm text-muted-foreground">Maximum : {c.max} (verrouillé)</span>
                        </div>
                      </div>
                    </div>
                  </Card>
                  <Card className="p-4">
                    <div className="flex items-start gap-2">
                      <RadioGroupItem value="variants" id={`st-${c.slotName}`} className="mt-1" />
                      <div className="space-y-1">
                        <Label htmlFor={`st-${c.slotName}`} className="font-medium cursor-pointer">Cardinalité stricte</Label>
                        <p className="text-sm text-muted-foreground">
                          Le template sera proposé uniquement pour des contenus avec exactement {c.max} items.
                        </p>
                      </div>
                    </div>
                  </Card>
                </RadioGroup>
              </Card>
            ))}
          </div>
        )}

        {/* PHASE 5 — Matching */}
        {phase === 5 && (
          <div className="max-w-2xl mx-auto space-y-4">
            <div>
              <h2 className="text-xl font-semibold">Pour quels textes ton template est-il pertinent ?</h2>
              <p className="text-sm text-muted-foreground">Coche tout ce qui s'applique. Au moins une intention requise.</p>
            </div>

            {matchingLoading && <Card className="p-4"><Loader2 className="w-4 h-4 animate-spin" /></Card>}

            {matchingByCategory.map(([cat, items]) => {
              const catCount = templateCountByCategory.get(cat) ?? 0;
              return (
                <Card key={cat} className="p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-muted-foreground tracking-wide">── {cat} ──</p>
                    <span
                      className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${
                        catCount === 0
                          ? "border-destructive/40 text-destructive bg-destructive/10"
                          : "border-border text-muted-foreground bg-muted/40"
                      }`}
                      title="Nombre de templates Premium couvrant cette catégorie"
                    >
                      {catCount} template{catCount > 1 ? "s" : ""}
                    </span>
                  </div>
                  {items.map((t) => {
                    const n = templateCountByMatchingId.get(t.id) ?? 0;
                    return (
                      <label key={t.id} className="flex items-start gap-2 cursor-pointer py-1">
                        <Checkbox
                          checked={matchingIds.includes(t.id)}
                          onCheckedChange={(v) => {
                            setMatchingIds(v ? [...matchingIds, t.id] : matchingIds.filter((x) => x !== t.id));
                          }}
                        />
                        <span className="text-sm leading-tight flex-1">{t.label}</span>
                        <span
                          className={`text-[11px] tabular-nums shrink-0 px-1.5 rounded ${
                            n === 0 ? "text-destructive" : "text-muted-foreground"
                          }`}
                          title="Templates Premium déjà rattachés à cette intention"
                        >
                          {n}
                        </span>
                      </label>
                    );
                  })}
                </Card>
              );
            })}

            <Card className="p-4 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={otherChecked} onCheckedChange={(v) => setOtherChecked(!!v)} />
                <span className="text-sm">Autre :</span>
              </label>
              {otherChecked && (
                <Input
                  placeholder="Précise l'intention…"
                  value={otherText}
                  onChange={(e) => setOtherText(e.target.value)}
                />
              )}
            </Card>

            <p className="text-sm text-muted-foreground">
              {matchingIds.length} intention{matchingIds.length > 1 ? "s" : ""} sélectionnée{matchingIds.length > 1 ? "s" : ""}
              {matchingIds.length === 0 && <span className="text-destructive"> · Coche au moins une intention pour continuer.</span>}
            </p>
          </div>
        )}

        {/* PHASE 6 — Méta + go */}
        {phase === 6 && upload && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="p-4 space-y-3">
              <h3 className="text-sm font-semibold">Prévisualisation</h3>
              <img src={upload.rendered_png_url} alt="Aperçu" className="w-full rounded border" />
              <p className="text-xs text-muted-foreground">
                Cet aperçu utilise l'image source. Au rendu final, les slots seront remplis par le pipeline multi-agents.
              </p>
            </Card>

            <Card className="p-4 space-y-4">
              <div className="space-y-1">
                <Label htmlFor="tpl-id">Nom interne (ID)</Label>
                <Input id="tpl-id" value={tplId} onChange={(e) => setTplId(e.target.value)} placeholder="grande_roue_facettes" className="font-mono" />
                <p className="text-xs text-muted-foreground">snake_case, immutable après déploiement</p>
                {tplId && !TPL_ID_RX.test(tplId) && <p className="text-xs text-destructive">Format invalide</p>}
                {tplId && TPL_ID_RX.test(tplId) && idTaken && (
                  <p className="text-xs text-destructive">
                    ⚠️ Cet ID est déjà utilisé par un template existant. Choisis un nom unique.
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="tpl-name">Nom affiché</Label>
                <Input id="tpl-name" value={tplName} onChange={(e) => setTplName(e.target.value.slice(0, 80))} placeholder="Grande roue à facettes" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="tpl-cat">Catégorie principale</Label>
                <Select value={tplCategory} onValueChange={(v) => setTplCategory(v as typeof tplCategory)}>
                  <SelectTrigger id="tpl-cat"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="tpl-desc">Description</Label>
                <Textarea
                  id="tpl-desc"
                  value={tplDescription}
                  onChange={(e) => setTplDescription(e.target.value.slice(0, 250))}
                  rows={4}
                />
                <p className="text-xs text-muted-foreground text-right">{tplDescription.length}/250</p>
              </div>
              <div className="space-y-2">
                <Label>Marqueurs textuels</Label>
                <div className="flex flex-wrap gap-1">
                  {tplMarkers.map((m) => (
                    <Badge key={m} variant="secondary" className="gap-1">
                      {m}
                      <button onClick={() => setTplMarkers(tplMarkers.filter((x) => x !== m))} className="hover:text-destructive">
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={newMarker}
                    onChange={(e) => setNewMarker(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const v = newMarker.trim();
                        if (v && !tplMarkers.includes(v)) setTplMarkers([...tplMarkers, v]);
                        setNewMarker("");
                      }
                    }}
                    placeholder="+ Ajouter un marqueur"
                  />
              </div>
              <div className="space-y-1">
                <Label htmlFor="tpl-test-text">
                  Texte de test <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="tpl-test-text"
                  value={tplTestText}
                  onChange={(e) => setTplTestText(e.target.value.slice(0, 1000))}
                  rows={4}
                  placeholder="Texte représentatif qui doit matcher ce template (utilisé dans la suite de test canonique)…"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Sera ajouté au corpus /admin/test-suite après déploiement.</span>
                  <span>{tplTestText.length}/1000</span>
                </div>
                {tplTestText.trim().length > 0 && tplTestText.trim().length < 20 && (
                  <p className="text-xs text-destructive">Min 20 caractères</p>
                )}
              </div>
              </div>
              <div className="space-y-1">
                <Label>Slots</Label>
                <ul className="text-sm text-muted-foreground">
                  {slotGroups.map((g) => {
                    const c = cardinality.find((x) => x.slotName === g.name);
                    return (
                      <li key={g.name}>
                        ▸ <span className="font-mono">{g.name}</span>{" "}
                        {g.items.length === 1
                          ? "(unique)"
                          : c?.mode === "variants"
                          ? `(répété ${c.max})`
                          : `(répété ${c?.min ?? g.items.length}-${c?.max ?? g.items.length})`}
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div className="space-y-1">
                <Label>Matching types cochés</Label>
                <ul className="text-sm text-muted-foreground">
                  {selectedMatching.map((t) => <li key={t.id}>· {t.label}</li>)}
                  {otherChecked && otherText && <li>· Autre : {otherText}</li>}
                </ul>
              </div>
            </Card>
          </div>
        )}

        {/* Footer nav */}
        <div className="mt-8 flex items-center justify-between gap-2 border-t pt-4">
          <Button variant="outline" onClick={goPrev} disabled={phase === 1}>
            <ArrowLeftCircle className="w-4 h-4" /> Précédent
          </Button>
          <div className="text-sm text-muted-foreground">
            {phase === 2 && (
              <>{anchors.length} ancre{anchors.length > 1 ? "s" : ""} · {slotGroups.length} slot{slotGroups.length > 1 ? "s" : ""}</>
            )}
          </div>
          {phase < 6 ? (
            <Button onClick={goNext} disabled={(phase === 1 && !upload) || (phase === 2 && anchors.length === 0)}>
              Continuer <ArrowRight className="w-4 h-4" />
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" onClick={saveDraft}>
                <Save className="w-4 h-4" /> Sauvegarder draft
              </Button>
              <Button onClick={onDeployClick}>
                Déployer 🚀
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Modal: nommer le slot */}
      <Dialog open={namePromptOpen} onOpenChange={(o) => { if (!o) cancelName(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Comment nommer ce slot ?</DialogTitle>
            <DialogDescription>
              Format snake_case (a-z, 0-9, _). Si le nom existe déjà, il devient un slot répété.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              autoFocus
              value={nameValue}
              onChange={(e) => { setNameValue(e.target.value); setNameError(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") submitName(); }}
              placeholder="title, nacelle…"
              className="font-mono"
            />
            {nameError && <p className="text-xs text-destructive">{nameError}</p>}
            {allNames.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-2">
                {allNames.map((n) => (
                  <Badge key={n} variant="outline" className="cursor-pointer" onClick={() => setNameValue(n)}>{n}</Badge>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={cancelName}>Annuler</Button>
            <Button onClick={submitName}>Valider</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: renommer un groupe */}
      <Dialog open={renameTarget !== null} onOpenChange={(o) => { if (!o) setRenameTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renommer le slot « {renameTarget} »</DialogTitle>
            <DialogDescription>Toutes les ancres portant ce nom seront renommées.</DialogDescription>
          </DialogHeader>
          <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} className="font-mono" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>Annuler</Button>
            <Button onClick={renameGroup}>Renommer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: déploiement */}
      <Dialog open={deployOpen} onOpenChange={setDeployOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Déployer « {tplName} » comme template Premium ?</DialogTitle>
            <DialogDescription>
              Cette action est immédiate et le template sera disponible aux utilisateurs dès maintenant.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeployOpen(false)} disabled={deploying}>Annuler</Button>
            <Button onClick={confirmDeploy} disabled={deploying}>
              {deploying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
              Confirmer le déploiement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset confirm */}
      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Recommencer depuis le début ?</AlertDialogTitle>
            <AlertDialogDescription>Tu vas perdre toutes les ancres et métadonnées. Cette action est irréversible.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={resetAll}>Tout réinitialiser</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
