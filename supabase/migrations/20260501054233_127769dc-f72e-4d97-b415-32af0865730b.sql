-- Promote eric.combalbert@gmail.com to admin as soon as the account exists
insert into public.user_roles (user_id, role)
select id, 'admin'::public.app_role
from auth.users
where email = 'eric.combalbert@gmail.com'
on conflict (user_id, role) do nothing;

-- Trigger that auto-grants admin role to this email on future signup
create or replace function public.grant_super_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email = 'eric.combalbert@gmail.com' then
    insert into public.user_roles (user_id, role)
    values (new.id, 'admin'::public.app_role)
    on conflict (user_id, role) do nothing;
  end if;
  return new;
end;
$$;

revoke execute on function public.grant_super_admin() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_super_admin on auth.users;
create trigger on_auth_user_created_super_admin
after insert on auth.users
for each row execute function public.grant_super_admin();
