
alter table public.sicai_documents
  add column if not exists source_type text,
  add column if not exists url text,
  add column if not exists internal_notes text;
