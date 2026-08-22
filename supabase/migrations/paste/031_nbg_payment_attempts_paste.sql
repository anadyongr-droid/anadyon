-- Paste-safe copy of 20260822180000_nbg_payment_attempts.sql.
-- Card data never reaches this table.
begin;

create table if not exists public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  provider text not null check (provider in ('nbg')),
  environment text not null check (environment in ('test', 'production')),
  purpose text not null default 'deposit' check (purpose in ('deposit')),
  external_order_id text not null check (char_length(external_order_id) between 1 and 40),
  external_session_id text,
  checkout_url text,
  amount numeric(10,2) not null check (amount > 0),
  currency text not null default 'EUR' check (currency = 'EUR'),
  status text not null default 'initiated'
    check (status in ('initiated', 'pending', 'paid', 'failed', 'cancelled', 'expired', 'review')),
  success_indicator text,
  gateway_result text,
  expires_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, environment, external_order_id)
);

comment on table public.payment_attempts is
  'Hosted-payment reconciliation metadata only. Never store PAN, CVC, card expiry or authentication data.';

create index if not exists payment_attempts_reservation_status_idx
  on public.payment_attempts (reservation_id, provider, status, created_at desc);
create unique index if not exists payment_attempts_one_active_deposit_idx
  on public.payment_attempts (reservation_id, provider, environment, purpose)
  where status in ('initiated', 'pending');

alter table public.payment_attempts enable row level security;
revoke all on table public.payment_attempts from public, anon, authenticated;
grant all on table public.payment_attempts to service_role;

drop trigger if exists payment_attempts_set_updated_at on public.payment_attempts;
create trigger payment_attempts_set_updated_at
  before update on public.payment_attempts
  for each row execute function public.set_updated_at();

create or replace function public.complete_nbg_deposit_payment(
  p_attempt_id uuid,
  p_gateway_result text,
  p_paid_at timestamptz
) returns table (reservation_id uuid, applied boolean, amount numeric)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_attempt public.payment_attempts%rowtype;
  v_reservation public.reservations%rowtype;
begin
  select * into v_attempt from public.payment_attempts
   where id = p_attempt_id for update;
  if not found then raise exception 'payment attempt not found'; end if;
  if v_attempt.provider <> 'nbg' or v_attempt.purpose <> 'deposit' then
    raise exception 'payment attempt is not an NBG deposit';
  end if;
  if v_attempt.status = 'paid' then
    return query select v_attempt.reservation_id, false, v_attempt.amount;
    return;
  end if;
  if v_attempt.status not in ('initiated', 'pending') then
    raise exception 'payment attempt cannot be completed from status %', v_attempt.status;
  end if;
  select * into v_reservation from public.reservations
   where id = v_attempt.reservation_id for update;
  if not found then raise exception 'reservation not found'; end if;
  if v_reservation.deposit_paid_at is not null then
    raise exception 'reservation deposit is already recorded as paid';
  end if;
  if v_reservation.status in ('cancelled', 'voided', 'no_show') then
    raise exception 'reservation is not payable in status %', v_reservation.status;
  end if;
  if v_attempt.currency <> 'EUR'
     or abs(coalesce(v_reservation.deposit, 0)::numeric - v_attempt.amount) >= 0.01 then
    raise exception 'payment amount does not match reservation deposit';
  end if;
  update public.payment_attempts
     set status = 'paid', paid_at = p_paid_at,
         gateway_result = left(coalesce(p_gateway_result, 'SUCCESS'), 100)
   where id = p_attempt_id;
  update public.reservations
     set status = case when status = 'pending' then 'confirmed' else status end,
         deposit_paid_at = p_paid_at
   where id = v_attempt.reservation_id;
  return query select v_attempt.reservation_id, true, v_attempt.amount;
end;
$$;

revoke all on function public.complete_nbg_deposit_payment(uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.complete_nbg_deposit_payment(uuid, text, timestamptz)
  to service_role;

notify pgrst, 'reload schema';
commit;

select 'REACHED THE END' as migration_status;
