-- Run second: allocate a safe vehicle as each website reservation is inserted.
begin;
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
notify pgrst, 'reload schema';
select 'REACHED THE END — 027b' as status;
commit;
