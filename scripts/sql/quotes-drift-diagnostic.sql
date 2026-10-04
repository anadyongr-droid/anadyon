-- Read-only. What has to be known before any of W42's twelve columns is altered.
--
-- WHY THIS EXISTS. The nightly fingerprint established on 4 October 2026 that
-- production's `quotes` is looser than `001_baseline.sql` in twelve columns, and
-- `docs/MIGRATION-REPLAY-RESULT-2026-08-30.md` establishes why: the baseline was
-- never run, and migration 010's `ADD COLUMN IF NOT EXISTS` can only add a
-- missing column, never change a type or add a constraint.
--
-- **A tightening migration written without this answer would fail halfway
-- through, on live data, in the SQL editor.** `alter column pickup_date type
-- date` raises on the first row that is not a parseable date; `set not null`
-- raises on the first null; `type numeric(10,2)` raises if a value needs more
-- than eight digits to the left of the point. Each of those leaves the earlier
-- statements applied and the rest not, which is the worst outcome available.
--
-- So: run this first, send the three rows back, and the migration is written
-- against what is there rather than against what is hoped for.
--
-- HOW TO RUN IT. Supabase dashboard -> SQL Editor -> paste the whole file ->
-- Run. It reads nothing but `public.quotes` and writes nothing. It returns one
-- row per check, with a count.

-- 1. The two date columns, held as `text` in production and `date not null` in
--    the baseline. `pickup_date::date` is attempted in a sub-select so a bad
--    value is counted rather than raising.
select
  'dates that will not cast' as check,
  count(*) filter (where pickup_date is not null and pickup_date !~ '^\d{4}-\d{2}-\d{2}$') as pickup_date_unparseable,
  count(*) filter (where dropoff_date is not null and dropoff_date !~ '^\d{4}-\d{2}-\d{2}$') as dropoff_date_unparseable,
  count(*) filter (where pickup_date is null) as pickup_date_null,
  count(*) filter (where dropoff_date is null) as dropoff_date_null
  from public.quotes

union all

-- 2. The four columns the baseline declares `not null`. §4 names first name,
--    surname and email as the minimum to save a reservation, so a null here is
--    a row the public form could not have produced.
select
  'nulls in columns the baseline requires',
  count(*) filter (where email is null),
  count(*) filter (where first_name is null),
  count(*) filter (where last_name is null),
  count(*) filter (where vehicle_type is null)
  from public.quotes

union all

-- 3. The six money columns, `numeric(10,2)` in the baseline and bare `numeric`
--    in production. Two different questions: a value that would not fit, and a
--    value carrying more than two decimal places, which is a price that was
--    stored unrounded.
select
  'money that would not fit numeric(10,2)',
  count(*) filter (where abs(coalesce(total, 0)) >= 100000000
                      or abs(coalesce(deposit, 0)) >= 100000000
                      or abs(coalesce(balance_due, 0)) >= 100000000
                      or abs(coalesce(daily_rate, 0)) >= 100000000
                      or abs(coalesce(vehicle_subtotal, 0)) >= 100000000
                      or abs(coalesce(extras_subtotal, 0)) >= 100000000),
  count(*) filter (where total <> round(total, 2)
                      or deposit <> round(deposit, 2)
                      or balance_due <> round(balance_due, 2)),
  count(*) filter (where daily_rate <> round(daily_rate, 2)
                      or vehicle_subtotal <> round(vehicle_subtotal, 2)
                      or extras_subtotal <> round(extras_subtotal, 2)),
  (select count(*) from public.quotes)
  from public.quotes;

-- The column names in the output are the first query's, because `union all`
-- takes them from the first branch. Read them positionally:
--
--   row 1: unparseable pickup, unparseable dropoff, null pickup, null dropoff
--   row 2: null email, null first_name, null last_name, null vehicle_type
--   row 3: values too large, totals with >2 decimals, rates with >2 decimals,
--          and the table's own row count as the denominator
