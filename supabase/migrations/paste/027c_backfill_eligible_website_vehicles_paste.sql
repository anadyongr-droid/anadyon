-- Run last: allocate only existing website reservations that can be honoured.
begin;
do $$
declare r record; v_vehicle_id uuid;
begin
  for r in
    select r.id, r.pickup_date, r.pickup_time, r.return_date, r.return_time,
           q.pricing_group, q.vehicle_type, q.transmission, q.selected_model
      from public.reservations r join public.quotes q on q.id = r.quote_id
     where r.source = 'website' and r.vehicle_id is null
       and r.status not in ('cancelled', 'voided', 'no_show')
  loop
    v_vehicle_id := public.find_available_eligible_vehicle(
      r.pricing_group, r.vehicle_type, r.transmission, r.selected_model,
      r.pickup_date, r.pickup_time, r.return_date, r.return_time
    );
    if v_vehicle_id is not null then
      update public.reservations set vehicle_id = v_vehicle_id, updated_at = now()
       where id = r.id and vehicle_id is null;
    end if;
  end loop;
end;
$$;
select 'REACHED THE END — 027c' as status;
commit;
