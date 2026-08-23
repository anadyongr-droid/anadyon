-- Three related integrity changes that ship together.
--
-- 1. promo_redemptions — a real ledger for limited promo codes.  Availability
--    was counted by incrementing promo_codes.used_count the moment a website
--    request arrived, so a limited code could be exhausted by people who never
--    paid, and a cancelled booking never gave its use back.  A use is now held
--    when the quote confirmation goes out, redeemed when payment is verified,
--    and released when the hold expires or the booking is cancelled.
--
-- 2. Combined child-seat limit on quotes and reservations.  Baby and child
--    seats share the same back seat; the limit is on the two together.
--
-- 3. booking_email_deliveries.kind gains 'acknowledgment' and
--    'booking_confirmation', so all three customer workflow emails pass
--    through the same audited delivery path.
begin;

-- ─── 1. Promo redemption ledger ──────────────────────────────────────────

create table if not exists public.promo_redemptions (
  id uuid primary key default gen_random_uuid(),
  promo_code_id uuid not null references public.promo_codes(id) on delete cascade,
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  quote_id uuid references public.quotes(id) on delete set null,
  state text not null default 'held' check (state in ('held', 'redeemed', 'released')),
  -- What the deduction was worth when the hold was taken, for reconciliation.
  amount numeric(10,2),
  -- A held use stops counting against the limit once this passes.  Normally
  -- the payment deadline named in the quote confirmation.
  expires_at timestamptz,
  released_reason text,
  held_at timestamptz not null default now(),
  redeemed_at timestamptz,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One live claim per reservation.  A resent quote confirmation must extend the
-- existing hold rather than consume a second use of the code.
create unique index if not exists promo_redemptions_live_reservation_uniq
  on public.promo_redemptions (reservation_id)
  where state in ('held', 'redeemed');

create index if not exists promo_redemptions_promo_state_idx
  on public.promo_redemptions (promo_code_id, state, expires_at);

alter table public.promo_redemptions enable row level security;
revoke all on table public.promo_redemptions from public, anon, authenticated;
grant select, insert, update, delete on table public.promo_redemptions to service_role;

/**
 * Uses still available on a code.
 *
 * Truth is the ledger, not promo_codes.used_count: a held-but-expired row has
 * given its use back and must not keep the code exhausted.  An unlimited code
 * reports a large number rather than null so callers can compare numerically.
 */
create or replace function public.promo_uses_remaining(p_promo_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_max integer;
  v_taken integer;
begin
  select max_uses into v_max from public.promo_codes where id = p_promo_id;
  if not found then return 0; end if;
  if v_max is null then return 2147483647; end if;

  select count(*) into v_taken
    from public.promo_redemptions
   where promo_code_id = p_promo_id
     and (
       state = 'redeemed'
       or (state = 'held' and (expires_at is null or expires_at > now()))
     );

  return greatest(v_max - v_taken, 0);
end;
$$;

/**
 * Takes or extends a hold for one reservation, atomically.
 *
 * Locks the promo row first so two staff members confirming the last use of a
 * code at the same moment cannot both succeed.  Re-holding an existing live
 * claim only moves its deadline — it never consumes a second use.
 */
create or replace function public.promo_hold(
  p_promo_id uuid,
  p_reservation_id uuid,
  p_expires_at timestamptz default null,
  p_amount numeric default null,
  p_quote_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_promo public.promo_codes%rowtype;
  v_existing public.promo_redemptions%rowtype;
  v_id uuid;
begin
  if p_promo_id is null or p_reservation_id is null then
    return jsonb_build_object('ok', false, 'reason', 'missing_arguments');
  end if;

  select * into v_promo from public.promo_codes where id = p_promo_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown_code');
  end if;
  if not coalesce(v_promo.active, false) then
    return jsonb_build_object('ok', false, 'reason', 'inactive');
  end if;
  if v_promo.expires_at is not null and v_promo.expires_at < current_date then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  select * into v_existing
    from public.promo_redemptions
   where reservation_id = p_reservation_id
     and state in ('held', 'redeemed')
   for update;

  if found then
    if v_existing.promo_code_id <> p_promo_id then
      return jsonb_build_object('ok', false, 'reason', 'other_code_held');
    end if;
    if v_existing.state = 'redeemed' then
      return jsonb_build_object('ok', true, 'state', 'redeemed', 'id', v_existing.id);
    end if;
    update public.promo_redemptions
       set expires_at = coalesce(p_expires_at, expires_at),
           amount = coalesce(p_amount, amount),
           quote_id = coalesce(p_quote_id, quote_id),
           updated_at = now()
     where id = v_existing.id;
    return jsonb_build_object('ok', true, 'state', 'held', 'id', v_existing.id, 'extended', true);
  end if;

  if public.promo_uses_remaining(p_promo_id) <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'exhausted');
  end if;

  insert into public.promo_redemptions (
    promo_code_id, reservation_id, quote_id, state, amount, expires_at
  ) values (
    p_promo_id, p_reservation_id, p_quote_id, 'held', p_amount, p_expires_at
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'state', 'held', 'id', v_id, 'extended', false);
end;
$$;

/** Marks the reservation's held use as actually taken.  Replay-safe. */
create or replace function public.promo_redeem(
  p_reservation_id uuid,
  p_amount numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.promo_redemptions%rowtype;
begin
  if p_reservation_id is null then
    return jsonb_build_object('ok', false, 'reason', 'missing_arguments');
  end if;

  select * into v_row
    from public.promo_redemptions
   where reservation_id = p_reservation_id
     and state in ('held', 'redeemed')
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_hold');
  end if;
  if v_row.state = 'redeemed' then
    return jsonb_build_object('ok', true, 'state', 'redeemed', 'already', true);
  end if;

  -- A hold that lapsed before payment is still honoured here: the customer paid
  -- against a price that included the discount, and taking it back after the
  -- fact would change what they owe.
  update public.promo_redemptions
     set state = 'redeemed',
         redeemed_at = now(),
         amount = coalesce(p_amount, amount),
         updated_at = now()
   where id = v_row.id;

  update public.promo_codes
     set used_count = coalesce(used_count, 0) + 1
   where id = v_row.promo_code_id;

  return jsonb_build_object('ok', true, 'state', 'redeemed', 'already', false);
end;
$$;

/** Gives a held use back.  Redeemed uses are never released by this path. */
create or replace function public.promo_release(
  p_reservation_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.promo_redemptions%rowtype;
begin
  if p_reservation_id is null then
    return jsonb_build_object('ok', false, 'reason', 'missing_arguments');
  end if;

  select * into v_row
    from public.promo_redemptions
   where reservation_id = p_reservation_id
     and state = 'held'
   for update;

  if not found then
    return jsonb_build_object('ok', true, 'released', 0);
  end if;

  update public.promo_redemptions
     set state = 'released',
         released_at = now(),
         released_reason = left(p_reason, 200),
         updated_at = now()
   where id = v_row.id;

  return jsonb_build_object('ok', true, 'released', 1);
end;
$$;

/** Sweeps lapsed holds so the ledger matches what promo_uses_remaining says. */
create or replace function public.promo_release_expired()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with lapsed as (
    update public.promo_redemptions
       set state = 'released',
           released_at = now(),
           released_reason = 'hold expired',
           updated_at = now()
     where state = 'held'
       and expires_at is not null
       and expires_at <= now()
    returning 1
  )
  select count(*) into v_count from lapsed;
  return coalesce(v_count, 0);
end;
$$;

revoke all on function public.promo_uses_remaining(uuid) from public, anon, authenticated;
revoke all on function public.promo_hold(uuid, uuid, timestamptz, numeric, uuid) from public, anon, authenticated;
revoke all on function public.promo_redeem(uuid, numeric) from public, anon, authenticated;
revoke all on function public.promo_release(uuid, text) from public, anon, authenticated;
revoke all on function public.promo_release_expired() from public, anon, authenticated;
grant execute on function public.promo_uses_remaining(uuid) to service_role;
grant execute on function public.promo_hold(uuid, uuid, timestamptz, numeric, uuid) to service_role;
grant execute on function public.promo_redeem(uuid, numeric) to service_role;
grant execute on function public.promo_release(uuid, text) to service_role;
grant execute on function public.promo_release_expired() to service_role;

-- ─── 2. Combined child-seat limit ────────────────────────────────────────

-- Refuse rather than corrupt.  Adding these constraints to a table that already
-- holds a breaching row would fail halfway through with a bare Postgres error;
-- this says exactly what is in the way.  Run the preflight query in
-- docs/HANDOFF-PROMO-SEATS-EMAIL.md before applying.
do $$
declare
  v_quotes integer;
  v_reservations integer;
begin
  select count(*) into v_quotes from public.quotes
   where coalesce(baby_seat, 0) < 0 or coalesce(child_seat, 0) < 0
      or coalesce(baby_seat, 0) + coalesce(child_seat, 0) > 3;
  select count(*) into v_reservations from public.reservations
   where coalesce(baby_seat, 0) < 0 or coalesce(child_seat, 0) < 0
      or coalesce(baby_seat, 0) + coalesce(child_seat, 0) > 3;

  if v_quotes > 0 or v_reservations > 0 then
    raise exception
      'Cannot add the child-seat limit: % quote(s) and % reservation(s) already exceed it. Review and correct those rows first; do not reduce a customer''s quantity without telling them.',
      v_quotes, v_reservations
      using errcode = '23514';
  end if;
end;
$$;

alter table public.quotes
  drop constraint if exists quotes_child_seats_total_check;
alter table public.quotes
  add constraint quotes_child_seats_total_check
  check (
    coalesce(baby_seat, 0) >= 0
    and coalesce(child_seat, 0) >= 0
    and coalesce(baby_seat, 0) + coalesce(child_seat, 0) <= 3
  );

alter table public.reservations
  drop constraint if exists reservations_child_seats_total_check;
alter table public.reservations
  add constraint reservations_child_seats_total_check
  check (
    coalesce(baby_seat, 0) >= 0
    and coalesce(child_seat, 0) >= 0
    and coalesce(baby_seat, 0) + coalesce(child_seat, 0) <= 3
  );

-- ─── 3. All three customer workflow emails are audited ───────────────────

alter table public.booking_email_deliveries
  drop constraint if exists booking_email_deliveries_kind_check;
alter table public.booking_email_deliveries
  add constraint booking_email_deliveries_kind_check
  check (kind in ('acknowledgment', 'quote_confirmation', 'booking_confirmation'));

-- The acknowledgment and the formal booking confirmation are sent exactly once
-- per reservation, so the uniqueness is the idempotency guard.  A quote
-- confirmation is deliberately excluded: staff may resend it, and its history
-- is what the reservation screen shows.
--
-- 'failed' rows are excluded so a message that could be neither sent nor queued
-- can be retried.  The failed attempt stays in the table as the audit record —
-- deleting it would be the other way to allow the retry, and would lose the
-- evidence that a confirmation once went missing.
create unique index if not exists booking_email_deliveries_once_per_kind_uniq
  on public.booking_email_deliveries (reservation_id, kind)
  where kind in ('acknowledgment', 'booking_confirmation') and status <> 'failed';

-- ─── 4. create_web_booking no longer consumes a promo use ────────────────

drop function if exists public.create_web_booking(jsonb, jsonb, text, text, numeric);

create function public.create_web_booking(
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

select 'REACHED THE END — promo ledger, child-seat limit, email kinds' as result;
