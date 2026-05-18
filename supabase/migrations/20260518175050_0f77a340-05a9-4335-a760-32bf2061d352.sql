
-- ============ SICAI tables ============

create table public.sicai_sources (
  id uuid primary key default gen_random_uuid(),
  source_id text unique not null,
  title text not null,
  source_type text,
  source_name text,
  url text,
  language text default 'fr',
  expected_sicai_profile text,
  analysis_interest text,
  content_status text default 'metadata_only',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sicai_documents (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.sicai_sources(id) on delete set null,
  title text not null,
  raw_text text,
  summary text,
  language text default 'fr',
  document_status text default 'draft',
  word_count integer,
  paragraph_count integer,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sicai_paragraphs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references public.sicai_documents(id) on delete cascade,
  paragraph_index integer not null,
  paragraph_text text not null,
  word_count integer,
  has_list boolean default false,
  detected_items_count integer,
  created_at timestamptz not null default now()
);

create table public.sicai_analyses (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references public.sicai_documents(id) on delete cascade,
  paragraph_id uuid references public.sicai_paragraphs(id) on delete cascade,
  analysis_level text not null,
  dominant_textual_function text,
  secondary_categories jsonb default '[]'::jsonb,
  intensities jsonb not null default '{}'::jsonb,
  classification_status text,
  cardinality jsonb default '{}'::jsonb,
  temporality text,
  spatiality text,
  agency text,
  tension text,
  transformation text,
  iconic_affordance jsonb default '{}'::jsonb,
  abstraction_level text,
  graphic_family text,
  sicai_archetype_id text,
  visual_brief jsonb default '{}'::jsonb,
  image_prompt text,
  ai_model text,
  ai_raw_response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sicai_archetypes (
  id uuid primary key default gen_random_uuid(),
  archetype_id text unique not null,
  graphic_family text not null,
  cardinality text not null,
  representation_regime text not null,
  description text,
  best_for jsonb default '[]'::jsonb,
  avoid_for jsonb default '[]'::jsonb,
  composition_principle text,
  visual_motifs jsonb default '[]'::jsonb,
  possible_tones jsonb default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table public.sicai_settings (
  id uuid primary key default gen_random_uuid(),
  setting_key text unique not null,
  setting_value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes utiles
create index sicai_documents_source_id_idx on public.sicai_documents(source_id);
create index sicai_paragraphs_document_id_idx on public.sicai_paragraphs(document_id);
create index sicai_analyses_document_id_idx on public.sicai_analyses(document_id);
create index sicai_analyses_paragraph_id_idx on public.sicai_analyses(paragraph_id);

-- updated_at triggers (réutilise public.set_updated_at)
create trigger sicai_sources_updated_at before update on public.sicai_sources
  for each row execute function public.set_updated_at();
create trigger sicai_documents_updated_at before update on public.sicai_documents
  for each row execute function public.set_updated_at();
create trigger sicai_analyses_updated_at before update on public.sicai_analyses
  for each row execute function public.set_updated_at();
create trigger sicai_settings_updated_at before update on public.sicai_settings
  for each row execute function public.set_updated_at();

-- ============ RLS : admin-only ============

alter table public.sicai_sources    enable row level security;
alter table public.sicai_documents  enable row level security;
alter table public.sicai_paragraphs enable row level security;
alter table public.sicai_analyses   enable row level security;
alter table public.sicai_archetypes enable row level security;
alter table public.sicai_settings   enable row level security;

-- Politique générique : admins ont tous les droits (SELECT/INSERT/UPDATE/DELETE)
do $$
declare
  t text;
begin
  foreach t in array array[
    'sicai_sources','sicai_documents','sicai_paragraphs',
    'sicai_analyses','sicai_archetypes','sicai_settings'
  ]
  loop
    execute format($p$
      create policy "Admins manage %1$s"
        on public.%1$I
        for all
        to authenticated
        using (public.has_role(auth.uid(), 'admin'::public.app_role))
        with check (public.has_role(auth.uid(), 'admin'::public.app_role));
    $p$, t);
  end loop;
end$$;
