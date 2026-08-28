-- SQL Editor copy of 20260828120000_vehicle_blocks.sql. Same statements; see
-- that file for the reasoning behind the shape of the table and the gate.
-- Blueprint §7 phase 1: "the counter must not be capable of releasing a blocked
-- vehicle or an invalid driver." This is the vehicle half.
--
-- WHY NOT vehicles.status = 'maintenance'
--
-- That column already exists and is the wrong shape for this. It is a single
-- open-ended flag on the vehicle: it cannot say "in the workshop Tuesday to
-- Thursday", it cannot hold two future blocks at once, and it relies on a
-- person remembering to set it back — a vehicle left on 'maintenance' silently
-- stops being bookable, and one left on 'available' silently becomes bookable
-- while it is still on a ramp. Neither failure is visible.
--
-- vehicles.status keeps its job: what the vehicle *is* right now, including
-- 'retired'. vehicle_blocks carries what is true on which dates. The allocation
-- boundary consults both.
--
-- THE OVERLAP RULE
--
-- Blocks are whole days, inclusive at both ends, because that is how an
-- operator books a service slot — not to the minute. A rental overlaps a block
-- when the rental starts on or before the block's last day and ends on or after
-- its first. ends_on NULL means open-ended, which is what an unroadworthy
-- vehicle gets until someone closes it.
--
-- Deliberately NOT applying turnaround_minutes here. Turnaround protects one
-- rental from the next; a block says the vehicle is not available at all on
-- those days, and padding it would silently extend a workshop booking by two
-- hours in a way nobody wrote down.
--
-- WHERE THE GATE GOES
--
-- Inside find_available_eligible_vehicle, which is the single point that
-- decides whether a vehicle may be allocated. Every caller inherits it: the
-- BEFORE INSERT trigger on website bookings, and any later manual path that
-- uses the same function. Gating at the call sites instead would mean the next
-- call site added is unguarded by default.
-- ALSO IN THIS MIGRATION: turnaround is made symmetric.
--
-- Folded in rather than given its own migration because it edits the same
-- function this one already replaces, and this migration has not been applied
-- yet. Two migrations redefining find_available_eligible_vehicle in sequence
-- would be worse to read and no safer.
begin;

create table if not exists public.vehicle_blocks (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  -- 'statutory' covers KTEO, insurance and road tax: the vehicle may be
  -- physically fine and still illegal to release, which is the case an operator
  -- is most likely to lose track of.
  reason text not null check (reason in ('maintenance', 'statutory', 'damage', 'hold', 'other')),
  starts_on date not null,
  ends_on date,
  note text,
  -- Application-asserted, not auth.uid(). Every RPC in this codebase is called
  -- with the service role, under which auth.uid() is NULL — see
  -- docs/OPEN-QUESTION-RPC-STAFF-IDENTITY.md. Recorded as the application's
  -- claim about who acted, and it should be re-derived from the session once
  -- that question is answered.
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint vehicle_blocks_dates_ordered check (ends_on is null or ends_on >= starts_on)
);

-- The allocation query filters by vehicle and date on every candidate row.
create index if not exists vehicle_blocks_vehicle_dates
  on public.vehicle_blocks (vehicle_id, starts_on, ends_on);

-- RLS on with no permissive policy, matching every other internal table: the
-- row filter refuses everything, and the grants below refuse it again.
alter table public.vehicle_blocks enable row level security;
revoke all privileges on public.vehicle_blocks from public, anon, authenticated;

