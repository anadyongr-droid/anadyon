-- 047: see a READ of customer data, whatever role performs it.
--
-- WHY THIS EXISTS. The nightly production fingerprint compares structure, and a
-- structural diff can never show a read: selecting every customer row changes
-- no state. Fable's review established that as the sharpest limit on everything
-- else built this week, and `pgaudit` is the only thing that closes it.
--
-- WHY OBJECT AUDITING RATHER THAN ROLE AUDITING. The obvious form is
-- `alter role <r> set pgaudit.log = 'read'`, and it needs an answer to "which
-- role does the dashboard use?" — which could not be established. Three attempts
-- on 3 October: the Table Editor has no query box; `pg_stat_activity` showed no
-- new connection, because a dashboard read is a short-lived connection already
-- closed by the time the next query runs; and Postgres logs returned nothing,
-- because Supabase does not log connections or statements by default. All that
-- is *proven* is that the SQL editor is `postgres`, tagged
-- `supabase/dashboard-query-editor`.
--
-- Auditing the wrong role gives a log that is empty on exactly the activity it
-- was installed for — the inert control this project produced four times that
-- week. **Object auditing makes the question irrelevant:** name the tables, and
-- any role touching them is logged, including one nobody identified.
--
-- THE GRANTS BELOW DO NOT EXPOSE ANYTHING, and that needs saying plainly because
-- a reviewer reading `grant select on public.customers` should be alarmed.
-- `anadyon_audit` is created `nologin` with no members, so nothing can connect
-- as it or inherit it. Its privileges are never exercised; they are how
-- `pgaudit` is told which objects to watch, which is the documented mechanism.
-- `DEFINING-STATEMENTS.md` §6 — *the grant is the boundary* — holds exactly
-- because that boundary is unreachable here.
--
-- WHAT IS AUDITED, AND WHY NOT EVERYTHING. Reads are audited on the three tables
-- holding identity data, because a human reading those is the event worth
-- seeing. Writes only on the three the application reads constantly — the admin
-- mailbox view and delivery status poll them, and read-auditing those would
-- produce a log nobody can read, which is how auditing gets switched off.
--
--   read + write : customers, reservations, quotes
--   write only   : booking_email_deliveries, booking_email_events, emails
--
-- TWO THINGS MAY BE REFUSED, and each is wrapped so the rest still applies.
-- `pgaudit.log` and `pgaudit.role` are superuser-set parameters, and `postgres`
-- on Supabase is not a superuser (`rolsuper = false`, read from production on
-- 3 October). If the `alter` statements are refused, the extension, the role and
-- the grants are still in place and only the switch is missing — enable pgaudit
-- from **Dashboard → Database → Extensions**, then re-run this file. The
-- exception handlers exist so a PGlite replay and a partial grant do not fail
-- the whole migration; they are NOT permission to assume it worked.
--
-- VERIFY AFTER APPLYING — this migration is not done until this returns a row:
--
--   select setdatabase::regclass::text as db, setconfig
--     from pg_db_role_setting
--    where array_to_string(setconfig, ',') like '%pgaudit%';
--
-- If it returns nothing, auditing is NOT on, whatever this file printed.

do $$
begin
  create extension if not exists pgaudit;
exception when others then
  raise notice '047: pgaudit extension unavailable here (%) — the role and grants below still apply', sqlerrm;
end
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anadyon_audit') then
    create role anadyon_audit nologin noinherit;
  end if;
end
$$;

grant select, insert, update, delete on public.customers to anadyon_audit;
grant select, insert, update, delete on public.reservations to anadyon_audit;
grant select, insert, update, delete on public.quotes to anadyon_audit;

grant insert, update, delete on public.booking_email_deliveries to anadyon_audit;
grant insert, update, delete on public.booking_email_events to anadyon_audit;
grant insert, update, delete on public.emails to anadyon_audit;

do $$
begin
  execute format('alter database %I set pgaudit.role = %L', current_database(), 'anadyon_audit');
exception when others then
  raise notice '047: could not set pgaudit.role (%) — enable pgaudit from the dashboard and re-run', sqlerrm;
end
$$;

do $$
begin
  alter role postgres set pgaudit.log = 'ddl, role, write';
exception when others then
  raise notice '047: could not set pgaudit.log on postgres (%)', sqlerrm;
end
$$;

do $$
begin
  alter role supabase_admin set pgaudit.log = 'ddl, role';
exception when others then
  raise notice '047: could not set pgaudit.log on supabase_admin (%) — expected where that role does not exist', sqlerrm;
end
$$;
