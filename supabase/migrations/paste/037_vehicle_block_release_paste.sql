-- SQL Editor copy of 20260829090000_vehicle_block_release.sql. Same statements;
-- see that file for why an expected return cannot end a block.
-- Blueprint §7.4. The first version stored the garage's estimated return as
-- `ends_on` and let the block expire on it. That is a promise from a third
-- party, not a fact: the mechanic says the 15th, does not deliver, the block
-- lapses on its own, and a car still in pieces becomes bookable with nobody
-- asked. The failure is silent and it is in the dangerous direction.
--
-- So the estimate is renamed to what it is, and cannot end anything. A block is
-- open while released_at is null, and an open block is a hard stop out of the
-- active fleet: the vehicle is unavailable for every date from starts_on
-- onward, including dates past the estimate.
--
-- That costs forward bookings - a car in on 1 September cannot be sold for
-- October until it is marked back - and is accepted knowingly. The escape is an
-- attested override on the reservation write paths, not a softer rule here. A
-- hard stop nobody can pass honestly is one they pass by deleting the block,
-- and the record goes with it.
--
-- SAFE AS A RENAME because vehicle_blocks is empty: 20260828120000 created it
-- this morning and nothing writes to it yet. Verified before writing this. That
-- will not be true again, so a later change to these columns needs the additive
-- treatment instead.
begin;

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'vehicle_blocks'
       and column_name = 'ends_on'
  ) then
    alter table public.vehicle_blocks rename column ends_on to expected_return;
  end if;
end;
$$;

alter table public.vehicle_blocks
  drop constraint if exists vehicle_blocks_dates_ordered;

alter table public.vehicle_blocks
  add constraint vehicle_blocks_dates_ordered
  check (expected_return is null or expected_return >= starts_on);

-- released_by is application-asserted, like created_by: every RPC here is
-- called with the service role, under which auth.uid() is NULL. See
-- docs/OPEN-QUESTION-RPC-STAFF-IDENTITY.md.
alter table public.vehicle_blocks
  add column if not exists released_at timestamptz,
  add column if not exists released_by uuid;

-- A release cannot precede the block it ends.
alter table public.vehicle_blocks
  drop constraint if exists vehicle_blocks_released_after_start;
alter table public.vehicle_blocks
  add constraint vehicle_blocks_released_after_start
  check (released_at is null or released_at >= starts_on::timestamptz);

-- The allocator asks one question: has this vehicle an open block starting on
-- or before the requested return? Partial, because a released block is history
-- and must not be scanned on every booking.
drop index if exists public.vehicle_blocks_vehicle_dates;
create index if not exists vehicle_blocks_open
  on public.vehicle_blocks (vehicle_id, starts_on)
  where released_at is null;

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
     -- Statutory cover, mirroring rentalBar() in lib/fleetStatus.ts. Exactly
     -- the two fields marked blocksRental there; a null date is "not recorded",
     -- not "expired".
     and (v.kteo_expiry is null or v.kteo_expiry >= p_pickup_date)
     and (v.insurance_expiry is null or v.insurance_expiry >= p_pickup_date)
     and (v_required_transmission is null or lower(coalesce(v.transmission, '')) = lower(v_required_transmission))
     and (v_min_rank is null or case v.pricing_group
          when 'car_a' then 1 when 'car_b' then 2 when 'car_c' then 3
          when 'motorbike_a' then 1 when 'motorbike_b' then 2 when 'bike' then 1 else 0 end >= v_min_rank)
     -- An OPEN block is a hard stop, with no end date to compare against. Note
     -- there is deliberately no upper bound: a vehicle out of the fleet is out
     -- for October as much as for tomorrow, until somebody records it back.
     and not exists (
       select 1 from public.vehicle_blocks b
        where b.vehicle_id = v.id
          and b.released_at is null
          and b.starts_on <= p_return_date
     )
     -- Turnaround applies to BOTH ends of a rental.
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

notify pgrst, 'reload schema';
select 'REACHED THE END — vehicle block release' as status;
commit;
