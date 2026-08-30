-- Four eyes on the fleet record: staff propose, an administrator approves.
--
-- WHY THIS EXISTS
--
-- /admin/fleet has been administrator-only, and app/api/admin/vehicles/[id]
-- already refuses a staff write to anything outside STAFF_WRITABLE (status,
-- odometer_km, vehicle_notes) with a 403 naming the fields. So a staff member
-- who spots that a KTEO certificate expires next week has no way to record it
-- except to tell somebody.
--
-- Rather than widen what staff may write, the refusal becomes a proposal. The
-- set of fields is unchanged — exactly the ones the route already refuses — and
-- an administrator turns a proposal into a change. Nothing here lets staff
-- write a column they could not write before; it gives the refusal somewhere to
-- go.
--
-- WHAT IS DELIBERATELY NOT HERE
--
-- No approval is required for status, odometer_km or vehicle_notes. Those were
-- chosen as counter tasks: an odometer read off the dashboard at handover, and
-- taking a car off the road because it will not start. Putting a review between
-- a staff member and "this vehicle is in maintenance" would delay the one
-- action that protects a customer, which is the wrong direction to be slow in.

create table if not exists public.vehicle_change_requests (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,

  -- {column: proposed value}. Keys are validated against the live column list
  -- when applied, not trusted from the application.
  changes jsonb not null,

  -- What those same columns held when the request was made. Kept so the
  -- reviewer sees a before/after, and so approval can refuse when the vehicle
  -- has moved underneath the request — see apply_vehicle_change_request.
  before jsonb not null,

  note text,

  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),

  -- Application-asserted, not auth.uid(). Every RPC here is called with the
  -- service role, under which auth.uid() is NULL — see
  -- docs/OPEN-QUESTION-RPC-STAFF-IDENTITY.md. Recorded as the application's
  -- claim about who acted, to be re-derived from the session once that is
  -- answered.
  requested_by uuid,
  requested_at timestamptz not null default now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,

  -- A decision has a decider and a time, or it is not a decision.
  constraint vehicle_change_requests_reviewed_together
    check ((status = 'pending') = (reviewed_at is null)),

  -- An empty proposal is not a proposal.
  constraint vehicle_change_requests_changes_not_empty
    check (jsonb_typeof(changes) = 'object' and changes <> '{}'::jsonb)
);

-- The queue an administrator opens: pending first, oldest first.
create index if not exists vehicle_change_requests_pending_idx
  on public.vehicle_change_requests (requested_at)
  where status = 'pending';

create index if not exists vehicle_change_requests_vehicle_idx
  on public.vehicle_change_requests (vehicle_id, requested_at desc);

alter table public.vehicle_change_requests enable row level security;
revoke all privileges on public.vehicle_change_requests from public, anon, authenticated;

/*
 * Approve a request and apply it, in one transaction.
 *
 * Two things this must not do, both of which a simpler version gets wrong:
 *
 *  1. Mark approved without applying. Separate statements from the application
 *     can be interrupted between them, leaving a request that says "approved"
 *     over a vehicle that never changed. Approval IS the application.
 *
 *  2. Overwrite a value somebody else already fixed. A request made on Monday
 *     proposes kteo_expiry = 2027-03-01. On Tuesday an administrator edits that
 *     field directly. Approving the stale request on Wednesday would silently
 *     undo Tuesday's work. Every column named in `before` is compared with what
 *     the vehicle holds now, and a mismatch refuses the whole request rather
 *     than applying part of it.
 *
 * SECURITY DEFINER with an empty search_path: the function runs as its owner,
 * so an unqualified name must never be resolvable from a caller-controlled
 * schema (CVE-2018-1058). Every reference below is schema-qualified.
 */
create or replace function public.apply_vehicle_change_request(
  p_request_id uuid,
  p_reviewer   uuid,
  p_note       text default null
)
returns public.vehicle_change_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req      public.vehicle_change_requests;
  v_current  jsonb;
  v_stale    text;
  v_set      text;
  v_bad_key  text;
begin
  -- Lock the request so two administrators pressing Approve cannot both apply.
  select * into v_req
  from public.vehicle_change_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'change request % does not exist', p_request_id
      using errcode = 'no_data_found';
  end if;

  if v_req.status <> 'pending' then
    raise exception 'change request % is already %', p_request_id, v_req.status
      using errcode = 'invalid_parameter_value';
  end if;

  -- Every proposed key must be a real, writable column of vehicles. Checked
  -- here rather than trusted from the caller, because this function runs with
  -- the owner's rights and the key is about to be interpolated as an
  -- identifier.
  select k into v_bad_key
  from jsonb_object_keys(v_req.changes) k
  where k in ('id', 'created_at')
     or not exists (
       select 1 from information_schema.columns c
       where c.table_schema = 'public'
         and c.table_name = 'vehicles'
         and c.column_name = k
     )
  limit 1;

  if v_bad_key is not null then
    raise exception 'change request % names a column that cannot be written: %',
      p_request_id, v_bad_key
      using errcode = 'invalid_parameter_value';
  end if;

  select to_jsonb(v) into v_current
  from public.vehicles v
  where v.id = v_req.vehicle_id;

  if v_current is null then
    raise exception 'vehicle % no longer exists', v_req.vehicle_id
      using errcode = 'no_data_found';
  end if;

  -- Has anything moved under the request since it was made?
  select string_agg(b.key, ', ' order by b.key) into v_stale
  from jsonb_each(v_req.before) b
  where v_current -> b.key is distinct from b.value;

  if v_stale is not null then
    raise exception
      'vehicle % changed since this was requested (%); review it again',
      v_req.vehicle_id, v_stale
      using errcode = 'serialization_failure';
  end if;

  -- Build "col = n.col" for the proposed columns only. jsonb_populate_record
  -- against the vehicles type does the type conversion, so a date arrives as a
  -- date rather than as text that happens to look like one.
  select string_agg(format('%I = n.%I', k, k), ', ' order by k) into v_set
  from jsonb_object_keys(v_req.changes) k;

  execute format(
    'update public.vehicles v set %s
       from jsonb_populate_record(null::public.vehicles, $1) n
      where v.id = $2',
    v_set
  ) using v_req.changes, v_req.vehicle_id;

  update public.vehicle_change_requests
  set status      = 'approved',
      reviewed_by = p_reviewer,
      reviewed_at = now(),
      review_note = p_note
  where id = p_request_id
  returning * into v_req;

  return v_req;
end;
$$;

revoke all on function public.apply_vehicle_change_request(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.apply_vehicle_change_request(uuid, uuid, text)
  to service_role;

do $$
begin
  raise notice 'REACHED THE END — vehicle change requests';
end;
$$;
