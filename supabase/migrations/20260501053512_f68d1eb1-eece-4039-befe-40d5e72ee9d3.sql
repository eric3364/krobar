-- Lock down execution of SECURITY DEFINER helpers
revoke execute on function public.has_role(uuid, public.app_role) from public, anon, authenticated;
revoke execute on function public.current_month_usage(uuid) from public, anon, authenticated;
revoke execute on function public.can_generate(uuid) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Re-grant only what's needed by RLS policies (postgres role evaluates them)
grant execute on function public.has_role(uuid, public.app_role) to postgres;
grant execute on function public.current_month_usage(uuid) to postgres, authenticated;
grant execute on function public.can_generate(uuid) to postgres, authenticated;

-- Ensure search_path on the trigger helper
alter function public.set_updated_at() set search_path = public;
