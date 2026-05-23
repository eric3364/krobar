-- 1. Table sicai_themes
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

CREATE POLICY "Admins manage sicai_themes"
  ON public.sicai_themes
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER trg_sicai_themes_updated
  BEFORE UPDATE ON public.sicai_themes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Colonnes thématiques sur batches
ALTER TABLE public.sicai_generation_batches
  ADD COLUMN theme_id uuid REFERENCES public.sicai_themes(id),
  ADD COLUMN theme_code text,
  ADD COLUMN is_dry_run boolean NOT NULL DEFAULT false;

-- 3. Colonnes thématiques sur archetypes
ALTER TABLE public.sicai_archetypes
  ADD COLUMN theme_id uuid REFERENCES public.sicai_themes(id),
  ADD COLUMN theme_code text;

-- 4. Seed du thème neutre
INSERT INTO public.sicai_themes (code, label_fr, description, status, is_protected)
VALUES (
  'neutre',
  'Neutre (sans domaine thématique)',
  'Set de référence sans contrainte thématique. Objets et scènes génériques.',
  'active',
  true
);

-- 5. Rétro-assignation
UPDATE public.sicai_generation_batches
   SET theme_id = (SELECT id FROM public.sicai_themes WHERE code='neutre'),
       theme_code = 'neutre'
 WHERE theme_id IS NULL;

UPDATE public.sicai_archetypes
   SET theme_id = (SELECT id FROM public.sicai_themes WHERE code='neutre'),
       theme_code = 'neutre'
 WHERE theme_id IS NULL;

-- 6. Refonte de l'unicité sur sicai_archetypes
ALTER TABLE public.sicai_archetypes
  DROP CONSTRAINT IF EXISTS sicai_archetypes_archetype_id_key;
DROP INDEX IF EXISTS public.sicai_archetypes_archetype_id_key;

ALTER TABLE public.sicai_archetypes
  ADD CONSTRAINT sicai_archetypes_archetype_id_theme_id_key
  UNIQUE (archetype_id, theme_id);

-- 7. Index utiles
CREATE INDEX IF NOT EXISTS idx_sicai_batches_theme_id
  ON public.sicai_generation_batches(theme_id);
CREATE INDEX IF NOT EXISTS idx_sicai_archetypes_theme_id
  ON public.sicai_archetypes(theme_id);