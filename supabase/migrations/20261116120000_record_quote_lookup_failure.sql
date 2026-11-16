-- 050: Version the existing service-only RPC without changing its void signature.
-- Proposed policy (owner approval before release): reset after 24 idle hours.
-- Concurrent failures serialize on the IP row. An active block is immutable:
-- queued requests cannot increase its duration, count, or inactivity timestamp.
create or replace function public.record_quote_lookup_failure(p_ip text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ip text := coalesce(nullif(trim(p_ip), ''), 'unknown');
  v_row public.quote_rate_limits%rowtype;
  v_now timestamptz;
  v_count int;
begin
  if length(v_ip) > 256 then raise exception 'Invalid IP'; end if;
  insert into public.quote_rate_limits (ip, fail_count, updated_at)
  values (v_ip, 0, now()) on conflict (ip) do nothing;

  select * into strict v_row from public.quote_rate_limits where ip = v_ip for update;
  v_now := clock_timestamp();
  if v_row.blocked_until > v_now then return; end if;
  v_count := case when v_row.updated_at < v_now - interval '24 hours'
    then 1 else v_row.fail_count + 1 end;
  update public.quote_rate_limits set
    fail_count = v_count,
    blocked_until = case
      when v_count >= 12 then v_now + interval '24 hours'
      when v_count >= 8 then v_now + interval '1 hour'
      when v_count >= 5 then v_now + interval '10 minutes'
      when v_count >= 3 then v_now + interval '30 seconds'
      else null end,
    updated_at = v_now
  where ip = v_ip;
end;
$$;
revoke all on function public.record_quote_lookup_failure(text) from public, anon, authenticated;
grant execute on function public.record_quote_lookup_failure(text) to service_role;
