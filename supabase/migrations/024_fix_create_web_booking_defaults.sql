-- Repair create_web_booking and make Postgres the single source of truth for
-- promo redemption and the final booking amounts.
--
-- Migration 022 inserted a complete populated record. Columns omitted from
-- the JSON therefore became explicit NULLs and database defaults (including
-- id and created_at) never fired. This version inserts only supplied columns.
begin;

-- The new deposit-rate argument changes the function identity. Drop the
-- four-argument version first so PostgREST never sees ambiguous overloads.
drop function if exists create_web_booking(jsonb, jsonb, text, text);

create function create_web_booking(
  p_quote            jsonb,
  p_reservation      jsonb,
  p_promo_code       text default null,
  p_idempotency_key  text default null,
  p_deposit_rate     numeric default 0.30
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_promo             promo_codes%rowtype;
  v_discount          numeric := 0;
  v_promo_id          uuid := null;
  v_quote_id          uuid;
  v_ref               text := p_quote->>'ref';
  v_existing_ref      text;
  v_pre_discount      numeric;
  v_final_total       numeric;
  v_final_deposit     numeric;
  v_final_balance     numeric;
  v_quote_cols        text;
  v_reservation_cols  text;
begin
  if p_quote is null or p_reservation is null then
    raise exception 'quote and reservation payloads are required'
      using errcode = '22023';
  end if;

  if p_deposit_rate is null or p_deposit_rate < 0 or p_deposit_rate > 1 then
    raise exception 'deposit rate must be between zero and one'
      using errcode = '22023';
  end if;

  v_pre_discount := (p_quote->>'total')::numeric;
  if v_pre_discount is null or v_pre_discount < 0 then
    raise exception 'quote total must be a non-negative number'
      using errcode = '22023';
  end if;

  -- Identical requests share a transaction-scoped lock. Without it, two
  -- simultaneous first attempts can both miss the lookup and race the unique
  -- index; one would then receive an error instead of a clean replay.
  if p_idempotency_key is not null and length(trim(p_idempotency_key)) > 0 then
    p_idempotency_key := trim(p_idempotency_key);
    perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 0));

    select ref, total, deposit, balance_due, discount_amount
      into v_existing_ref, v_final_total, v_final_deposit,
           v_final_balance, v_discount
      from quotes
     where idempotency_key = p_idempotency_key
     limit 1;

    if found then
      return jsonb_build_object(
        'ref', v_existing_ref,
        'discount', coalesce(v_discount, 0),
        'total', v_final_total,
        'deposit', v_final_deposit,
        'balance_due', v_final_balance,
        'idempotent_replay', true
      );
    end if;
  else
    p_idempotency_key := null;
  end if;

  -- Promo validation, redemption and both inserts share one transaction. Any
  -- later failure automatically rolls the used_count increment back.
  if p_promo_code is not null and length(trim(p_promo_code)) > 0 then
    select * into v_promo
      from promo_codes
     where active = true
       and lower(code) = lower(trim(p_promo_code))
       for update;

    if found
       and (v_promo.expires_at is null or v_promo.expires_at >= current_date)
       and (v_promo.max_uses is null or v_promo.used_count < v_promo.max_uses)
    then
      update promo_codes
         set used_count = used_count + 1
       where id = v_promo.id;

      v_promo_id := v_promo.id;
      v_discount := case
        when v_promo.type = 'percentage'
          then round((v_pre_discount * v_promo.value / 100)::numeric, 2)
        else round(v_promo.value::numeric, 2)
      end;
      v_discount := least(greatest(v_discount, 0), v_pre_discount);
    end if;
  end if;

  v_final_total := round(greatest(v_pre_discount - v_discount, 0), 2);
  v_final_deposit := round(v_final_total * p_deposit_rate, 2);
  v_final_balance := v_final_total - v_final_deposit;

  -- Never permit callers to suppress database-generated identity/timestamps.
  p_quote := (p_quote - array['id', 'created_at']) || jsonb_build_object(
    'idempotency_key', p_idempotency_key,
    'total', v_final_total,
    'deposit', v_final_deposit,
    'balance_due', v_final_balance,
    'discount_amount', v_discount
  );
  p_reservation := (p_reservation - array['id', 'created_at', 'updated_at']) || jsonb_build_object(
    'total', v_final_total,
    'deposit', v_final_deposit,
    'balance_due', v_final_balance,
    'discount_amount', v_discount,
    'promo_code_id', v_promo_id,
    'discount_reason', case
      when v_promo_id is not null then 'Promo: ' || trim(p_promo_code)
      else null
    end
  );

  select string_agg(quote_ident(c.column_name), ', ' order by c.ordinal_position)
    into v_quote_cols
    from information_schema.columns c
   where c.table_schema = 'public'
     and c.table_name = 'quotes'
     and p_quote ? c.column_name;

  execute format(
    'insert into public.quotes (%1$s) select %1$s from jsonb_populate_record(null::public.quotes, $1) returning id',
    v_quote_cols
  ) into v_quote_id using p_quote;

  select string_agg(quote_ident(c.column_name), ', ' order by c.ordinal_position)
    into v_reservation_cols
    from information_schema.columns c
   where c.table_schema = 'public'
     and c.table_name = 'reservations'
     and p_reservation ? c.column_name;

  execute format(
    'insert into public.reservations (%1$s) select %1$s from jsonb_populate_record(null::public.reservations, $1)',
    v_reservation_cols
  ) using p_reservation;

  return jsonb_build_object(
    'ref', v_ref,
    'quote_id', v_quote_id,
    'promo_id', v_promo_id,
    'discount', v_discount,
    'total', v_final_total,
    'deposit', v_final_deposit,
    'balance_due', v_final_balance,
    'idempotent_replay', false
  );
end;
$$;

revoke all on function create_web_booking(jsonb, jsonb, text, text, numeric)
  from public, anon, authenticated;
grant execute on function create_web_booking(jsonb, jsonb, text, text, numeric)
  to service_role;

select 'REACHED THE END' as status;
commit;
