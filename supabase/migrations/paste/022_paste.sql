-- 022_atomic_web_booking.sql  — paste this whole block into the Supabase SQL editor.
-- Wrapped in a transaction: if the paste is cut short, nothing is applied.
begin;

create or replace function release_promo(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update promo_codes
     set used_count = greatest(used_count - 1, 0)
   where id = p_id;
end;
$$;
revoke all on function release_promo(uuid) from public, anon, authenticated;
grant execute on function release_promo(uuid) to service_role;
create or replace function create_web_booking(
  p_quote            jsonb,
  p_reservation      jsonb,
  p_promo_code       text default null,
  p_idempotency_key  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_promo        promo_codes%rowtype;
  v_discount     numeric := 0;
  v_promo_id     uuid    := null;
  v_quote_id     uuid;
  v_existing     text;
  v_ref          text := p_quote->>'ref';
begin
  if p_idempotency_key is not null then
    select ref into v_existing
      from quotes
     where idempotency_key = p_idempotency_key
     limit 1;
    if found then
      return jsonb_build_object('ref', v_existing, 'idempotent_replay', true);
    end if;
  end if;
  if p_promo_code is not null and length(trim(p_promo_code)) > 0 then
    select * into v_promo
      from promo_codes
     where active = true and lower(code) = lower(trim(p_promo_code))
       for update;
    if found
       and (v_promo.expires_at is null or v_promo.expires_at >= current_date)
       and (v_promo.max_uses is null or v_promo.used_count < v_promo.max_uses)
    then
      update promo_codes set used_count = used_count + 1 where id = v_promo.id;
      v_promo_id := v_promo.id;
      v_discount := case
        when v_promo.type = 'percentage'
          then round(((p_quote->>'total')::numeric * v_promo.value / 100)::numeric, 2)
        else round(v_promo.value::numeric, 2)
      end;
    end if;
  end if;
  insert into quotes select * from jsonb_populate_record(null::quotes, p_quote)
  returning id into v_quote_id;
  insert into reservations select * from jsonb_populate_record(null::reservations, p_reservation);
  return jsonb_build_object(
    'ref', v_ref,
    'quote_id', v_quote_id,
    'promo_id', v_promo_id,
    'discount', v_discount,
    'idempotent_replay', false
  );
end;
$$;
revoke all on function create_web_booking(jsonb, jsonb, text, text) from public, anon, authenticated;
grant execute on function create_web_booking(jsonb, jsonb, text, text) to service_role;
alter table quotes add column if not exists idempotency_key text;
create unique index if not exists quotes_idempotency_key_uniq
  on quotes (idempotency_key)
  where idempotency_key is not null;

select 'REACHED THE END' as status;
commit;
