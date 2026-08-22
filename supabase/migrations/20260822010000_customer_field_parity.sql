-- Keep the linked customer and operational reservation complete when a website
-- quote is created. Existing staff-entered values always win; this only fills
-- blank fields from the original customer submission.
begin;

create or replace function public.sync_web_quote_customer_dob()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dob date;
begin
  if new.customer_id is null or nullif(trim(new.dob), '') is null then
    return new;
  end if;

  -- Public quote data is validated by the route, but this trigger must not
  -- make a booking fail if an old or manually-created quote has malformed DOB.
  begin
    v_dob := trim(new.dob)::date;
  exception when others then
    return new;
  end;

  update public.customers
     set dob = coalesce(dob, v_dob),
         updated_at = now()
   where id = new.customer_id
     and dob is null;

  return new;
end;
$$;

revoke all on function public.sync_web_quote_customer_dob()
  from public, anon, authenticated, service_role;

drop trigger if exists sync_web_quote_customer_dob on public.quotes;
create trigger sync_web_quote_customer_dob
  after insert or update of customer_id, dob on public.quotes
  for each row execute function public.sync_web_quote_customer_dob();

-- Repair only linked website-derived records with blank values. This does not
-- touch document fields: the public website never collects passport or licence
-- information, so inventing those dates would corrupt the customer record.
do $$
declare
  v_row record;
  v_dob date;
begin
  for v_row in
    select res.id as reservation_id,
           q.first_name, q.last_name, q.dob as quote_dob
      from public.reservations res
      join public.quotes q on q.id = res.quote_id
     where nullif(trim(res.customer_first_name), '') is null
        or nullif(trim(res.customer_last_name), '') is null
        or nullif(trim(res.customer_name), '') is null
        or res.customer_dob is null
  loop
    v_dob := null;
    if nullif(trim(v_row.quote_dob), '') is not null then
      begin
        v_dob := trim(v_row.quote_dob)::date;
      exception when others then
        v_dob := null;
      end;
    end if;

    update public.reservations
       set customer_first_name = coalesce(nullif(trim(customer_first_name), ''), nullif(trim(v_row.first_name), '')),
           customer_last_name = coalesce(nullif(trim(customer_last_name), ''), nullif(trim(v_row.last_name), '')),
           customer_name = coalesce(
             nullif(trim(customer_name), ''),
             nullif(concat_ws(' ', nullif(trim(v_row.first_name), ''), nullif(trim(v_row.last_name), '')), '')
           ),
           customer_dob = coalesce(customer_dob, v_dob),
           updated_at = now()
     where id = v_row.reservation_id;
  end loop;

  -- The customer master record is likewise filled only where DOB is blank.
  -- Newest quote wins if a customer made several requests before staff filled
  -- the profile; the date is parsed per row so a malformed historic value is
  -- ignored rather than aborting the complete migration.
  for v_row in
    select distinct on (q.customer_id)
           q.customer_id, q.dob as quote_dob
      from public.quotes q
      join public.customers c on c.id = q.customer_id
     where c.dob is null
       and q.customer_id is not null
       and nullif(trim(q.dob), '') is not null
     order by q.customer_id, q.created_at desc
  loop
    v_dob := null;
    begin
      v_dob := trim(v_row.quote_dob)::date;
    exception when others then
      v_dob := null;
    end;
    if v_dob is not null then
      update public.customers
         set dob = v_dob,
             updated_at = now()
       where id = v_row.customer_id
         and dob is null;
    end if;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
select 'REACHED THE END — customer field parity' as status;
commit;