create or replace function public.find_available_eligible_vehicle(
  p_pricing_group text, p_vehicle_type text, p_transmission text, p_model text,
  p_pickup_date date, p_pickup_time text, p_return_date date, p_return_time text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_family text; v_min_rank integer; v_required_transmission text; v_vehicle_id uuid;
begin
  if p_pickup_date is null or p_return_date is null then return null; end if;
  v_family := case p_pricing_group
    when 'car_a' then 'car' when 'car_b' then 'car' when 'car_c' then 'car'
    when 'motorbike_a' then 'motorbike' when 'motorbike_b' then 'motorbike' when 'bike' then 'bike'
    else case lower(trim(coalesce(p_vehicle_type, '')))
      when 'car' then 'car' when 'cars' then 'car'
      when 'motorbike' then 'motorbike' when 'motorbikes' then 'motorbike'
      when 'motorcycle' then 'motorbike' when 'motorcycles' then 'motorbike'
      when 'bike' then 'bike' when 'bikes' then 'bike'
      when 'bicycle' then 'bike' when 'bicycles' then 'bike' else null end
  end;
  if v_family is null then return null; end if;
  v_min_rank := case p_pricing_group
    when 'car_a' then 1 when 'car_b' then 2 when 'car_c' then 3
    when 'motorbike_a' then 1 when 'motorbike_b' then 2 when 'bike' then 1 else null end;
  v_required_transmission := nullif(trim(coalesce(p_transmission, '')), '');
  if lower(coalesce(v_required_transmission, '')) = 'any' then v_required_transmission := null; end if;
  if v_required_transmission is null and v_family = 'car' then
    v_required_transmission := case
      when coalesce(p_model, '') ~* 'peugeot[[:space:]]*107' then 'Automatic'
      when coalesce(p_model, '') ~* '(panda|micra|getz|i10|i20)' then 'Manual'
      else null end;
  end if;
  -- An old car quote whose transmission cannot be proven stays unallocated.
  if v_family = 'car' and v_required_transmission is null then return null; end if;

  select v.id into v_vehicle_id
    from public.vehicles v
   where v.status = 'available' and v.category = v_family
     -- Statutory cover, mirroring rentalBar() in lib/fleetStatus.ts, which the
     -- ADMIN availability route already applies and this one did not. A car
     -- staff could not assign by hand was being allocated automatically by the
     -- website: "insurance cover is void" is not a scheduling matter.
     --
     -- Exactly the two fields marked blocksRental there. Road tax and next
     -- service are tracked and warned on but deliberately do not bar a rental,
     -- and blocking on them here would refuse vehicles the admin permits —
     -- swapping one disagreement for another.
     --
     -- A null date is "not recorded", not "expired": statusFor() returns
     -- severity 'unknown' and rentalBar only bars on 'expired'. Blocking nulls
     -- would refuse most of the fleet the day this ships.
     --
     -- Measured against the pick-up date, as the admin route does. Expiry ON
     -- the pick-up date still passes, matching daysRemaining = 0 there.
     and (v.kteo_expiry is null or v.kteo_expiry >= p_pickup_date)
     and (v.insurance_expiry is null or v.insurance_expiry >= p_pickup_date)
     and (v_required_transmission is null or lower(coalesce(v.transmission, '')) = lower(v_required_transmission))
     and (v_min_rank is null or case v.pricing_group
          when 'car_a' then 1 when 'car_b' then 2 when 'car_c' then 3
          when 'motorbike_a' then 1 when 'motorbike_b' then 2 when 'bike' then 1 else 0 end >= v_min_rank)
     and not exists (
       select 1 from public.vehicle_blocks b
        where b.vehicle_id = v.id
          and b.starts_on <= p_return_date
          and coalesce(b.ends_on, 'infinity'::date) >= p_pickup_date
     )
     -- Turnaround applies to BOTH ends, which it previously did not.
     --
     -- The old test padded only the existing rental's return, so a new booking
     -- returning a car at 09:00 was allowed ahead of an existing hire
     -- collecting it at 09:00: zero changeover, no clean, no refuel, no
     -- inspection. Found by a deliberate test that booked out the whole
     -- manual fleet from 30 August and was still allocated a car for
     -- 29 -> 30 August.
     and not exists (
       select 1 from public.reservations r
        where r.vehicle_id = v.id and r.status not in ('cancelled', 'voided', 'no_show')
          and (r.pickup_date + coalesce(nullif(r.pickup_time, ''), '09:00')::time)
              < (p_return_date + coalesce(nullif(p_return_time, ''), '09:00')::time
              + make_interval(mins => coalesce(v.turnaround_minutes, 120)))
          and (r.return_date + coalesce(nullif(r.return_time, ''), '09:00')::time
              + make_interval(mins => coalesce(v.turnaround_minutes, 120)))
              > (p_pickup_date + coalesce(nullif(p_pickup_time, ''), '09:00')::time)
     )
   order by case v.pricing_group
       when 'car_a' then 1 when 'car_b' then 2 when 'car_c' then 3
       when 'motorbike_a' then 1 when 'motorbike_b' then 2 when 'bike' then 1 else 99 end,
       v.sort_order nulls last, lower(v.name), v.id
   for update of v skip locked limit 1;
  return v_vehicle_id;
end;
$$;

revoke all on function public.find_available_eligible_vehicle(text, text, text, text, date, text, date, text)
  from public, anon, authenticated, service_role;

-- No SQL helper for "which block stopped this?" on purpose. Every read in this
-- codebase goes through supabaseAdmin against the table, and a function revoked
-- from service_role - which is what the convention above would produce - would
-- be uncallable. That mistake has already been made twice in the phase-2
-- design; see docs/OPEN-QUESTION-RPC-STAFF-IDENTITY.md. The manual-assignment
-- guard reads this table directly, in lib/vehicleBlocks.ts.

notify pgrst, 'reload schema';
select 'REACHED THE END — vehicle blocks' as status;
commit;
