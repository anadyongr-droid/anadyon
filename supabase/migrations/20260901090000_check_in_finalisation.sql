-- Phase 2, the counter: finalising a check-in.
--
-- Built to docs/RENTAL-SYSTEM-BLUEPRINT.md §4.2 "Finalisation rules" rule 3,
-- and rule 8, which is the one that has to be enforced here or nowhere.
--
-- Migration 041 is the mirror of this and should be read first; the two are
-- deliberately shaped the same — fixed lock order, idempotency before
-- validation, blockers collected and reported together, one audit event.
-- Where they differ, they differ because check-in asks a different question,
-- and each difference says so.
--
-- ─── The asymmetry worth naming up front ───
--
-- Check-out decides whether a car *may leave*. Almost everything it checks is a
-- reason to refuse: an unsigned agreement, an expired licence, a blocked
-- vehicle. Check-in records what *came back*, and the car is already back.
--
-- So this function is deliberately less willing to refuse. It does not re-check
-- the licence, the agreement, vehicle blocks or statutory cover: those either
-- were true at check-out or were overridden knowingly, and a car sitting in the
-- yard cannot be un-rented by a database refusing to write down its odometer.
-- Refusing here does not prevent anything — it only loses the record of what
-- staff saw, which is the one thing a later dispute needs.
--
-- What it does refuse is a *contradiction*: a reading that says the car
-- travelled backwards, a comparison against a different template or a different
-- vehicle, a rental that was never checked out. Those are not conditions to
-- accept and record; they mean one of the two facts is wrong, and writing both
-- down as if they agreed is worse than stopping.
--
-- ─── Not in this migration ───
--
-- **Adjustments.** §4.2 rule 3 says check-in "creates any new damage and
-- proposed adjustments". `reservation_adjustments` does not exist — migration
-- 040 explains why, and a test asserts its absence. So the measured differences
-- are computed and written to the audit event, where the adjustment will be
-- able to read them, and no money is asserted. §4.2 anticipates exactly this:
-- "check-in can record that a car came back three eighths down on fuel and
-- cannot yet raise a charge for it."
--
-- **Damage capture.** §4.2: "A new check-in damage creates the damage and its
-- `new` observation in the same database transaction." That is a capture-time
-- action, not a finalisation-time one — staff record damage when they see it,
-- on a draft handover, and this function finalises what was recorded. It is its
-- own RPC and its own migration.
--
-- **The grant.** As in 041: the gateway is written and granted to nobody until
-- diagnostic 10c has run. docs/OPEN-QUESTION-RPC-STAFF-IDENTITY.md §13.4.

