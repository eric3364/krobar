-- 1. Enums
create type public.app_role as enum ('admin', 'user');
create type public.user_plan as enum ('free', 'basic', 'premium');

-- 2. Profiles table
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  plan public.user_plan not null default 'free',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- 3. User roles table
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
alter table public.user_roles enable row level security;

-- 4. Plan quotas table (editable by admin)
create table public.plan_quotas (
  plan public.user_plan primary key,
  monthly_limit integer not null,
  description text,
  updated_at timestamptz not null default now()
);
alter table public.plan_quotas enable row level security;

insert into public.plan_quotas (plan, monthly_limit, description) values
  ('free', 5, 'Accès basique limité'),
  ('basic', 50, 'Plan basique mensuel'),
  ('premium', 500, 'Plan premium mensuel');

-- 5. Generations log (1 row per SVG generated)
create table public.generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  template_id text,
  created_at timestamptz not null default now()
);
alter table public.generations enable row level security;
create index generations_user_month_idx on public.generations (user_id, created_at);

-- 6. SECURITY DEFINER role-check function (avoids RLS recursion)
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

-- 7. Helper: current monthly usage
create or replace function public.current_month_usage(_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.generations
  where user_id = _user_id
    and created_at >= date_trunc('month', now());
$$;

-- 8. Helper: can user generate?
create or replace function public.can_generate(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select p.is_active
        and public.current_month_usage(_user_id) < q.monthly_limit
      from public.profiles p
      join public.plan_quotas q on q.plan = p.plan
      where p.id = _user_id
    ),
    false
  )
$$;

-- 9. Trigger: auto-create profile + default 'user' role on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'user')
  on conflict (user_id, role) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- 10. updated_at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger plan_quotas_set_updated_at before update on public.plan_quotas
  for each row execute function public.set_updated_at();

-- 11. RLS policies
-- profiles
create policy "Users read own profile" on public.profiles
  for select to authenticated using (auth.uid() = id);
create policy "Admins read all profiles" on public.profiles
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Users update own profile (display_name only effectively)" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
create policy "Admins update any profile" on public.profiles
  for update to authenticated using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- user_roles
create policy "Users read own roles" on public.user_roles
  for select to authenticated using (auth.uid() = user_id);
create policy "Admins read all roles" on public.user_roles
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Admins manage roles" on public.user_roles
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- plan_quotas: readable by everyone authenticated, writable by admins
create policy "Authenticated read quotas" on public.plan_quotas
  for select to authenticated using (true);
create policy "Admins update quotas" on public.plan_quotas
  for update to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- generations
create policy "Users read own generations" on public.generations
  for select to authenticated using (auth.uid() = user_id);
create policy "Admins read all generations" on public.generations
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Users insert own generations if allowed" on public.generations
  for insert to authenticated
  with check (auth.uid() = user_id and public.can_generate(auth.uid()));
