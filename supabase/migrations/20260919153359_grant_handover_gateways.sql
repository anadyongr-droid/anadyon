-- Switch the four handover gateways on for signed-in users.
--
-- The gateways do not trust the JWT's role claim. Each reads auth.uid() from
-- PostgREST's request context and verifies the caller's current, server-owned
-- role in auth.users.raw_app_meta_data before reaching the privileged
-- implementation. Granting only `authenticated` also makes a service-role call
-- fail closed before the function body, so routes must use a user-scoped client.

revoke all on function public.finalise_check_out(uuid, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.finalise_check_in(uuid, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.correct_handover(uuid, text, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.void_handover(uuid, text)
  from public, anon, authenticated, service_role;

grant execute on function public.finalise_check_out(uuid, timestamptz)
  to authenticated;
grant execute on function public.finalise_check_in(uuid, timestamptz)
  to authenticated;
grant execute on function public.correct_handover(uuid, text, jsonb)
  to authenticated;
grant execute on function public.void_handover(uuid, text)
  to authenticated;

do $$
begin
  raise notice 'REACHED THE END — handover gateway grants';
end;
$$;
