create table public.template_studio_params (
  template_id text primary key,
  params jsonb not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.template_studio_params enable row level security;

create policy "Admins read studio params"
  on public.template_studio_params for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create policy "Admins insert studio params"
  on public.template_studio_params for insert
  to authenticated
  with check (public.has_role(auth.uid(), 'admin'));

create policy "Admins update studio params"
  on public.template_studio_params for update
  to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create policy "Admins delete studio params"
  on public.template_studio_params for delete
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create trigger trg_template_studio_params_updated_at
  before update on public.template_studio_params
  for each row execute function public.set_updated_at();