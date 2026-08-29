-- SQL Editor copy of 20260828140000_drop_legacy_licence_number.sql. Same
-- statements; see that file for why it refuses rather than guesses.
-- Blueprint §4.5: driving_licence_number is the only column in the repository
-- baseline and the only one application code reads or writes, but on 25 August
-- 2026 production still carried both. §4.5 asks phase 1 to "verify the legacy
-- column is unused/empty, backfill any value that exists, then remove it".
--
-- Verified in the repository before writing this: grep across every .ts, .tsx
-- and .mjs finds no reference to licence_number outside supabase/schema.sql,
-- which is a dump of production rather than something that runs. Nothing reads
-- it, so dropping it cannot break a code path — the only risk is data held
-- ONLY there, which is what the backfill below is for.
--
-- IT REFUSES RATHER THAN GUESSES
--
-- Where a customer holds a different value in each column, there is no way to
-- tell from here which is current, and picking one silently is how the wrong
-- licence number ends up on a rental agreement. The migration raises and names
-- the count instead. Resolve those rows, then run it again.
--
-- Safe to run twice: if the column is already gone it reports so and does
-- nothing.
begin;

do $$
declare
  v_conflicts integer;
  v_backfilled integer;
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'customers'
       and column_name = 'licence_number'
  ) then
    raise notice 'customers.licence_number is already gone — nothing to do';
    return;
  end if;

  select count(*) into v_conflicts
    from public.customers
   where nullif(btrim(licence_number), '') is not null
     and nullif(btrim(driving_licence_number), '') is not null
     and btrim(licence_number) <> btrim(driving_licence_number);

  if v_conflicts > 0 then
    raise exception
      'refusing to drop licence_number: % customer row(s) hold a different value in each column. Resolve them first.',
      v_conflicts;
  end if;

  update public.customers
     set driving_licence_number = btrim(licence_number)
   where nullif(btrim(licence_number), '') is not null
     and nullif(btrim(driving_licence_number), '') is null;
  get diagnostics v_backfilled = row_count;
  raise notice 'backfilled % row(s) into driving_licence_number', v_backfilled;

  alter table public.customers drop column licence_number;
end;
$$;

notify pgrst, 'reload schema';
select 'REACHED THE END — legacy licence column' as status;
commit;
