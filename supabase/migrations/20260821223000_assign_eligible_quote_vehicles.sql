-- Automatic website allocation without changing create_web_booking itself.
-- The BEFORE INSERT trigger runs inside its existing atomic transaction, after
-- the quote has been inserted and linked to the reservation. The candidate row
-- lock means two simultaneous bookings cannot both take the final suitable
-- vehicle. If there is no safe candidate, vehicle_id remains NULL and the
-- pending reservation stays visible to the office for a manual decision.
begin;

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
     and (v_required_transmission is null or lower(coalesce(v.transmission, '')) = lower(v_required_transmission))
     and (v_min_rank is null or case v.pricing_group
          when 'car_a' then 1 when 'car_b' then 2 when 'car_c' then 3
          when 'motorbike_a' then 1 when 'motorbike_b' then 2 when 'bike' then 1 else 0 end >= v_min_rank)
     and not exists (
       select 1 from public.reservations r
        where r.vehicle_id = v.id and r.status not in ('cancelled', 'voided', 'no_show')
          and (r.pickup_date + coalesce(nullif(r.pickup_time, ''), '09:00')::time)
              < (p_return_date + coalesce(nullif(p_return_time, ''), '09:00')::time)
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

create or replace function public.assign_eligible_vehicle_to_web_reservation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare q public.quotes%rowtype;
begin
  if new.source <> 'website' or new.quote_id is null or new.vehicle_id is not null then return new; end if;
  select * into q from public.quotes where id = new.quote_id;
  if not found then return new; end if;
  new.vehicle_id := public.find_available_eligible_vehicle(
    q.pricing_group, q.vehicle_type, q.transmission, q.selected_model,
    new.pickup_date, new.pickup_time, new.return_date, new.return_time
  );
  return new;
end;
$$;

revoke all on function public.assign_eligible_vehicle_to_web_reservation()
  from public, anon, authenticated, service_role;

drop trigger if exists assign_eligible_vehicle_to_web_reservation on public.reservations;
create trigger assign_eligible_vehicle_to_web_reservation
  before insert on public.reservations
  for each row execute function public.assign_eligible_vehicle_to_web_reservation();

-- Bring existing unallocated website reservations forward where a safe vehicle
-- exists. Unsafe or unavailable cases remain pending rather than downgraded.
do $$
declare v_row record; v_vehicle_id uuid;
begin
  for v_row in
    select res.id, res.pickup_date, res.pickup_time, res.return_date, res.return_time,
           q.pricing_group, q.vehicle_type, q.transmission, q.selected_model
      from public.reservations res join public.quotes q on q.id = res.quote_id
     where res.source = 'website' and res.vehicle_id is null
       and res.status not in ('cancelled', 'voided', 'no_show')
  loop
    v_vehicle_id := public.find_available_eligible_vehicle(
      v_row.pricing_group, v_row.vehicle_type, v_row.transmission, v_row.selected_model,
      v_row.pickup_date, v_row.pickup_time, v_row.return_date, v_row.return_time
    );
    if v_vehicle_id is not null then
      update public.reservations set vehicle_id = v_vehicle_id, updated_at = now()
       where id = v_row.id and vehicle_id is null;
    end if;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
select 'REACHED THE END' as status;
commit;
