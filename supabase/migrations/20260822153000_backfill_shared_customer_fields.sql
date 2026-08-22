-- Narrow synchronization to current operational bookings, then start from a
-- clean canonical state. Returned/cancelled/no-show/voided records stay as
-- historical snapshots. Flight remains scoped to its own booking.
begin;

create or replace function public.sync_customer_identity_from_customer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
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
     and r.status in ('pending', 'confirmed', 'active')
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
     and exists (
       select 1 from public.reservations r
        where r.quote_id = q.id
          and r.status in ('pending', 'confirmed', 'active')
     )
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

  -- Flight is a booking field. It remains synchronized within its own pair
  -- even after the rental is finished, without touching another trip.
  if new.quote_id is not null and new.flight_number is distinct from old.flight_number then
    update public.quotes
       set flight_number = new.flight_number
     where id = new.quote_id
       and flight_number is distinct from new.flight_number;
  end if;

  -- Historical identity/contact snapshots are not rewritten.
  if new.status not in ('pending', 'confirmed', 'active') then
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
     and r.status in ('pending', 'confirmed', 'active')
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
     and exists (
       select 1 from public.reservations r
        where r.quote_id = q.id
          and r.status in ('pending', 'confirmed', 'active')
     )
     and (
       q.first_name is distinct from new.customer_first_name
       or q.last_name is distinct from new.customer_last_name
       or q.email is distinct from new.customer_email
       or q.mobile_tel is distinct from new.customer_phone
       or q.dob is distinct from new.customer_dob::text
     );

  return new;
end;
$$;

revoke all on function public.sync_customer_identity_from_reservation()
  from public, anon, authenticated, service_role;

update public.reservations r
   set customer_first_name = c.first_name,
       customer_last_name = c.last_name,
       customer_name = nullif(concat_ws(' ', nullif(trim(c.first_name), ''), nullif(trim(c.last_name), '')), ''),
       customer_email = c.email,
       customer_phone = c.phone,
       customer_dob = c.dob,
       customer_nationality = c.nationality,
       updated_at = now()
  from public.customers c
 where r.customer_id = c.id
   and r.status in ('pending', 'confirmed', 'active')
   and (
     r.customer_first_name is distinct from c.first_name
     or r.customer_last_name is distinct from c.last_name
     or r.customer_name is distinct from nullif(concat_ws(' ', nullif(trim(c.first_name), ''), nullif(trim(c.last_name), '')), '')
     or r.customer_email is distinct from c.email
     or r.customer_phone is distinct from c.phone
     or r.customer_dob is distinct from c.dob
     or r.customer_nationality is distinct from c.nationality
   );

update public.quotes q
   set title = c.title,
       first_name = c.first_name,
       last_name = c.last_name,
       email = c.email,
       mobile_tel = c.phone,
       dob = c.dob::text,
       address = c.address,
       postal_code = c.postal_code,
       city = c.city,
       country = c.country
  from public.customers c
 where q.customer_id = c.id
   and exists (
     select 1 from public.reservations r
      where r.quote_id = q.id
        and r.status in ('pending', 'confirmed', 'active')
   )
   and (
     q.title is distinct from c.title
     or q.first_name is distinct from c.first_name
     or q.last_name is distinct from c.last_name
     or q.email is distinct from c.email
     or q.mobile_tel is distinct from c.phone
     or q.dob is distinct from c.dob::text
     or q.address is distinct from c.address
     or q.postal_code is distinct from c.postal_code
     or q.city is distinct from c.city
     or q.country is distinct from c.country
   );

select 'REACHED THE END — current customer fields backfilled' as status;
commit;

