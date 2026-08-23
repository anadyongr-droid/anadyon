-- Corrects two pieces of migration 033 that were never actually applied.
--
-- 033 was copied to its SQL-editor paste file and then edited further; the
-- paste copy was not refreshed, so the version run against production was the
-- earlier one.  Two changes were therefore missing in production while the
-- repository showed them present:
--
--   1. create_web_booking did not return the new reservation's id, so
--      /api/quote could not attach the acknowledgment email's audit row to it.
--      The email was sent, but unaudited — which is why the reservation screen
--      showed a blank "Customer email" stage for every website booking.
--
--   2. The once-per-reservation unique index did not exclude 'failed' rows, so
--      an acknowledgment or booking confirmation that could be neither sent nor
--      queued could never be retried: the failed row kept the slot forever.
--
-- Safe to run whether or not the corrected 033 was applied: the function is
-- replaced rather than dropped, and the index is dropped by name first because
-- `create ... if not exists` would otherwise silently keep the old definition.
begin;

-- ─── 1. Retryable once-per-reservation guard ────────────────────────────

drop index if exists public.booking_email_deliveries_once_per_kind_uniq;

create unique index booking_email_deliveries_once_per_kind_uniq
  on public.booking_email_deliveries (reservation_id, kind)
  where kind in ('acknowledgment', 'booking_confirmation') and status <> 'failed';

-- ─── 2. create_web_booking returns the reservation id ───────────────────

