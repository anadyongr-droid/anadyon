-- 048: make production's `quotes` match the baseline it was never built from.
--
-- WHY THIS EXISTS. The nightly production fingerprint found twelve `quotes`
-- columns, one missing index and one undeclared policy differing from
-- `001_baseline.sql`. `docs/MIGRATION-REPLAY-RESULT-2026-08-30.md` establishes
-- why, and it is not drift: **the baseline was never run against production.**
-- `supabase/schema.sql` creates five tables and no `quotes`; the root
-- `supabase-migration.sql` only `ALTER`s one, assuming it already existed; and
-- migration `010_close_schema_drift.sql` said so in its own header on 15 August
-- -- "The baseline declares columns the live database never received."
--
-- 010 repaired the subset that was making pages error, using
-- `ADD COLUMN IF NOT EXISTS`. That form can only ever add a *missing column*:
-- it cannot change a type, cannot add a constraint, and says nothing about an
-- index. So every difference of **shape** survived it, invisibly, for seven
-- weeks. This migration closes the shape.
--
-- RUN THE DIAGNOSTIC FIRST -- IT ALREADY WAS. Every statement below would fail
-- on the wrong data: `type date` raises on the first unparseable value,
-- `set not null` on the first null, `numeric(10,2)` on a value needing more than
-- eight digits left of the point -- and a failure halfway leaves the earlier
-- statements applied and the rest not. `scripts/sql/quotes-drift-diagnostic.sql`
-- was run against production on 4 October 2026 and returned **zero** for every
-- one of those: no unparseable date, no null in a column the baseline requires,
-- no money value that would not fit, and nothing carrying more than two decimal
-- places, across **19 rows**.
--
-- **If it fails anyway, a row arrived between that reading and this paste.**
-- Re-run the diagnostic rather than loosening a statement to get past it.
--
-- WHAT THIS DOES NOT CHANGE, because the rule it would otherwise cross is
-- `DEFINING-STATEMENTS.md` §13: no price, term, fee, cover, eligibility rule or
-- customer communication is touched, and no staff member gains or loses an
-- action. It tightens three columns' *types* and four columns' *nullability* to
-- what the repository has declared since 15 August. The fields §4 calls
-- deferrable -- date of birth, nationality, flight number -- are deliberately
-- left nullable.
--
-- NO EXPECTED-CHANGE MARKER IS NEEDED, and the reason is worth stating because
-- it shows what a marker is for. A marker covers the window in which the
-- *replay* carries something production does not -- a declared migration waiting
-- to be pasted. Here the replay has carried all of it since August; this
-- migration brings **production** up to the replay. The only line that adds
-- anything to the replay is the policy below, which production already has, so
-- it closes a difference rather than opening one.

-- ---------------------------------------------------------------------------
-- 1. The two dates. Held as nullable `text` in production, `date not null` in
--    the baseline. This is the class with a consequence outside the database:
--    `lib/aadeXml.ts` places `pickup_date` directly into `<issueDate>` for the
--    Greek tax authority, so a value a `date` column would have refused was
--    instead refused by AADE, after the rental.
alter table public.quotes alter column pickup_date  type date using pickup_date::date;
alter table public.quotes alter column dropoff_date type date using dropoff_date::date;
alter table public.quotes alter column pickup_date  set not null;
alter table public.quotes alter column dropoff_date set not null;

-- ---------------------------------------------------------------------------
-- 2. The four columns the baseline requires. §4 names first name, surname and
--    email as the minimum to save a reservation, and the public form is a gate
--    that refuses an incomplete booking -- so a null in any of these is a row
--    that form could not have produced.
alter table public.quotes alter column email        set not null;
alter table public.quotes alter column first_name   set not null;
alter table public.quotes alter column last_name    set not null;
alter table public.quotes alter column vehicle_type set not null;

-- ---------------------------------------------------------------------------
-- 3. The six money columns, `numeric(10,2)` in the baseline and bare `numeric`
--    in production, where nothing at the column enforces two decimal places.
--    `lib/pricing.ts` is the only implementation and the server's result is what
--    is stored (§5), which is why no bad row exists today; this makes the column
--    say so as well.
alter table public.quotes alter column daily_rate       type numeric(10,2);
alter table public.quotes alter column vehicle_subtotal type numeric(10,2);
alter table public.quotes alter column extras_subtotal  type numeric(10,2);
alter table public.quotes alter column total            type numeric(10,2);
alter table public.quotes alter column deposit          type numeric(10,2);
alter table public.quotes alter column balance_due      type numeric(10,2);

-- ---------------------------------------------------------------------------
-- 4. The index `001_baseline.sql` declares and production has never had.
create index if not exists quote_rate_limits_blocked_idx
  on public.quote_rate_limits (blocked_until);

-- ---------------------------------------------------------------------------
-- 5. Declare the policy production already has.
--
--    `Service role only` on `quotes` -- `for all to public using (false)` --
--    exists nowhere in `supabase/`, and that name is Supabase's dashboard
--    naming: it was created through the dashboard, outside every control this
--    project has. It is a **deny-all** policy, so it exposes nothing; it is the
--    belt beside §6's braces, where the grant is the boundary. Declaring it is
--    how an object stops being one nobody can account for.
--
--    Created only when absent, never dropped and recreated. Production keeps the
--    policy it has, and a fresh database gets the same one.
do $$
begin
  if not exists (
    select 1 from pg_policy
     where polrelid = 'public.quotes'::regclass
       and polname = 'Service role only'
  ) then
    create policy "Service role only" on public.quotes for all to public using (false);
  end if;
end
$$;

do $$
begin
  raise notice 'REACHED THE END — quotes match the baseline';
end;
$$;
