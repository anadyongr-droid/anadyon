begin;

create table if not exists public.booking_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  kind text not null check (kind in ('quote_confirmation')),
  intended_recipient_email text not null,
  delivery_recipient_email text not null,
  subject text not null,
  payment_deadline timestamptz,
  provider text not null default 'resend' check (provider in ('resend')),
  provider_message_id text,
  status text not null default 'pending' check (status in (
    'pending', 'queued', 'accepted', 'sent', 'delivered', 'delayed',
    'bounced', 'complained', 'failed', 'suppressed'
  )),
  redirected boolean not null default false,
  accepted_at timestamptz,
  delivered_at timestamptz,
  last_event_at timestamptz,
  last_webhook_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_message_id)
);

create index if not exists booking_email_deliveries_reservation_idx
  on public.booking_email_deliveries (reservation_id, created_at desc);

create table if not exists public.booking_email_events (
  svix_id text primary key,
  delivery_id uuid not null references public.booking_email_deliveries(id) on delete cascade,
  provider_message_id text not null,
  event_type text not null,
  recipient_email text not null,
  event_created_at timestamptz not null,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists booking_email_events_delivery_idx
  on public.booking_email_events (delivery_id, event_created_at desc);

alter table public.booking_email_deliveries enable row level security;
alter table public.booking_email_events enable row level security;

revoke all on table public.booking_email_deliveries from public, anon, authenticated;
revoke all on table public.booking_email_events from public, anon, authenticated;
grant select, insert, update, delete on table public.booking_email_deliveries to service_role;
grant select, insert, update, delete on table public.booking_email_events to service_role;

create or replace function public.record_booking_email_event(
  p_delivery_id uuid,
  p_svix_id text,
  p_email_id text,
  p_event_type text,
  p_event_created_at timestamptz,
  p_recipient text,
  p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery public.booking_email_deliveries%rowtype;
  v_status text;
  v_inserted boolean := false;
  v_changed boolean := false;
begin
  if p_delivery_id is null or p_svix_id is null or p_email_id is null
     or p_event_created_at is null or nullif(trim(p_recipient), '') is null then
    return jsonb_build_object('matched', false, 'changed', false, 'duplicate', false);
  end if;

  select * into v_delivery
    from public.booking_email_deliveries
   where id = p_delivery_id
     and lower(delivery_recipient_email) = lower(trim(p_recipient))
   for update;

  if not found then
    return jsonb_build_object('matched', false, 'changed', false, 'duplicate', false);
  end if;

  insert into public.booking_email_events (
    svix_id, delivery_id, provider_message_id, event_type,
    recipient_email, event_created_at, error
  ) values (
    p_svix_id, p_delivery_id, p_email_id, p_event_type,
    trim(p_recipient), p_event_created_at, left(p_error, 1000)
  )
  on conflict (svix_id) do nothing
  returning true into v_inserted;

  if not coalesce(v_inserted, false) then
    return jsonb_build_object('matched', true, 'changed', false, 'duplicate', true);
  end if;

  v_status := case p_event_type
    when 'email.sent' then 'sent'
    when 'email.delivered' then 'delivered'
    when 'email.delivery_delayed' then 'delayed'
    when 'email.bounced' then 'bounced'
    when 'email.complained' then 'complained'
    when 'email.failed' then 'failed'
    when 'email.suppressed' then 'suppressed'
    else null
  end;

  if v_status is not null and (
    v_delivery.last_event_at is null
    or p_event_created_at >= v_delivery.last_event_at
  ) then
    update public.booking_email_deliveries
       set provider_message_id = coalesce(provider_message_id, p_email_id),
           status = v_status,
           delivered_at = case
             when p_event_type = 'email.delivered' then p_event_created_at
             else delivered_at
           end,
           last_event_at = p_event_created_at,
           last_webhook_id = p_svix_id,
           last_error = case
             when p_event_type in ('email.bounced', 'email.delivery_delayed', 'email.failed', 'email.suppressed')
               then left(p_error, 1000)
             when p_event_type in ('email.sent', 'email.delivered') then null
             else last_error
           end,
           updated_at = now()
     where id = p_delivery_id;
    v_changed := true;
  end if;

  return jsonb_build_object(
    'matched', true,
    'changed', v_changed,
    'duplicate', false,
    'status', case when v_changed then v_status else v_delivery.status end
  );
end;
$$;

revoke all on function public.record_booking_email_event(uuid, text, text, text, timestamptz, text, text)
  from public, anon, authenticated;
grant execute on function public.record_booking_email_event(uuid, text, text, text, timestamptz, text, text)
  to service_role;

commit;

select 'REACHED THE END — booking email delivery audit' as result;
