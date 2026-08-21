-- Run this first in the Supabase SQL editor. It is safe on its own: the
-- current booking function continues working until the next, short paste.
begin;
alter table public.reservations
  add column if not exists quote_id uuid references public.quotes(id) on delete set null;
create unique index if not exists reservations_quote_id_uniq
  on public.reservations (quote_id) where quote_id is not null;
notify pgrst, 'reload schema';
select 'REACHED THE END' as status;
commit;
