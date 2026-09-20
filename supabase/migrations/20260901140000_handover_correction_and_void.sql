-- Phase 2, the counter: correcting and voiding a completed handover.
--
-- Built to docs/RENTAL-SYSTEM-BLUEPRINT.md §4.2 "Finalisation rules" rule 4:
--
--   "A completed handover is not normally editable or deletable. A correction
--    requires a reason and writes before/after state to rental_handover_events
--    in the same transaction. Voiding is the same kind of audited action, not
--    a DELETE."
--
-- Migrations 041 and 042 wrote the two finalisations. This is what happens when
-- one of them recorded the wrong thing — which is not an edge case. Staff type
-- an odometer standing in the sun next to a customer who wants to leave.
--
-- ─── A constraint that shapes the void, found before it could bite ───
--
-- `rental_handovers_completed_together` asserts
-- `(status = 'completed') = (completed_at is not null)`. So a completed
-- handover **cannot** be voided by setting status alone: the void must clear
-- `completed_at` in the same statement or the row is rejected.
--
-- The obvious one-line implementation of this rule does not, and would have
-- failed in production rather than in review. It was found while writing the
-- check-in tests and is pinned by one there; this migration is written to it.
--
-- ─── What voiding does to the reservation, and why ───
--
-- §4.2 does not say, and the answer is not "nothing". Finalisation moves the
-- reservation: check-out to `active`, check-in to `returned`. If a void left
-- that behind, the replacement handover could never be finalised — check-out
-- requires a `confirmed` reservation and check-in an `active` one, so a
-- corrected check-out would be refused for the state its own voided predecessor
-- created. The correction path would exist and not work.
--
-- So a void steps the reservation back, **and only when it is still in exactly
-- the status this handover put it in**:
--
--   voided check-out, reservation `active`   → `confirmed`
--   voided check-in,  reservation `returned` → `active`
--
-- Any other status is left alone and the fact is written to the event. That
-- guard matters: a reservation moved to `cancelled` by a person afterwards must
-- not be dragged back by a void, and stepping back from a status this handover
-- did not set would be inventing history rather than undoing it.
--
-- **The consequence to accept, stated plainly.** For the moments between the
-- void and the replacement check-out, a car that is physically with a customer
-- reads as `confirmed` — not yet collected. That is accurate in record terms
-- (there is no valid check-out) and it is the state that makes the replacement
-- finalisable. The alternative — a rental stuck `active` with no live check-out
-- — is both wrong and unrecoverable.
--
-- ─── What a correction may change, and what it may not ───
--
-- Only what staff observed and could mistype: the odometer, the fuel level,
-- cleanliness, the note, and when it happened. Never the reservation, the
-- vehicle, the direction, the template or the client operation id. Those are
-- not observations; changing one turns this handover into a record of a
-- different event, and the honest way to do that is to void it and make a new
-- one.
--
-- An unrecognised key is **refused by name** rather than ignored. Silently
-- dropping `vehicle_id` from a correction payload would let a caller believe
-- they had changed it.
--
-- ─── Not in this migration ───
--
-- **The grant.** As in 041 and 042: the gateways are written and granted to
-- nobody until diagnostic 10c has run. OPEN-QUESTION-RPC-STAFF-IDENTITY.md §13.4.

-- ─────────────────────────────────────────────────────────────────────────────
-- Shared validation, so a correction cannot produce a state finalisation would
-- have refused.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- A correction that could leave an in handover reading below its out handover
-- would be a way round the rule rather than a fix to a typo. This re-checks the
-- invariants the two finalisations enforce, against the corrected row.

