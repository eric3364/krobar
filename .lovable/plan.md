
# Phase A — Multi-thèmes SICAI

Plan d'exécution séquencé. Aucune étape n'est appliquée tant que tu n'as pas confirmé.

## Ordre d'exécution

1. **Migration DB #1** — création `sicai_themes`, colonnes thématiques sur batches/archetypes, contrainte UNIQUE refondue, colonne `is_dry_run`. Seed du thème `neutre` + rétro-assignation des batches/archetypes existants (dans la même migration, en une transaction).
2. **Edge function `sicai-migrate-storage-to-themed`** — déplace les blobs Storage existants sous `neutre/`, met à jour les paths en DB par batchs de 50. Déclenchée manuellement une fois après la migration #1.
3. **Backend prompts/publish** — modifs de `sicai-import-xlsx`, `sicai-create-generation-batch`, `sicai-postprocess-svg`, `_shared/sicai-publish.ts`, `sicai-republish-orphans` pour gérer `theme_id`/`theme_code`, Bloc 0.5, cell_briefs, paths thématisés. Skip publish si `is_dry_run`.
4. **Front — page Thèmes** : route, liste, édition (lexique, contraintes, prompt addition, cell briefs).
5. **Front — Dry-run** intégré à l'édition thème + edge function `sicai-create-dry-run-batch` (réutilise `create-generation-batch` avec flag).
6. **Front — Intégration** : sélecteur thème dans création de batch (`SicaiBatchesTab`) et dans `SicaiQcDashboardPage`.

Je m'arrête après chaque étape de migration DB pour confirmation, le reste s'enchaîne.

---

## Détail par étape

### Étape 1 — Migration DB (un seul fichier de migration)

```sql
CREATE TABLE public.sicai_themes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL CHECK (code ~ '^[a-z][a-z0-9_]*$'),
  label_fr text NOT NULL,
  description text,
  visual_lexicon jsonb NOT NULL DEFAULT '{}'::jsonb,
  constraints text,
  cell_briefs jsonb NOT NULL DEFAULT '{}'::jsonb,
  prompt_bloc_addition text,
  version int NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  is_protected boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sicai_themes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage sicai_themes" ON public.sicai_themes
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_sicai_themes_updated BEFORE UPDATE ON public.sicai_themes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.sicai_generation_batches
  ADD COLUMN theme_id uuid REFERENCES public.sicai_themes(id),
  ADD COLUMN theme_code text,
  ADD COLUMN is_dry_run boolean NOT NULL DEFAULT false;

ALTER TABLE public.sicai_archetypes
  ADD COLUMN theme_id uuid REFERENCES public.sicai_themes(id),
  ADD COLUMN theme_code text;

-- Seed neutre
INSERT INTO public.sicai_themes (code,label_fr,description,status,is_protected)
VALUES ('neutre','Neutre (sans domaine thématique)',
        'Set de référence sans contrainte thématique. Objets et scènes génériques.',
        'active', true);

-- Rétro-assignation
UPDATE public.sicai_generation_batches
   SET theme_id=(SELECT id FROM public.sicai_themes WHERE code='neutre'),
       theme_code='neutre'
 WHERE theme_id IS NULL;
UPDATE public.sicai_archetypes
   SET theme_id=(SELECT id FROM public.sicai_themes WHERE code='neutre'),
       theme_code='neutre'
 WHERE theme_id IS NULL;

-- Refonte UNIQUE
ALTER TABLE public.sicai_archetypes
  DROP CONSTRAINT IF EXISTS sicai_archetypes_archetype_id_key;
DROP INDEX IF EXISTS sicai_archetypes_archetype_id_key;
ALTER TABLE public.sicai_archetypes
  ADD CONSTRAINT sicai_archetypes_archetype_id_theme_id_key
  UNIQUE (archetype_id, theme_id);
```

### Étape 2 — Storage thématisé

Nouvelle edge function `sicai-migrate-storage-to-themed` :
- Liste `sicai-assets/png_master`, `png_normalized`, `svg_final`, `thumbnails`
- Pour chaque objet : `storage.from('sicai-assets').move(old, 'neutre/'+old)` par batch de 50
- Met à jour `sicai_assets.storage_path`, `sicai_archetypes.svg_storage_path` et `thumbnail_storage_path` via remplacement préfixe.
- Idempotente (skip si déjà préfixé par `neutre/` ou autre code thème).

Helpers shared : ajout d'un `buildStoragePath(themeCode, kind, archetypeId)` utilisé partout.

### Étape 3 — Backend prompts & publish

