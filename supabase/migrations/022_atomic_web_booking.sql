-- Makes a website booking one transaction, and gives the route a way to undo a
-- promo redemption when it cannot.
--
-- The booking write was three separate transactions: redeem_promo incremented
-- used_count, then the quote and the reservation were inserted with
-- Promise.all and both results discarded. The Supabase client returns
-- { data, error } rather than throwing, so a failed insert looked exactly like
-- a successful one — the route carried on, emailed the customer a reference,
-- and answered 200 for a booking nobody had stored.
--
-- Two functions, because they are adopted at different speeds:
--
--   release_promo       used immediately by the route as compensation.
--   create_web_booking  the real fix — one transaction, adopted when the
--                       route is switched over and tested.
--
-- Both are SECURITY DEFINER and revoked from every role except the service
-- role, matching migration 014. They must never be reachable with the anon key
-- that ships in the browser bundle.

-- ── release_promo ─────────────────────────────────────────────────────────
-- Hands back a use that redeem_promo consumed for a booking that then failed.
-- Clamped at zero: a double release must not push the count negative and
-- silently grant an extra use.
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

-- ── create_web_booking ────────────────────────────────────────────────────
-- The quote and its reservation in one transaction. Either both rows exist or
-- neither does, and the promo is redeemed inside the same transaction, so a
-- failure anywhere rolls the redemption back without compensation.
--
-- Takes the two rows as jsonb rather than forty arguments: the columns change
-- with the booking form, and a signature that changes with them is a migration
-- every time somebody adds a field.
--
-- p_idempotency_key is how a retry stops being a second booking. The unique
-- index below means a repeated submission returns the original reference
-- instead of creating a duplicate — which matters because the route now
-- correctly reports failure, and a customer who is told to try again will.
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
  -- A retry of a submission that already succeeded returns what it produced
  -- the first time, rather than a second booking for the same customer.
  if p_idempotency_key is not null then
    select ref into v_existing
      from quotes
     where idempotency_key = p_idempotency_key
     limit 1;
    if found then
      return jsonb_build_object('ref', v_existing, 'idempotent_replay', true);
    end if;
  end if;

  -- Locked and redeemed inside this transaction, so a rollback below returns
  -- the use automatically.
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
    -- An invalid or exhausted code is not an error: the booking proceeds at
    -- full price, which is what the route already did.
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

-- Supports the idempotency lookup above. Partial, because almost every
-- historical row has no key and a unique index over nulls would be pointless.
alter table quotes add column if not exists idempotency_key text;

create unique index if not exists quotes_idempotency_key_uniq
  on quotes (idempotency_key)
  where idempotency_key is not null;