-- ─────────────────────────────────────────────────────────────────────────────
-- The implementation.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.finalise_check_in_impl(
  p_handover_id  uuid,
  p_actor        uuid,
  p_actor_name   text,
  p_occurred_at  timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  h            public.rental_handovers%rowtype;
  o            public.rental_handovers%rowtype;   -- the completed out handover
  r            public.reservations%rowtype;
  v            public.vehicles%rowtype;
  before_state jsonb;
  -- array_append, never `||`. `text[] || <literal>` lets PostgreSQL resolve the
  -- operator to anyarray||anyarray and try to parse the message as an array
  -- literal, raising `malformed array literal` in place of the refusal. Found
  -- while building 041; the same trap applies here.
  blockers     text[] := '{}';
  missing      integer;
  needs_gauges boolean;
  distance     integer;
  fuel_used    integer;
  have_out     boolean := false;
begin
  if p_actor is null then
    raise exception 'no actor supplied' using errcode = 'AN401';
  end if;

  -- ── Rule 1: the same fixed lock order as check-out ──
  --
  -- Reservation, vehicle, handover. Identical to 041 on purpose: two functions
  -- that lock the same three rows in different orders deadlock, and the pair
  -- can run at once — a check-in for one rental while a check-out starts for
  -- the next on the same car.

  select * into h from public.rental_handovers where id = p_handover_id;
  if not found then
    raise exception 'handover not found' using errcode = 'AN404';
  end if;

  if h.direction <> 'in' then
    raise exception 'handover % is a check-out, not a check-in', p_handover_id
      using errcode = 'AN409';
  end if;

  select * into r from public.reservations where id = h.reservation_id for update;
  select * into v from public.vehicles     where id = h.vehicle_id     for update;
  select * into h from public.rental_handovers where id = p_handover_id for update;

  -- ── Idempotency, before validation ──
  --
  -- Same reason as 041, and it bites harder here: by the second submit the
  -- reservation is 'returned', which the first check below rejects. A retry
  -- must never be refused for the consequence of its own success.
  if h.status = 'completed' then
    return jsonb_build_object(
      'handover_id',        h.id,
      'reservation_id',     h.reservation_id,
      'reservation_status', r.status,
      'completed_at',       h.completed_at,
      'already_completed',  true
    );
  end if;

  if h.status = 'voided' then
    raise exception 'handover % was voided and cannot be completed', p_handover_id
      using errcode = 'AN409';
  end if;

  -- ── The out handover this one is measured against ──
  --
  -- Read under the reservation lock, which is what makes rule 8 enforceable:
  -- "The finalisation function, holding the reservation lock, requires that
  -- where a completed direction = 'out' handover exists for the reservation,
  -- the inbound handover's inspection_template_id equals it."
  select * into o
    from public.rental_handovers
   where reservation_id = h.reservation_id
     and direction = 'out'
     and status = 'completed';
  have_out := found;

  if r.status <> 'active' then
    blockers := array_append(blockers, format('reservation is %s, not active', r.status));
  end if;

  if not have_out then
    -- Not a formality. Without it there is no odometer to compare against, no
    -- fuel level, and no evidence of the car's condition when it left — so a
    -- dispute has one photograph set and nothing to set it beside.
    blockers := array_append(blockers, 'this rental has no completed check-out to compare against');
  else
    -- Rule 8. §4.2: without this "an out/in comparison could silently compare a
    -- car template against a scooter one". Silently is the problem — the photos
    -- line up by view code and nothing looks wrong.
    if o.inspection_template_id <> h.inspection_template_id then
      blockers := array_append(blockers,
        'this check-in uses a different inspection template from the check-out');
    end if;

    -- The physical unit that came back must be the one that went out. If they
    -- differ, one of the two records is wrong and neither can be trusted.
    if o.vehicle_id <> h.vehicle_id then
      blockers := array_append(blockers,
        'a different vehicle was checked out for this reservation');
    end if;

    -- An odometer that went backwards is a contradiction, not a reading. Either
    -- a digit was mistyped or this is not the same car; both need a person.
    if o.odometer_km is not null and h.odometer_km is not null
       and h.odometer_km < o.odometer_km then
      blockers := array_append(blockers, format(
        'the odometer reads %s, lower than the %s recorded at check-out',
        h.odometer_km, o.odometer_km));
    end if;
  end if;

  if h.cleanliness is null then
    blockers := array_append(blockers, 'cleanliness was not recorded');
  elsif h.cleanliness = 'poor' and coalesce(btrim(h.notes), '') = '' then
    -- Poor on return is the value a cleaning charge would rest on, so it needs
    -- to say what was wrong while somebody is still looking at the car.
    blockers := array_append(blockers, 'cleanliness is poor, which requires a note saying why');
  end if;

  -- Category decides which instruments exist, exactly as at check-out. §4.2:
  -- "Do not write invented zero readings to satisfy a form."
  needs_gauges := v.category in ('car', 'motorbike');

  if needs_gauges and h.odometer_km is null then
    blockers := array_append(blockers, 'the odometer reading is required for this vehicle');
  end if;

  if needs_gauges and h.fuel_eighths is null then
    blockers := array_append(blockers, 'the fuel level is required for this vehicle');
  end if;

  -- The same required views as the check-out, which is what makes the two sets
  -- comparable at all.
  select count(*) into missing
  from public.inspection_template_views tv
  where tv.template_id = h.inspection_template_id
    and tv.required
    and not exists (
      select 1 from public.handover_photos p
      where p.handover_id = h.id and p.template_view_id = tv.id
    );

  if missing > 0 then
    blockers := array_append(blockers, format('%s required photograph(s) are missing', missing));
  end if;

  if array_length(blockers, 1) > 0 then
    raise exception 'check-in refused: %', array_to_string(blockers, '; ')
      using errcode = 'AN422';
  end if;

  -- ── The measured differences ──
  --
  -- Computed and recorded, never charged. §4.2: "Phase 2 does not invent
  -- automatic fuel or mileage tariffs. Automation needs operator-approved tank
  -- capacities, included-distance terms, per-unit rates and customer wording
  -- that do not yet exist. The first release records the measured difference."
  --
  -- They go into the audit event rather than into columns, because the moment
  -- `reservation_adjustments` exists it will want them as its
  -- `calculation_snapshot` — and a fact recorded once, in the record of what
  -- happened, cannot drift from a copy kept somewhere else.
  distance  := case when have_out and o.odometer_km is not null and h.odometer_km is not null
                    then h.odometer_km - o.odometer_km end;
  fuel_used := case when have_out and o.fuel_eighths is not null and h.fuel_eighths is not null
                    then o.fuel_eighths - h.fuel_eighths end;

  before_state := to_jsonb(h);

  update public.rental_handovers
     set status              = 'completed',
         completed_at        = now(),
         completed_by        = p_actor,
         staff_name_snapshot = coalesce(p_actor_name, staff_name_snapshot),
         occurred_at         = coalesce(p_occurred_at, occurred_at, now())
   where id = h.id
   returning * into h;

  update public.reservations
     set status = 'returned'
   where id = r.id
   returning * into r;

  -- The fleet record follows the instrument.
  --
  -- Set from the check-in reading rather than raised to it. This is the most
  -- recent observation of the physical odometer and it has photographs attached;
  -- `greatest()` would quietly preserve a larger number typed by hand at some
  -- point during the rental, which is the value more likely to be wrong. A
  -- reading below the check-out figure was already refused above, so the one
  -- direction that must never happen cannot reach here.
  if h.odometer_km is not null then
    update public.vehicles set odometer_km = h.odometer_km where id = v.id;
  end if;

  insert into public.rental_handover_events
    (handover_id, event_type, actor_user_id, before_state, after_state)
  values (
    h.id,
    'completed',
    p_actor,
    before_state,
    to_jsonb(h) || jsonb_build_object(
      'reservation_status', r.status,
      'out_handover_id',    case when have_out then o.id end,
      'distance_km',        distance,
      'fuel_eighths_used',  fuel_used,
      'occurred_before_completion_seconds',
        case
          when h.occurred_at is null then null
          else round(extract(epoch from (h.completed_at - h.occurred_at)))
        end
    )
  );

  return jsonb_build_object(
    'handover_id',        h.id,
    'reservation_id',     r.id,
    'reservation_status', r.status,
    'completed_at',       h.completed_at,
    'distance_km',        distance,
    'fuel_eighths_used',  fuel_used,
    'already_completed',  false
  );
end;
$$;

revoke all on function public.finalise_check_in_impl(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;

grant execute on function public.finalise_check_in_impl(uuid, uuid, text, timestamptz)
  to service_role;

comment on function public.finalise_check_in_impl(uuid, uuid, text, timestamptz) is
  'Completes a check-in and moves the reservation to returned, in one transaction. Records measured distance and fuel difference without asserting a charge. The actor is supplied by the caller; public.finalise_check_in is the layer that verifies it.';

-- ─────────────────────────────────────────────────────────────────────────────
-- The gateway. Written now, granted later — same as 041.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.finalise_check_in(
  p_handover_id uuid,
  p_occurred_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  role   text;
begin
  -- Read defensively: Supabase's auth.uid() raises rather than returning NULL
  -- when the claims setting is present but empty, and a custom setting reverts
  -- to empty rather than to unset once a transaction that set it ends. See
  -- OPEN-QUESTION-RPC-STAFF-IDENTITY.md §13.2.
  begin
    caller := auth.uid();
  exception when others then
    caller := null;
  end;

  if caller is null then
    raise exception 'no caller identity' using errcode = 'AN401';
  end if;

  role := public.handover_actor_role();

  if role is null or role not in ('admin', 'staff') then
    raise exception 'caller is not staff' using errcode = 'AN403';
  end if;

  return public.finalise_check_in_impl(
    p_handover_id,
    caller,
    (select coalesce(u.raw_user_meta_data ->> 'full_name', u.email)
       from auth.users u where u.id = caller),
    p_occurred_at
  );
end;
$$;

-- Granted to nobody, on purpose. OPEN-QUESTION-RPC-STAFF-IDENTITY.md §13.4.
revoke all on function public.finalise_check_in(uuid, timestamptz)
  from public, anon, authenticated, service_role;

comment on function public.finalise_check_in(uuid, timestamptz) is
  'Identity-verifying gateway for finalise_check_in_impl. Not granted to any role until diagnostic 10c confirms PostgREST populates request.jwt.claims for a user-scoped client.';

do $$
begin
  raise notice 'REACHED THE END — check-in finalisation';
end;
$$;
