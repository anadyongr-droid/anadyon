-- SQL-editor copy of 20260919153359_grant_handover_gateways.sql.

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