create or replace function public.create_web_booking(
  p_quote            jsonb,
  p_reservation      jsonb,
  p_promo_code       text default null,
  p_idempotency_key  text default null,
  p_deposit_rate     numeric default 0.30
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_promo             public.promo_codes%rowtype;
  v_discount          numeric := 0;
  v_promo_id          uuid := null;
  v_customer_id       uuid := null;
  v_customer_email    text := nullif(lower(trim(p_quote->>'email')), '');
  v_quote_id          uuid;
  v_reservation_id    uuid;
  v_ref               text := p_quote->>'ref';
  v_existing_ref      text;
  v_existing_reservation uuid;
  v_existing_discount numeric;
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

  if p_idempotency_key is not null and length(trim(p_idempotency_key)) > 0 then
    p_idempotency_key := trim(p_idempotency_key);
    perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 0));

    select q.ref, q.total, q.deposit, q.balance_due, q.discount_amount, q.id,
           (select r.id from public.reservations r where r.quote_id = q.id limit 1)
      into v_existing_ref, v_final_total, v_final_deposit,
           v_final_balance, v_existing_discount, v_quote_id, v_existing_reservation
      from public.quotes q
     where q.idempotency_key = p_idempotency_key
     limit 1;

    if found then
      return jsonb_build_object(
        'ref', v_existing_ref,
        'quote_id', v_quote_id,
        'reservation_id', v_existing_reservation,
        'discount', coalesce(v_existing_discount, 0),
        'total', v_final_total,
        'deposit', v_final_deposit,
        'balance_due', v_final_balance,
        'idempotent_replay', true
      );
    end if;
  else
    p_idempotency_key := null;
  end if;

  -- Validation only.  A website request no longer consumes a use of a limited
  -- code: the hold is taken when staff send the quote confirmation, so codes
  -- can no longer be exhausted by requests that are never paid for.
  if p_promo_code is not null and length(trim(p_promo_code)) > 0 then
    select * into v_promo
      from public.promo_codes
     where active = true
       and lower(code) = lower(trim(p_promo_code))
       for update;

    if found
       and (v_promo.expires_at is null or v_promo.expires_at >= current_date)
       and public.promo_uses_remaining(v_promo.id) > 0
    then
      v_promo_id := v_promo.id;
      v_discount := case
        when v_promo.type = 'percentage' then round((v_pre_discount * v_promo.value / 100)::numeric, 2)
        else round(v_promo.value::numeric, 2)
      end;
      v_discount := least(greatest(v_discount, 0), v_pre_discount);
    end if;
  end if;

  v_final_total := round(greatest(v_pre_discount - v_discount, 0), 2);
  v_final_deposit := round(v_final_total * p_deposit_rate, 2);
  v_final_balance := v_final_total - v_final_deposit;

  if v_customer_email is not null then
    insert into public.customers as c (
      title, first_name, last_name, full_name, name, email, phone,
      address, postal_code, city, country, last_interaction_at
    ) values (
      nullif(trim(p_quote->>'title'), ''),
      nullif(trim(p_quote->>'first_name'), ''),
      nullif(trim(p_quote->>'last_name'), ''),
      nullif(concat_ws(' ', nullif(trim(p_quote->>'first_name'), ''), nullif(trim(p_quote->>'last_name'), '')), ''),
      nullif(concat_ws(' ', nullif(trim(p_quote->>'first_name'), ''), nullif(trim(p_quote->>'last_name'), '')), ''),
      v_customer_email,
      nullif(trim(p_quote->>'mobile_tel'), ''),
      nullif(trim(p_quote->>'address'), ''),
      nullif(trim(p_quote->>'postal_code'), ''),
      nullif(trim(p_quote->>'city'), ''),
      nullif(trim(p_quote->>'country'), ''),
      now()
    )
    on conflict ((lower(email))) where email is not null do update
      set first_name = coalesce(c.first_name, excluded.first_name),
          last_name = coalesce(c.last_name, excluded.last_name),
          full_name = coalesce(c.full_name, excluded.full_name),
          phone = coalesce(c.phone, excluded.phone),
          last_interaction_at = now(),
          updated_at = now()
    returning id into v_customer_id;
  end if;

  p_quote := (p_quote - array['id', 'created_at']) || jsonb_build_object(
    'idempotency_key', p_idempotency_key,
    'total', v_final_total,
    'deposit', v_final_deposit,
    'balance_due', v_final_balance,
    'discount_amount', v_discount
  );
  if v_customer_id is not null then
    p_quote := p_quote || jsonb_build_object('customer_id', v_customer_id);
  end if;

  p_reservation := (p_reservation - array['id', 'created_at', 'updated_at']) || jsonb_build_object(
    'total', v_final_total,
    'deposit', v_final_deposit,
    'balance_due', v_final_balance,
    'discount_amount', v_discount,
    'promo_code_id', v_promo_id,
    'discount_reason', case when v_promo_id is not null then 'Promo: ' || trim(p_promo_code) else null end
  );

  select string_agg(quote_ident(c.column_name), ', ' order by c.ordinal_position)
    into v_quote_cols
    from information_schema.columns c
   where c.table_schema = 'public' and c.table_name = 'quotes' and p_quote ? c.column_name;

  execute format(
    'insert into public.quotes (%1$s) select %1$s from jsonb_populate_record(null::public.quotes, $1) returning id',
    v_quote_cols
  ) into v_quote_id using p_quote;

  p_reservation := p_reservation || jsonb_build_object('quote_id', v_quote_id);
  if v_customer_id is not null then
    p_reservation := p_reservation || jsonb_build_object('customer_id', v_customer_id);
  end if;

  select string_agg(quote_ident(c.column_name), ', ' order by c.ordinal_position)
    into v_reservation_cols
    from information_schema.columns c
   where c.table_schema = 'public' and c.table_name = 'reservations' and p_reservation ? c.column_name;

  -- The reservation id is returned so the route can attach the acknowledgment
  -- email's audit row to it without a second lookup.
  execute format(
    'insert into public.reservations (%1$s) select %1$s from jsonb_populate_record(null::public.reservations, $1) returning id',
    v_reservation_cols
  ) into v_reservation_id using p_reservation;

  return jsonb_build_object(
    'ref', v_ref, 'quote_id', v_quote_id, 'reservation_id', v_reservation_id,
    'customer_id', v_customer_id,
    'promo_id', v_promo_id, 'discount', v_discount, 'total', v_final_total,
    'deposit', v_final_deposit, 'balance_due', v_final_balance,
    'idempotent_replay', false
  );
end;
$$;

revoke all on function public.create_web_booking(jsonb, jsonb, text, text, numeric)
  from public, anon, authenticated;
grant execute on function public.create_web_booking(jsonb, jsonb, text, text, numeric)
  to service_role;

notify pgrst, 'reload schema';
commit;

select 'REACHED THE END — reservation id returned, retryable email guard' as result;
