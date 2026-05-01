alter table public.profiles
  add column if not exists hide_welcome boolean not null default false;

alter table public.generations
  add column if not exists input_text text,
  add column if not exists palette_key text;

create index if not exists generations_user_created_idx
  on public.generations (user_id, created_at desc);