-- PASTE THIS INTO THE SUPABASE DASHBOARD'S SQL EDITOR (production), and paste
-- the result back into open item W31. Read-only; it changes nothing.
--
-- **Why one query is blocking a whole control.** The nightly fingerprint
-- (section 17 of docs/STAGING-AND-OBSERVABILITY-RUNBOOK.md) sees structural
-- change. It cannot see a **read**: selecting every customer row changes no
-- state, so no state diff will ever show it. Fable's review established that,
-- and it is the sharpest limit on everything built so far.
--
-- `pgaudit` is the only thing that sees a read. On Supabase it is configured
-- **per role** — `alter role <r> set pgaudit.log = 'read, write'` — so auditing
-- the wrong role produces a log that is empty on exactly the activity we care
-- about, while looking switched on. That is the failure mode this project keeps
-- hitting: a control that is present and inert.
--
-- The dashboard's table editor and SQL editor do not necessarily run as
-- `postgres`. Which role they use decides what the migration must name, and it
-- cannot be read from here: an agent session has no dashboard. So the migration
-- is NOT written until this answer exists — guessing it would produce exactly
-- the inert control described above, and `AGENTS.md` says to check before
-- building.
--
-- Run it in BOTH editors if they might differ: the table editor (via any query
-- it lets you run) and the SQL editor.
select
  current_user                     as current_user,          -- the effective role
  session_user                     as session_user,          -- the role that logged in
  current_setting('role', true)    as role_setting,           -- set by the dashboard, if any
  current_setting('request.jwt.claims', true) as jwt_claims,  -- present when it goes through PostgREST
  inet_client_addr()               as client_address,
  version()                        as server_version;

-- Then, so the migration can name roles that exist rather than roles we assume:
select rolname, rolsuper, rolbypassrls, rolcanlogin
  from pg_roles
 where rolcanlogin or rolsuper or rolbypassrls
 order by rolname;

-- And what, if anything, is already audited:
select r.rolname, s.setconfig
  from pg_db_role_setting s
  join pg_roles r on r.oid = s.setrole
 where array_to_string(s.setconfig, ',') like '%pgaudit%';
