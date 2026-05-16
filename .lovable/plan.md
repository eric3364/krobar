## Objectif

Le backend renvoie maintenant un champ `svg_kr` (nullable) dans la réponse de `/admin/studio/upload`. Quand il est présent, on pré-remplit toutes les étapes du wizard au lieu de demander à l'utilisateur de saisir chaque champ. Backward-compatible : si `svg_kr` est `null`, comportement inchangé.

## Fichiers touchés

1. **`src/types/svgKr.ts`** (nouveau) — Type `SvgKrData` reflétant la spec (version, metadata, slots[], decorations[]).
2. **`src/mocks/studio.ts`** — Ajouter `svg_kr?: SvgKrData | null` au type `UploadResponse`.
3. **`src/lib/studioApi.ts`** — Pas de changement (le proxy transmet déjà le champ).
4. **`src/lib/svgKrHydrator.ts`** (nouveau) — Fonctions pures qui, à partir d'un `SvgKrData`, produisent : metadata, markers, matching_types, anchors (avec regroupement des slots `repeated` par `instance_index`), cardinality configs, iconSlots.
5. **`src/pages/AdminStudioPage.tsx`** — 
   - À la fin du handler upload (ligne ~503) : si `res.svg_kr` non null, appeler le hydrator et `setX(...)` pour metadata/markers/matching/anchors/cardinality/iconSlots ; stocker aussi `svgKr` dans un state local.
   - Ajouter un state `svgKrInfo: SvgKrData | null`.
   - Bandeau de détection en haut du wizard : `✓ SVG-KR v{version} détecté — wizard pré-rempli` (teal), avec bouton **« Repartir de zéro »** (confirmation) qui efface le state hydraté et garde l'upload.
   - Petit sous-titre `(pré-rempli depuis SVG-KR)` sous chaque section pertinente quand `svgKrInfo` est présent.
   - Étape 8 : liste read-only **« Décorations conservées »** à partir de `svgKr.decorations`.
   - Cas d'erreur : `slots` vide → warning + on n'hydrate pas ; bbox hors limites → warning toast ; `id` manquant → champ vide laissé à l'utilisateur.

## Regroupement des slots repeated

Les slots `repeated` arrivent avec une ligne par instance (même `key`, `instance_index` différent). Le hydrator :
- crée **1 entrée logique** par `key` distincte (utilisée pour cardinality config : ideal/min/max/variants),
- crée **N ancres physiques** (`Anchor.slotName = key` ou `key_<index>` selon la convention en place — à confirmer via le code existant des ancres répétées),
- crée **1 iconSlot par key** (les icônes sont définies au niveau du slot logique, pas par instance).

## Détails techniques

- `metadata.category` doit matcher l'un des `tplCategory` existants du wizard ; sinon on laisse vide et on log un warn.
- `metadata.canonical_preset` → bascule `templateType` sur `canonical` et set `canonicalPresetId` si la preset existe dans `canonicalPresets`.
- `slot.icon.behavior` `disabled` ⇒ ne pas créer d'iconSlot ; `optional`/`forced` ⇒ créer un `IconSlotSpec` avec `default_icon`, `size`, `position_x/y` dérivés de `position` (before/top/after) relativement à la bbox.
- Version : si `svg_kr.version` ne commence pas par `1.`, on affiche un avertissement et on ignore (dégradation gracieuse).

## Hors scope

- Pas de modification de l'edge function `krobar-proxy` (transmission déjà OK).
- Pas de page d'aide « comment produire un SVG-KR » (mentionnée en note dans le prompt mais non demandée explicitement).
- Pas de test E2E automatisé — vérification manuelle via upload de fichier réel.
