
ALTER TABLE public.sicai_archetypes
  ADD COLUMN IF NOT EXISTS svg_storage_path text,
  ADD COLUMN IF NOT EXISTS thumbnail_storage_path text,
  ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_job_id uuid;

CREATE INDEX IF NOT EXISTS idx_sicai_archetypes_archetype_id ON public.sicai_archetypes(archetype_id);
