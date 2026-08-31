-- Phase 2, the counter: finalising a check-out.
--
-- Built to docs/RENTAL-SYSTEM-BLUEPRINT.md §4.2 "Finalisation rules", rules 1
-- and 2. Rule 3 (check-in) and rule 4 (correction and voiding) are deliberately
-- not here — see the note at the end of this header.
--
-- Migration 040 built the counter's tables. Nothing wrote to them, because the
-- rule that decides whether a car may leave the yard is a transaction, not a
-- form. This is that transaction.
--
-- ─── The two layers, and which one this migration switches on ───
--
-- §4.2 rule 6 specifies a thin gateway in `public` that establishes *who is
-- calling*, and an implementation that does the work. Both are here. Only one
-- is reachable today, and that is deliberate:
--
--   `finalise_check_out_impl`  granted to service_role. The actor is passed in
--                              as an argument — the same interim position
--                              migrations 038 and 040 already record for
--                              created_by, because every .rpc() call site in
--                              this codebase uses supabaseAdmin.
--
--   `finalise_check_out`       the gateway. Resolves auth.uid(), verifies the
--                              caller against the database, then calls the
--                              implementation. **Granted to nobody.**
--
-- The gateway is granted nothing because docs/OPEN-QUESTION-RPC-STAFF-IDENTITY.md
-- §13.4 says not to: the Postgres half of the mechanism is proved
-- (lib/rpcStaffIdentity.test.ts), the PostgREST half needs diagnostic 10c
-- against the live project, and until that is run no gateway gets EXECUTE in
-- production. A follow-up migration adds one line.
--
-- **State the cost plainly.** Until then the actor on a check-out is what the
-- application says it is, not what the database verified. That is exactly
-- today's position for every other privileged action here, so it is not a
-- regression — but it is not the design either, and writing the gateway now
-- means the upgrade is a grant rather than a rewrite.
--
-- ─── Not in this migration ───
--
-- **Check-in (rule 3).** Symmetric, and it needs this to exist first: its
-- odometer validation compares against the completed out handover. A separate
-- migration, so each is small enough to be read.
--
-- **Correction and voiding (rule 4).** Audited actions in their own right, with
-- their own event types already in `rental_handover_events`.
--
-- **Adjustments.** `reservation_adjustments` does not exist. Migration 040
-- explains why, and a test asserts its absence.

-- ─────────────────────────────────────────────────────────────────────────────
-- Who is calling — the one place that reads auth.users.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- §2 of the open question requires membership verified "against database-held
-- staff membership — never a JWT claim". A claim is minted at sign-in and stays
-- valid until the token expires, so a staff member whose access was withdrawn
-- keeps a claim saying otherwise for the life of their session. Availability is
-- not authority.
--
-- There is no staff table in this schema, and inventing one would need a sync
-- job that can drift. `auth.users.raw_app_meta_data` is the authoritative
-- record, it is server-only — the account holder cannot edit it — and a
-- withdrawal takes effect on the next call. So that is the source, read in
-- exactly one function so a later change has one site.
--
-- **Unverified, and cheap to check:** that the function owner can select from
-- auth.users on the live project. It should — functions created through the SQL
-- Editor are owned by `postgres` — but no migration here has read that table
-- before. Worth adding to diagnostic 10c while it is being run; the failure is
-- a clean "permission denied for table users", not a silent wrong answer.

create or replace function public.handover_actor_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select u.raw_app_meta_data ->> 'role'
  from auth.users u
  where u.id = auth.uid()
$$;

revoke all on function public.handover_actor_role() from public, anon;

comment on function public.handover_actor_role() is
  'The calling user''s role, read from auth.users rather than from the JWT, so a withdrawn role takes effect immediately. NULL when there is no caller (service role) or no such user.';

