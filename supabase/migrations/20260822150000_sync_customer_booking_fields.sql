-- Keep mutable customer identity/contact fields consistent across every staff
-- reservation view and the customer master record. Rental dates, vehicles,
-- prices, extras and statuses remain immutable booking snapshots and are never
-- touched by these triggers.
begin;

create or replace function public.sync_customer_identity_from_customer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Updates performed by the companion reservation trigger re-enter this
  -- trigger. The outer trigger already owns the fan-out, so stop recursion.
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if not (
    new.title is distinct from old.title
    or new.first_name is distinct from old.first_name
    or new.last_name is distinct from old.last_name
    or new.full_name is distinct from old.full_name
    or new.email is distinct from old.email
    or new.phone is distinct from old.phone
    or new.dob is distinct from old.dob
    or new.nationality is distinct from old.nationality
    or new.address is distinct from old.address
    or new.postal_code is distinct from old.postal_code
    or new.city is distinct from old.city
    or new.country is distinct from old.country
  ) then
    return new;
  end if;

  update public.reservations r
     set customer_first_name = new.first_name,
         customer_last_name = new.last_name,
         customer_name = nullif(concat_ws(' ', nullif(trim(new.first_name), ''), nullif(trim(new.last_name), '')), ''),
         customer_email = new.email,
         customer_phone = new.phone,
         customer_dob = new.dob,
         customer_nationality = new.nationality,
         updated_at = now()
   where r.customer_id = new.id
     and (
       r.customer_first_name is distinct from new.first_name
       or r.customer_last_name is distinct from new.last_name
       or r.customer_name is distinct from nullif(concat_ws(' ', nullif(trim(new.first_name), ''), nullif(trim(new.last_name), '')), '')
       or r.customer_email is distinct from new.email
       or r.customer_phone is distinct from new.phone
       or r.customer_dob is distinct from new.dob
       or r.customer_nationality is distinct from new.nationality
     );

  update public.quotes q
     set title = new.title,
         first_name = new.first_name,
         last_name = new.last_name,
         email = new.email,
         mobile_tel = new.phone,
         dob = new.dob::text,
         address = new.address,
         postal_code = new.postal_code,
         city = new.city,
         country = new.country
   where q.customer_id = new.id
     and (
       q.title is distinct from new.title
       or q.first_name is distinct from new.first_name
       or q.last_name is distinct from new.last_name
       or q.email is distinct from new.email
       or q.mobile_tel is distinct from new.phone
       or q.dob is distinct from new.dob::text
       or q.address is distinct from new.address
       or q.postal_code is distinct from new.postal_code
       or q.city is distinct from new.city
       or q.country is distinct from new.country
     );

  return new;
end;
$$;

revoke all on function public.sync_customer_identity_from_customer()
  from public, anon, authenticated, service_role;

drop trigger if exists sync_customer_identity_from_customer on public.customers;
create trigger sync_customer_identity_from_customer
  after update of title, first_name, last_name, full_name, email, phone, dob,
                  nationality, address, postal_code, city, country
  on public.customers
  for each row execute function public.sync_customer_identity_from_customer();

create or replace function public.sync_customer_identity_from_reservation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_full_name text;
begin
  if pg_trigger_depth() > 1 or new.customer_id is null then
    return new;
  end if;

  if not (
    new.customer_id is distinct from old.customer_id
    or new.customer_first_name is distinct from old.customer_first_name
    or new.customer_last_name is distinct from old.customer_last_name
    or new.customer_email is distinct from old.customer_email
    or new.customer_phone is distinct from old.customer_phone
    or new.customer_dob is distinct from old.customer_dob
    or new.customer_nationality is distinct from old.customer_nationality
    or new.flight_number is distinct from old.flight_number
  ) then
    return new;
  end if;

  v_full_name := nullif(concat_ws(
    ' ',
    nullif(trim(new.customer_first_name), ''),
    nullif(trim(new.customer_last_name), '')
  ), '');

  update public.customers c
     set first_name = new.customer_first_name,
         last_name = new.customer_last_name,
         full_name = v_full_name,
         name = v_full_name,
         email = new.customer_email,
         phone = new.customer_phone,
         dob = new.customer_dob,
         nationality = new.customer_nationality,
         last_interaction_at = now(),
         updated_at = now()
   where c.id = new.customer_id
     and (
       c.first_name is distinct from new.customer_first_name
       or c.last_name is distinct from new.customer_last_name
       or c.full_name is distinct from v_full_name
       or c.email is distinct from new.customer_email
       or c.phone is distinct from new.customer_phone
       or c.dob is distinct from new.customer_dob
       or c.nationality is distinct from new.customer_nationality
     );

  update public.reservations r
     set customer_first_name = new.customer_first_name,
         customer_last_name = new.customer_last_name,
         customer_name = v_full_name,
         customer_email = new.customer_email,
         customer_phone = new.customer_phone,
         customer_dob = new.customer_dob,
         customer_nationality = new.customer_nationality,
         updated_at = now()
   where r.customer_id = new.customer_id
     and r.id <> new.id
     and (
       r.customer_first_name is distinct from new.customer_first_name
       or r.customer_last_name is distinct from new.customer_last_name
       or r.customer_name is distinct from v_full_name
       or r.customer_email is distinct from new.customer_email
       or r.customer_phone is distinct from new.customer_phone
       or r.customer_dob is distinct from new.customer_dob
       or r.customer_nationality is distinct from new.customer_nationality
     );

  update public.quotes q
     set first_name = new.customer_first_name,
         last_name = new.customer_last_name,
         email = new.customer_email,
         mobile_tel = new.customer_phone,
         dob = new.customer_dob::text
   where q.customer_id = new.customer_id
     and (
       q.first_name is distinct from new.customer_first_name
       or q.last_name is distinct from new.customer_last_name
       or q.email is distinct from new.customer_email
       or q.mobile_tel is distinct from new.customer_phone
       or q.dob is distinct from new.customer_dob::text
     );

  -- A flight belongs to one rental, not to the customer. Keep only the linked
  -- quote/reservation pair aligned; never copy it onto another trip.
  if new.quote_id is not null and new.flight_number is distinct from old.flight_number then
    update public.quotes
       set flight_number = new.flight_number
     where id = new.quote_id
       and flight_number is distinct from new.flight_number;
  end if;

  return new;
end;
$$;

revoke all on function public.sync_customer_identity_from_reservation()
  from public, anon, authenticated, service_role;

drop trigger if exists sync_customer_identity_from_reservation on public.reservations;
create trigger sync_customer_identity_from_reservation
  after update of customer_id, customer_first_name, customer_last_name,
                  customer_email, customer_phone, customer_dob,
                  customer_nationality, flight_number
  on public.reservations
  for each row execute function public.sync_customer_identity_from_reservation();

notify pgrst, 'reload schema';
select 'REACHED THE END — shared customer fields synchronized' as status;
commit;

