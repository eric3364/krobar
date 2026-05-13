// Branche un menu contextuel sur les icônes dynamiques (.slot-icon) injectées
// dans le rendu d'un template Premium. Garantit qu'aucune action n'est déclenchée
// pour les icônes décoratives (.decorative-icon).
//
// Usage :
//   const { menu, refresh } = useSlotIconInteractivity(containerRef, icons, slots);
//   {menu}

import { useCallback, useEffect, useRef, useState } from "react";
import type { SlotIcon } from "@/types/analyze";
import { getLucideIconSvg } from "@/api/lucide";
import { suggestIcon } from "@/api/studio";
import IconContextMenu from "@/components/render/IconContextMenu";
import { toast } from "sonner";

type MenuState = {
  open: boolean;
  position: { x: number; y: number };
  slotKey: string;
  currentIconName: string;
  alternatives: string[];
  slotText: string;
};

// Cache global des SVG Lucide récupérés (partagé entre les rendus).
const svgCache = new Map<string, string>();

async function fetchSvgCached(name: string): Promise<string> {
  const hit = svgCache.get(name);
  if (hit) return hit;
  const svg = await getLucideIconSvg(name);
  svgCache.set(name, svg);
  return svg;
}

// Remplace le contenu d'un <g class="slot-icon"> par le SVG d'une nouvelle icône
// Lucide. Conserve currentColor pour rester compatible avec la palette utilisateur.
function substituteIconInDom(slotG: SVGGElement, newSvgString: string, newName: string) {
  const doc = new DOMParser().parseFromString(newSvgString, "image/svg+xml");
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== "svg") return;
  // Vide l'ancien contenu.
  while (slotG.firstChild) slotG.removeChild(slotG.firstChild);
  // Importe les enfants du nouveau SVG dans le <g>.
  Array.from(root.childNodes).forEach((n) => {
    slotG.appendChild(slotG.ownerDocument!.importNode(n, true));
  });
  slotG.setAttribute("data-icon-name", newName);
}

export function useSlotIconInteractivity(
  containerRef: React.RefObject<HTMLElement>,
  icons: Record<string, SlotIcon> | undefined,
  slotTexts: Record<string, string> | undefined,
) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  // Conserve la version vivante des icônes (mise à jour après substitution).
  const iconsRef = useRef<Record<string, SlotIcon>>({});

  useEffect(() => {
    iconsRef.current = { ...(icons ?? {}) };
  }, [icons]);

  // Délégué de clic — n'attache l'écouteur QUE si `icons` est présent.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !icons || Object.keys(icons).length === 0) return;

    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target) return;
      // Si l'élément cliqué est dans une icône décorative, on ignore strictement.
      if (target.closest(".decorative-icon")) return;
      const slotG = target.closest(".slot-icon") as SVGGElement | null;
      if (!slotG) return;
      const slotKey = slotG.getAttribute("data-slot-icon-key");
      if (!slotKey) return;
      const currentIconName =
        slotG.getAttribute("data-icon-name") ?? iconsRef.current[slotKey]?.default ?? "";
      const spec = iconsRef.current[slotKey];
      const alternatives = (spec?.alternatives ?? []).filter((n) => n !== currentIconName).slice(0, 4);
      e.preventDefault();
      e.stopPropagation();
      setMenu({
        open: true,
        position: { x: e.clientX + 8, y: e.clientY + 8 },
        slotKey,
        currentIconName,
        alternatives,
        slotText: slotTexts?.[slotKey] ?? "",
      });
    };

    container.addEventListener("click", onClick);
    return () => container.removeEventListener("click", onClick);
  }, [containerRef, icons, slotTexts]);

  const handleSelect = useCallback(
    async (newName: string) => {
      if (!menu) return;
      const container = containerRef.current;
      if (!container) return;
      const slotG = container.querySelector(
        `.slot-icon[data-slot-icon-key="${CSS.escape(menu.slotKey)}"]`,
      ) as SVGGElement | null;
      if (!slotG) {
        toast.error("Slot introuvable dans le rendu.");
        return;
      }
      try {
        const svg = await fetchSvgCached(newName);
        substituteIconInDom(slotG, svg, newName);
        // Mise à jour de l'état local pour les prochaines ouvertures.
        const prev = iconsRef.current[menu.slotKey];
        if (prev) {
          iconsRef.current = {
            ...iconsRef.current,
            [menu.slotKey]: { default: newName, alternatives: prev.alternatives },
          };
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Échec du remplacement";
        toast.error(msg);
      }
    },
    [menu, containerRef],
  );

  const handleRequestMore = useCallback(
    async (excludeIcons: string[]): Promise<string[]> => {
      if (!menu) return [];
      const slotText = menu.slotText || menu.slotKey;
      const res = await suggestIcon({ slot_text: slotText, exclude_icons: excludeIcons });
      return (res.candidates ?? []).map((c) => c.name).slice(0, 4);
    },
    [menu],
  );

  const menuNode = menu ? (
    <IconContextMenu
      open={menu.open}
      anchorPosition={menu.position}
      currentIconName={menu.currentIconName}
      alternatives={menu.alternatives}
      slotText={menu.slotText}
      onSelect={handleSelect}
      onRequestMore={handleRequestMore}
      onClose={() => setMenu(null)}
    />
  ) : null;

  return { menu: menuNode };
}
