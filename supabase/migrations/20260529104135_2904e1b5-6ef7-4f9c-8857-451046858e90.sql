
CREATE TABLE IF NOT EXISTS public.matrice_archetype (
  matrice_id text PRIMARY KEY,
  archetype_canonical text,
  archetype_alternatives jsonb NOT NULL DEFAULT '[]'::jsonb,
  archetype_status text NOT NULL DEFAULT 'unknown',
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.matrice_archetype TO authenticated;
GRANT ALL ON public.matrice_archetype TO service_role;

ALTER TABLE public.matrice_archetype ENABLE ROW LEVEL SECURITY;

CREATE POLICY "matrice_archetype admin all"
ON public.matrice_archetype
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER trg_matrice_archetype_updated_at
BEFORE UPDATE ON public.matrice_archetype
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
