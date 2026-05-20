
-- Templates catalog
CREATE TABLE public.sicai_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  illustration_id text UNIQUE NOT NULL,
  file_name_target text UNIQUE NOT NULL,
  family_code text NOT NULL,
  family_label text,
  cardinality_code text NOT NULL,
  cardinality_label text,
  regime_code text NOT NULL,
  regime_label text,
  title_placeholder_count int NOT NULL DEFAULT 1,
  verbatim_placeholder_count int NOT NULL,
  visual_anchor_count int NOT NULL,
  placeholder_rule text,
  anchor_to_placeholder_rule text,
  color_standard text,
  svg_constraint_summary text,
  composition_distinctive_rule text,
  regime_differentiation_rule text,
  matching_tags text[],
  micro_brief text,
  prompt_short text,
  prompt_full text NOT NULL,
  negative_rules text,
  editorial_style_rule text,
  visual_hierarchy_rule text,
  composition_refinement_rule text,
  svg_technical_constraints text,
  source_row_index int,
  prompt_checksum text,
  validation_errors jsonb,
  status text NOT NULL DEFAULT 'imported',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sicai_templates_status ON public.sicai_templates(status);
CREATE INDEX idx_sicai_templates_family ON public.sicai_templates(family_code, cardinality_code, regime_code);

CREATE TABLE public.sicai_generation_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text,
  batch_mode text NOT NULL,
  openai_batch_id text,
  source_file_name text,
  request_count int NOT NULL,
  approved_count int DEFAULT 0,
  failed_count int DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  cost_estimate_usd numeric,
  cost_actual_usd numeric,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.sicai_generation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid REFERENCES public.sicai_generation_batches(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.sicai_templates(id),
  custom_id text UNIQUE,
  openai_request_json jsonb,
  openai_response_json jsonb,
  revised_prompt text,
  usage_input_tokens int,
  usage_output_tokens int,
  status text NOT NULL DEFAULT 'queued',
  retry_count int DEFAULT 0,
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sicai_jobs_batch ON public.sicai_generation_jobs(batch_id);
CREATE INDEX idx_sicai_jobs_status ON public.sicai_generation_jobs(status);

CREATE TABLE public.sicai_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.sicai_generation_jobs(id) ON DELETE CASCADE,
  asset_kind text NOT NULL,
  storage_path text NOT NULL,
  checksum text,
  width int,
  height int,
  file_size_bytes int,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sicai_assets_job ON public.sicai_assets(job_id);

CREATE TABLE public.sicai_qc_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.sicai_generation_jobs(id) ON DELETE CASCADE,
  check_name text NOT NULL,
  check_status text NOT NULL,
  score numeric,
  details_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sicai_qc_job ON public.sicai_qc_checks(job_id);

CREATE TABLE public.sicai_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.sicai_generation_jobs(id) ON DELETE CASCADE,
  reviewer_id uuid REFERENCES auth.users(id),
  decision text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Triggers updated_at
CREATE TRIGGER set_updated_at_sicai_templates BEFORE UPDATE ON public.sicai_templates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at_sicai_generation_batches BEFORE UPDATE ON public.sicai_generation_batches FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at_sicai_generation_jobs BEFORE UPDATE ON public.sicai_generation_jobs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS
ALTER TABLE public.sicai_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sicai_generation_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sicai_generation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sicai_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sicai_qc_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sicai_reviews ENABLE ROW LEVEL SECURITY;

-- Admin-only policies
CREATE POLICY "Admins manage sicai_templates" ON public.sicai_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins manage sicai_generation_batches" ON public.sicai_generation_batches FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins manage sicai_generation_jobs" ON public.sicai_generation_jobs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins manage sicai_assets" ON public.sicai_assets FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins manage sicai_qc_checks" ON public.sicai_qc_checks FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins manage sicai_reviews" ON public.sicai_reviews FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Private storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('sicai-assets', 'sicai-assets', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Admins read sicai-assets" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'sicai-assets' AND public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins insert sicai-assets" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'sicai-assets' AND public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins update sicai-assets" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'sicai-assets' AND public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins delete sicai-assets" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'sicai-assets' AND public.has_role(auth.uid(), 'admin'::public.app_role));
