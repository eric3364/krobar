CREATE TABLE public.matrice_trigger_lexicon (
  matrice_id text PRIMARY KEY,
  lexicon_yaml text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.matrice_trigger_lexicon TO authenticated;
GRANT ALL ON public.matrice_trigger_lexicon TO service_role;

ALTER TABLE public.matrice_trigger_lexicon ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage matrice_trigger_lexicon"
ON public.matrice_trigger_lexicon
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER matrice_trigger_lexicon_set_updated_at
BEFORE UPDATE ON public.matrice_trigger_lexicon
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