Fichiers touchés :
- `supabase/functions/_shared/sicai.ts` — helpers `themedPath()`, types `Theme`
- `supabase/functions/sicai-import-xlsx/index.ts` — `buildPromptFull(row, theme?)` injecte Bloc 0.5 entre Bloc 0 et Bloc 1 si `theme.prompt_bloc_addition`; override `micro_brief`/Bloc 2 si `theme.cell_briefs[illustration_id]`. NB : à l'import on n'a pas encore de thème, donc l'injection se fait surtout au moment du batch (voir ci-dessous). L'import garde un prompt "neutre".
- `supabase/functions/sicai-create-generation-batch/index.ts` — accepte `theme_id` (défaut neutre), recharge le thème, reconstruit `prompt_full` + `prompt_checksum` par job, persiste `theme_id`/`theme_code`/`is_dry_run` sur le batch.
- `supabase/functions/sicai-postprocess-svg/index.ts` — résout `theme_code` depuis le batch et écrit assets dans `{theme_code}/...`.
- `supabase/functions/_shared/sicai-publish.ts` — récupère `theme_id`/`theme_code` via job→batch, ajoute à l'UPSERT, recherche `sicai_archetypes` par `(archetype_id, theme_id)`, skip si `is_dry_run`.
- `supabase/functions/sicai-republish-orphans/index.ts` — même clé composite.
- `supabase/functions/sicai-postprocess-batch/index.ts` — passe `theme_id` au publish helper.

Audit grep `archetype_id` → corriger tout lookup mono-clé.

### Étape 4 — UI Thèmes

- `src/pages/sicai/SicaiThemesPage.tsx` (liste)
- `src/pages/sicai/SicaiThemeEditPage.tsx` (édition + dry-run)
- Route ajoutée dans `App.tsx`, entrée menu dans le layout admin SICAI (entre Archétypes graphiques et Templates SICAI — à confirmer où ce menu vit, je regarderai au moment de l'implémentation).
- Form : code (disable après création), label, description, status, lexique (5 tag inputs), contraintes, Bloc 0.5 auto + override manuel (checkbox), table 72 cell_briefs filtrable.
- Auto-génération du Bloc 0.5 côté front à partir du lexique+contraintes (template texte simple), persistée à la sauvegarde.

### Étape 5 — Dry-run

- Section dans l'édition thème : 6 templates par défaut (codes listés dans ton brief), modifiables via multi-select.
- Bouton "Lancer dry-run" → appelle `sicai-create-generation-batch` avec `theme_id`, `template_ids:[...]`, `batch_mode:'sync'`, `is_dry_run:true`, label `"DRY-RUN {theme} {timestamp}"`.
- Polling du batch (réutilise la logique de `SicaiBatchDetailPage`), affichage grille 3×2 quand `status='completed'`.
- Bouton "Valider et lancer batch complet" → crée un batch normal sur les 72 templates avec ce thème.
- Bouton "Effacer dry-runs" : delete des batches `is_dry_run=true` du thème.

### Étape 6 — Intégration batch + QC dashboard

- `SicaiBatchesTab.tsx` : sélecteur Thème (active only), label auto `"{theme_label} — essai {N}"`.
- `SicaiQcDashboardPage.tsx` : sélecteur Thème en haut, filtrage des batches/jobs par `theme_id`, grille 72 cases pour le thème courant.

---

## Points où j'ai besoin que tu tranches

1. **Migration Storage** : OK pour `storage.move()` plutôt que copie+delete (atomique, pas de duplication temporaire) ? Réponse attendue : oui/non.
2. **Bloc 0.5 auto-généré** : tu veux un template fixe côté front du genre :
   ```
   [Bloc 0.5 — Univers thématique : {label}]
   Équipements : {liste}. Scènes : {liste}. Gestes : {liste}.
   Personnages : {liste}. Métaphores : {liste}.
   Contraintes : {constraints}.
   ```
   ou tu préfères que je propose 2-3 variantes ?
3. **Recalcul des prompts à la création de batch** : confirmé qu'on NE retouche PAS `sicai_templates.prompt_full` (qui reste neutre) et qu'on stocke le prompt thématisé uniquement dans `sicai_generation_jobs.openai_request_json` ? Sinon il faudrait une table `sicai_prompts_resolved` ou colonne dédiée — je pars sur option 1 (simple, pas de table en plus).
4. **Cell briefs override** : ils remplacent `micro_brief` dans le Bloc 2 (1 ligne) — confirmé ? Ou ils remplacent tout le Bloc 2 (sujet+famille+cardinalité+régime+rule) ?
5. **Menu admin SICAI** : tu veux que je vérifie d'abord le composant de nav avant d'ajouter "Thèmes", ou je le fais d'office au moment de l'implémentation ?

Confirme le plan + réponds aux 5 points, et j'enchaîne migration → storage function → backend → front.