create or replace function public.handover_state_blockers(p_handover_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  h        public.rental_handovers%rowtype;
  other    public.rental_handovers%rowtype;
  v        public.vehicles%rowtype;
  blockers text[] := '{}';
begin
  select * into h from public.rental_handovers where id = p_handover_id;
  if not found then
    return array['handover not found'];
  end if;

  select * into v from public.vehicles where id = h.vehicle_id;

  if h.cleanliness is null then
    blockers := array_append(blockers, 'cleanliness was not recorded');
  elsif h.cleanliness = 'poor' and coalesce(btrim(h.notes), '') = '' then
    blockers := array_append(blockers, 'cleanliness is poor, which requires a note saying why');
  end if;

  if v.category in ('car', 'motorbike') then
    if h.odometer_km is null then
      blockers := array_append(blockers, 'the odometer reading is required for this vehicle');
    end if;
    if h.fuel_eighths is null then
      blockers := array_append(blockers, 'the fuel level is required for this vehicle');
    end if;
  end if;

  -- The out/in odometer relationship, checked from whichever side is being
  -- corrected. Raising an out reading above a recorded in reading is the same
  -- contradiction as lowering the in reading below the out one, and only one of
  -- those was reachable through check-in alone.
  if h.direction = 'in' then
    select * into other from public.rental_handovers
     where reservation_id = h.reservation_id and direction = 'out' and status = 'completed';
    if found and other.odometer_km is not null and h.odometer_km is not null
       and h.odometer_km < other.odometer_km then
      blockers := array_append(blockers, format(
        'the odometer would read %s, lower than the %s recorded at check-out',
        h.odometer_km, other.odometer_km));
    end if;
  else
    select * into other from public.rental_handovers
     where reservation_id = h.reservation_id and direction = 'in' and status = 'completed';
    if found and other.odometer_km is not null and h.odometer_km is not null
       and h.odometer_km > other.odometer_km then
      blockers := array_append(blockers, format(
        'the odometer would read %s, higher than the %s recorded at check-in',
        h.odometer_km, other.odometer_km));
    end if;
  end if;

  return blockers;
end;
$$;

revoke all on function public.handover_state_blockers(uuid) from public, anon, authenticated;

comment on function public.handover_state_blockers(uuid) is
  'The invariants a completed handover must satisfy, re-checked after a correction so a correction cannot reach a state finalisation would have refused.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Correction.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.correct_handover_impl(
  p_handover_id uuid,
  p_actor       uuid,
  p_actor_name  text,
  p_reason      text,
  p_changes     jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  h            public.rental_handovers%rowtype;
  before_state jsonb;
  before_odo   integer;
  allowed      text[] := array['odometer_km','fuel_eighths','cleanliness','notes','occurred_at'];
  unknown      text[] := '{}';
  k            text;
  blockers     text[];
begin
  if p_actor is null then
    raise exception 'no actor supplied' using errcode = 'AN401';
  end if;

  -- §4.2: "A correction requires a reason". A blank one is not a reason, and
  -- this is the field a later dispute reads first.
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'a correction requires a reason' using errcode = 'AN422';
  end if;

  if p_changes is null or jsonb_typeof(p_changes) <> 'object' or p_changes = '{}'::jsonb then
    raise exception 'a correction must change something' using errcode = 'AN422';
  end if;

  -- Refused by name, never ignored. A caller who put vehicle_id in the payload
  -- must be told it did nothing rather than left believing it did.
  for k in select jsonb_object_keys(p_changes) loop
    if not (k = any(allowed)) then
      unknown := array_append(unknown, k);
    end if;
  end loop;

  if array_length(unknown, 1) > 0 then
    raise exception
      'these fields cannot be corrected: %. A handover recording a different reservation, vehicle, direction or template is a different event: void it and record a new one.',
      array_to_string(unknown, ', ')
      using errcode = 'AN422';
  end if;

  select * into h from public.rental_handovers where id = p_handover_id for update;
  if not found then
    raise exception 'handover not found' using errcode = 'AN404';
  end if;

  if h.status = 'draft' then
    -- A draft is not yet a record of anything, so it is edited directly. An
    -- audited correction to it would be ceremony over an unfinished form.
    raise exception 'handover % is still a draft; edit it rather than correcting it', p_handover_id
      using errcode = 'AN409';
  end if;

  if h.status = 'voided' then
    raise exception 'handover % was voided; correct the handover that replaced it', p_handover_id
      using errcode = 'AN409';
  end if;

  before_state := to_jsonb(h);
  before_odo   := h.odometer_km;

  update public.rental_handovers
     set odometer_km  = case when p_changes ? 'odometer_km'
                             then nullif(p_changes ->> 'odometer_km', '')::integer else odometer_km end,
         fuel_eighths = case when p_changes ? 'fuel_eighths'
                             then nullif(p_changes ->> 'fuel_eighths', '')::smallint else fuel_eighths end,
         cleanliness  = case when p_changes ? 'cleanliness'
                             then nullif(p_changes ->> 'cleanliness', '') else cleanliness end,
         notes        = case when p_changes ? 'notes'
                             then nullif(p_changes ->> 'notes', '') else notes end,
         occurred_at  = case when p_changes ? 'occurred_at'
                             then nullif(p_changes ->> 'occurred_at', '')::timestamptz else occurred_at end
   where id = h.id
   returning * into h;

  if h.occurred_at is not null and h.occurred_at > now() then
    raise exception 'a handover cannot have occurred in the future' using errcode = 'AN422';
  end if;

  blockers := public.handover_state_blockers(h.id);
  if array_length(blockers, 1) > 0 then
    raise exception 'correction refused: %', array_to_string(blockers, '; ')
      using errcode = 'AN422';
  end if;

  -- The fleet odometer follows a corrected check-in reading, but only when
  -- nothing else has moved it since. If it no longer matches what this handover
  -- wrote, a person or another process set it deliberately and a correction to
  -- an old rental has no business overriding that.
  if h.direction = 'in' and h.odometer_km is not null and before_odo is not null then
    update public.vehicles
       set odometer_km = h.odometer_km
     where id = h.vehicle_id
       and odometer_km is not distinct from before_odo;
  end if;

  insert into public.rental_handover_events
    (handover_id, event_type, actor_user_id, reason, before_state, after_state)
  values (h.id, 'corrected', p_actor, btrim(p_reason), before_state,
          to_jsonb(h) || jsonb_build_object(
            'corrected_fields', (select jsonb_agg(key order by key) from jsonb_object_keys(p_changes) as key),
            'corrected_by_name', p_actor_name
          ));

  return jsonb_build_object(
    'handover_id',      h.id,
    'corrected_fields', (select jsonb_agg(key order by key) from jsonb_object_keys(p_changes) as key)
  );
end;
$$;

revoke all on function public.correct_handover_impl(uuid, uuid, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.correct_handover_impl(uuid, uuid, text, text, jsonb)
  to service_role;

comment on function public.correct_handover_impl(uuid, uuid, text, text, jsonb) is
  'Corrects the observed fields of a completed handover, with a mandatory reason and a corrected event carrying before and after state. Refuses any field that is not an observation.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Voiding.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.void_handover_impl(
  p_handover_id uuid,
  p_actor       uuid,
  p_actor_name  text,
  p_reason      text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  h            public.rental_handovers%rowtype;
  r            public.reservations%rowtype;
  before_state jsonb;
  was          text;
  stepped_to   text := null;
begin
  if p_actor is null then
    raise exception 'no actor supplied' using errcode = 'AN401';
  end if;

  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'voiding requires a reason' using errcode = 'AN422';
  end if;

  select * into h from public.rental_handovers where id = p_handover_id;
  if not found then
    raise exception 'handover not found' using errcode = 'AN404';
  end if;

  -- Same fixed lock order as the two finalisations: reservation, then handover.
  -- The vehicle is not locked because nothing here writes to it.
  select * into r from public.reservations where id = h.reservation_id for update;
  select * into h from public.rental_handovers where id = p_handover_id for update;

  if h.status = 'voided' then
    return jsonb_build_object(
      'handover_id',        h.id,
      'reservation_status', r.status,
      'already_voided',     true
    );
  end if;

  was          := h.status;
  before_state := to_jsonb(h);

  -- `completed_at` is cleared in the same statement, because
  -- rental_handovers_completed_together forbids a voided row from carrying one.
  -- completed_by and the name snapshot stay: who completed it is part of what
  -- is being undone, and before_state below preserves the whole row regardless.
  update public.rental_handovers
     set status       = 'voided',
         void_reason  = btrim(p_reason),
         completed_at = null
   where id = h.id
   returning * into h;

  -- Step the reservation back, and only from the status this handover set.
  if was = 'completed' then
    if h.direction = 'out' and r.status = 'active' then
      update public.reservations set status = 'confirmed' where id = r.id returning * into r;
      stepped_to := 'confirmed';
    elsif h.direction = 'in' and r.status = 'returned' then
      update public.reservations set status = 'active' where id = r.id returning * into r;
      stepped_to := 'active';
    end if;
  end if;

  insert into public.rental_handover_events
    (handover_id, event_type, actor_user_id, reason, before_state, after_state)
  values (h.id, 'voided', p_actor, btrim(p_reason), before_state,
          to_jsonb(h) || jsonb_build_object(
            'reservation_status',       r.status,
            'reservation_stepped_back_to', stepped_to,
            'voided_by_name',           p_actor_name
          ));

  return jsonb_build_object(
    'handover_id',                 h.id,
    'reservation_status',          r.status,
    'reservation_stepped_back_to', stepped_to,
    'already_voided',              false
  );
end;
$$;

revoke all on function public.void_handover_impl(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.void_handover_impl(uuid, uuid, text, text)
  to service_role;

comment on function public.void_handover_impl(uuid, uuid, text, text) is
  'Voids a handover with a mandatory reason, clearing completed_at so the completed-together constraint holds, and steps the reservation back only from the status this handover set.';

-- ─────────────────────────────────────────────────────────────────────────────
-- The gateways. Written now, granted later — same as 041 and 042.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.correct_handover(
  p_handover_id uuid,
  p_reason      text,
  p_changes     jsonb
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
  begin
    caller := auth.uid();
  exception when others then
    caller := null;
  end;

  if caller is null then
    raise exception 'no caller identity' using errcode = 'AN401';
  end if;

  role := public.handover_actor_role();

  -- Correcting a completed record is an administrator's act, not a counter one.
  -- Staff can void and record a new handover, which leaves both rows and both
  -- reasons in the log; a correction rewrites the observation in place.
  if role <> 'admin' then
    raise exception 'correcting a completed handover requires an administrator'
      using errcode = 'AN403';
  end if;

  return public.correct_handover_impl(
    p_handover_id, caller,
    (select coalesce(u.raw_user_meta_data ->> 'full_name', u.email)
       from auth.users u where u.id = caller),
    p_reason, p_changes
  );
end;
$$;

create or replace function public.void_handover(
  p_handover_id uuid,
  p_reason      text
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
  begin
    caller := auth.uid();
  exception when others then
    caller := null;
  end;

  if caller is null then
    raise exception 'no caller identity' using errcode = 'AN401';
  end if;

  role := public.handover_actor_role();

  -- Staff may void. Getting the wrong car onto a handover is a counter mistake
  -- and the fix has to be available at the counter; the reason and the replaced
  -- record are what make it safe.
  if role is null or role not in ('admin', 'staff') then
    raise exception 'caller is not staff' using errcode = 'AN403';
  end if;

  return public.void_handover_impl(
    p_handover_id, caller,
    (select coalesce(u.raw_user_meta_data ->> 'full_name', u.email)
       from auth.users u where u.id = caller),
    p_reason
  );
end;
$$;

-- Granted to nobody, on purpose. OPEN-QUESTION-RPC-STAFF-IDENTITY.md §13.4.
revoke all on function public.correct_handover(uuid, text, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.void_handover(uuid, text)
  from public, anon, authenticated, service_role;

do $$
begin
  raise notice 'REACHED THE END — handover correction and voiding';
end;
$$;
