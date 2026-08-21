-- Run last: allocate only existing website reservations that can be honoured.
begin;
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
select 'REACHED THE END — 027c' as status;
commit;
