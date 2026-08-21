-- Run only after 025a and 025b both show REACHED THE END.
begin;
insert into public.customers as c (
  title, first_name, last_name, full_name, name, email, phone,
  address, postal_code, city, country, last_interaction_at
)
select distinct on (lower(trim(q.email)))
  nullif(trim(q.title), ''),
  nullif(trim(q.first_name), ''),
  nullif(trim(q.last_name), ''),
  nullif(concat_ws(' ', nullif(trim(q.first_name), ''), nullif(trim(q.last_name), '')), ''),
  nullif(concat_ws(' ', nullif(trim(q.first_name), ''), nullif(trim(q.last_name), '')), ''),
  lower(trim(q.email)), nullif(trim(q.mobile_tel), ''), nullif(trim(q.address), ''),
  nullif(trim(q.postal_code), ''), nullif(trim(q.city), ''), nullif(trim(q.country), ''), q.created_at
from public.quotes q
where nullif(trim(q.email), '') is not null
order by lower(trim(q.email)), q.created_at desc
on conflict ((lower(email))) where email is not null do update
  set last_interaction_at = greatest(c.last_interaction_at, excluded.last_interaction_at), updated_at = now();

update public.quotes q
   set customer_id = c.id
  from public.customers c
 where q.customer_id is null
   and nullif(trim(q.email), '') is not null
   and lower(trim(q.email)) = lower(c.email);

update public.reservations r
   set quote_id = q.id,
       customer_id = coalesce(r.customer_id, q.customer_id),
       updated_at = now()
  from public.quotes q
 where r.quote_id is null
   and r.notes like ('Quote ref: ' || q.ref || '%');

select 'REACHED THE END' as status;
commit;