-- ─────────────────────────────────────────────────────────────────────────────
-- The implementation.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.finalise_check_out_impl(
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
  r            public.reservations%rowtype;
  v            public.vehicles%rowtype;
  before_state jsonb;
  -- Appended with array_append, never with `||`. `text[] || <literal>` lets
  -- PostgreSQL resolve the operator to anyarray||anyarray and try to parse the
  -- message as an array literal, which raises `malformed array literal` in
  -- place of the refusal it was about to report. Found by the test that damages
  -- three preconditions at once; the single-reason cases happened to pick the
  -- other overload and passed.
  blockers     text[] := '{}';
  missing      integer;
  licence      date;
  needs_gauges boolean;
begin
  if p_actor is null then
    raise exception 'no actor supplied' using errcode = 'AN401';
  end if;

  -- ── Rule 1: lock, in a fixed order, and call nothing external while held ──
  --
  -- Reservation, then vehicle, then handover. A fixed order is what stops two
  -- concurrent finalisations for the same reservation deadlocking rather than
  -- one simply waiting. Nothing below touches Storage, mail or a payment
  -- provider; §4.2 rule 1 forbids it and the reason is that a lock held across
  -- a network call is a lock held for as long as somebody else's outage lasts.

  select * into h from public.rental_handovers where id = p_handover_id;
  if not found then
    raise exception 'handover not found' using errcode = 'AN404';
  end if;

  if h.direction <> 'out' then
    raise exception 'handover % is a check-in, not a check-out', p_handover_id
      using errcode = 'AN409';
  end if;

  select * into r from public.reservations where id = h.reservation_id for update;
  select * into v from public.vehicles     where id = h.vehicle_id     for update;

  -- Re-read the handover under its own lock. The row read above was taken
  -- before the reservation lock, so a concurrent finalisation could have
  -- completed it in between; this is the read that decides.
  select * into h from public.rental_handovers where id = p_handover_id for update;

  -- ── Idempotency, before validation ──
  --
  -- §4.2: "client_operation_id makes a tablet retry return the same
  -- draft/completed handover rather than create another." The retry has to
  -- succeed quietly here too — a second tap that answered "the reservation is
  -- already active" would look like a failure for a rental that went perfectly.
  --
  -- Deliberately before the checks below: a completed handover may well fail
  -- them by now (the reservation is 'active', not 'confirmed'), and re-running
  -- validation against a finished rental would turn a duplicate submit into a
  -- spurious error.
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

  -- ── Rule 2: every precondition, collected rather than raised one at a time ──
  --
  -- Staff are standing next to a car with a customer waiting. Three round trips
  -- to discover three problems is three conversations; one list is one. The
  -- checks are therefore accumulated and raised together.

  if r.status <> 'confirmed' then
    blockers := array_append(blockers, format('reservation is %s, not confirmed', r.status));
  end if;

  if r.vehicle_id is null then
    blockers := array_append(blockers, 'no vehicle is assigned to the reservation');
  elsif r.vehicle_id <> h.vehicle_id then
    blockers := array_append(blockers, 'the handover records a different vehicle from the reservation');
  end if;

  if v.status <> 'available' then
    blockers := array_append(blockers, format('vehicle is marked %s', v.status));
  end if;

  -- The block predicate is copied from `find_available_eligible_vehicle`, not
  -- re-derived, and the first draft of this file got it wrong in exactly the way
  -- migration 20260829090000 exists to prevent: it treated the estimated return
  -- as an end date. It is not one. That migration renamed `ends_on` to
  -- `expected_return` precisely because "the mechanic says the 15th, does not
  -- deliver, the block lapses on its own, and a car still in pieces becomes
  -- bookable with nobody asked."
  --
  -- **A block is open while released_at is null, and nothing but a person ends
  -- it.** It bites if it starts at any point before the rental ends, which is
  -- the allocator's question too: "has this vehicle an open block starting on or
  -- before the requested return?"
  if exists (
    select 1 from public.vehicle_blocks b
    where b.vehicle_id = h.vehicle_id
      and b.released_at is null
      and b.starts_on <= r.return_date
  ) then
    blockers := array_append(blockers, 'the vehicle has an open block covering this rental');
  end if;

  -- Statutory cover, mirroring `find_available_eligible_vehicle` and
  -- `rentalBar()` in lib/fleetStatus.ts: exactly the two fields marked
  -- blocksRental there, and a null date means "not recorded", not "expired".
  --
  -- **Deliberately not stricter than the allocator, and worth revisiting.** Both
  -- test the pickup date, so a KTEO expiring mid-rental stops neither. Tightening
  -- it here alone would make a car the system allocated impossible to release,
  -- which is a support call rather than a fix; tightening both is a change to
  -- the allocator and belongs in its own migration with its own regression test.
  if v.kteo_expiry is not null and v.kteo_expiry < r.pickup_date then
    blockers := array_append(blockers, format('the KTEO expired on %s', v.kteo_expiry));
  end if;

  if v.insurance_expiry is not null and v.insurance_expiry < r.pickup_date then
    blockers := array_append(blockers, format('the insurance expired on %s', v.insurance_expiry));
  end if;

  -- Licence expiry is on the customer record. An expired licence is the one
  -- refusal here that is not the operator's discretion.
  if r.customer_id is null then
    blockers := array_append(blockers, 'the reservation has no customer record to check a licence against');
  else
    select c.driving_licence_expiry into licence
    from public.customers c where c.id = r.customer_id;

    if licence is null then
      blockers := array_append(blockers, 'no driving licence expiry is recorded for the customer');
    elsif licence < r.pickup_date then
      blockers := array_append(blockers, format('the driving licence expired on %s', licence));
    end if;
  end if;

  if r.agreement_signed_at is null then
    blockers := array_append(blockers, 'the rental agreement is not recorded as signed');
  end if;

  if h.cleanliness is null then
    blockers := array_append(blockers, 'cleanliness was not recorded');
  elsif h.cleanliness = 'poor' and coalesce(btrim(h.notes), '') = '' then
    -- "Poor" is the value a later dispute turns on, and on its own it says
    -- nothing about what was wrong.
    blockers := array_append(blockers, 'cleanliness is poor, which requires a note saying why');
  end if;

  -- §4.2: "the finalisation service decides required fields from the assigned
  -- vehicle category." A bicycle has neither instrument, and "do not write
  -- invented zero readings to satisfy a form."
  --
  -- Category, not per-vehicle: there is no column saying this particular
  -- scooter lacks a gauge, and inventing one to cover a hypothetical is how
  -- schema debt starts. If a real unit turns up without an instrument, that
  -- column is the fix, and it is a small one.
  needs_gauges := v.category in ('car', 'motorbike');

  if needs_gauges and h.odometer_km is null then
    blockers := array_append(blockers, 'the odometer reading is required for this vehicle');
  end if;

  if needs_gauges and h.fuel_eighths is null then
    blockers := array_append(blockers, 'the fuel level is required for this vehicle');
  end if;

  -- Every required view of the template must have at least one photograph.
  -- Counted rather than listed, because the message is for somebody holding a
  -- tablet; the UI already knows which views are outstanding.
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
    raise exception 'check-out refused: %', array_to_string(blockers, '; ')
      using errcode = 'AN422';
  end if;

  -- ── Completion, atomically with the reservation's transition ──

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
     set status = 'active'
   where id = r.id
   returning * into r;

  -- §4.2: "If staff record an earlier real-world occurrence after a
  -- connectivity delay, the difference and reason are written to the event log;
  -- device time alone is not legal evidence." The difference is recorded on
  -- every completion, so an unexplained gap is visible rather than inferred.
  insert into public.rental_handover_events
    (handover_id, event_type, actor_user_id, before_state, after_state)
  values (
    h.id,
    'completed',
    p_actor,
    before_state,
    to_jsonb(h) || jsonb_build_object(
      'reservation_status', r.status,
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
    'already_completed',  false
  );
end;
$$;

revoke all on function public.finalise_check_out_impl(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;

-- The interim path, and the only one switched on. See the header.
grant execute on function public.finalise_check_out_impl(uuid, uuid, text, timestamptz)
  to service_role;

comment on function public.finalise_check_out_impl(uuid, uuid, text, timestamptz) is
  'Completes a check-out and moves the reservation to active, in one transaction. The actor is supplied by the caller; public.finalise_check_out is the layer that verifies it.';

-- ─────────────────────────────────────────────────────────────────────────────
-- The gateway. Written now, granted later.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.finalise_check_out(
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
  -- Read defensively. Supabase's auth.uid() applies ::uuid to a JSON extraction,
  -- so a claims setting that is present but empty raises `invalid input syntax
  -- for type json` rather than returning NULL — and a custom setting reverts to
  -- empty, not to unset, once a transaction that set it ends, which is reachable
  -- on a pooled connection. A gateway that means to say "not staff" must not say
  -- "internal error" instead. See OPEN-QUESTION-RPC-STAFF-IDENTITY.md §13.2.
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

  return public.finalise_check_out_impl(
    p_handover_id,
    caller,
    (select coalesce(u.raw_user_meta_data ->> 'full_name', u.email)
       from auth.users u where u.id = caller),
    p_occurred_at
  );
end;
$$;

-- **Granted to nobody, on purpose.** OPEN-QUESTION-RPC-STAFF-IDENTITY.md §13.4:
-- no gateway gets EXECUTE in production until diagnostic 10c has run. Adding
-- the grant is a one-line follow-up migration, and doing it here would be
-- writing a rule and breaking it in the same file.
revoke all on function public.finalise_check_out(uuid, timestamptz)
  from public, anon, authenticated, service_role;

comment on function public.finalise_check_out(uuid, timestamptz) is
  'Identity-verifying gateway for finalise_check_out_impl. Not granted to any role until diagnostic 10c confirms PostgREST populates request.jwt.claims for a user-scoped client.';

do $$
begin
  raise notice 'REACHED THE END — check-out finalisation';
end;
$$;
