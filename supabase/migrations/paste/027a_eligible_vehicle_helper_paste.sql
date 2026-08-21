-- Run first: helper that finds only a safe same-class/free-upgrade vehicle.
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
notify pgrst, 'reload schema';
select 'REACHED THE END — 027a' as status;
commit;
