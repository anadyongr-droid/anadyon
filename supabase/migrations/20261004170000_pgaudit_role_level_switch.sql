-- 049: arm the object audit the way Supabase actually permits -- at the role.
--
-- WHY THIS EXISTS, AND IT IS A DEFECT IN 047 RATHER THAN A REFINEMENT.
-- Migration 047 set the object-audit switch with
--
--   alter database <current> set pgaudit.role = 'anadyon_audit'
--
-- wrapped in an exception handler, on the reasoning that `pgaudit.role` is a
-- superuser-set parameter and might be refused. It was refused -- and the header
-- then told the operator to enable the extension from the dashboard and re-run
-- the file, which would have failed identically, for ever.
--
-- **It could never have worked on Supabase.** Their own documentation for the
-- extension says so: *"Supabase limits full privileges for file system and
-- database variables, meaning PGAudit modifications can only occur at the role
-- level."* The recipe they publish for object auditing is exactly three
-- statements, and the middle one is the role form:
--
--   create role "some_audit_role" noinherit;
--   alter role "postgres" set pgaudit.role to 'some_audit_role';
--   grant select on random_table to "some_audit_role";
--
-- 047 did the first and the third. This does the second.
--
-- HOW IT WAS CAUGHT, because the method is the reusable part. The status query
-- after 047 was pasted returned `switch_rows 1`, and I read that as "the switch
-- is set". It is not: it says *a* row in `pg_db_role_setting` mentions pgaudit,
-- not which one. Reading the row itself showed only
-- `pgaudit.log=ddl, role, write` on `postgres` -- so writes, DDL and role
-- changes were being logged and **reads were not**, which is the one thing 047
-- existed for. A count is not an identity.
--
-- WHAT THIS AUDITS, AND THE SCOPE CLAIM IN 047 IS NARROWER THAN WRITTEN.
-- 047's header says object auditing means "any role touching them is logged,
-- including one nobody identified". That is true of the *database-level* switch,
-- which Supabase does not allow. At the role level the audit applies to sessions
-- of the role it is set on -- here `postgres`, which is **what the dashboard SQL
-- editor runs as** (verified 3 October: `supabase/dashboard-query-editor`).
--
-- So this covers precisely the path every review called the hardest and no other
-- control can see: a person reading customer data in a logged-in browser. It
-- does **not** cover the application's own reads, which arrive as
-- `authenticator` -> `anon`/`authenticated`/`service_role`. Auditing those would
-- log every admin page view, and a log nobody can read is how auditing gets
-- switched off -- the same reasoning 047 used to audit writes rather than reads
-- on the three email tables. Recorded as a deliberate limit, not an oversight.
--
-- THE SECOND STATEMENT KEEPS THE NIGHTLY CHECK HONEST. 047's database-level
-- `set` succeeded in the PGlite replay -- a dotted parameter name is accepted as
-- a custom placeholder -- and can never succeed in production. Left alone, the
-- replayed side would carry a setting production cannot have, and the fingerprint
-- would report it every night for ever. `reset` removes it from the replay and is
-- a no-op in production, where it was never set. Permanent noise is the specific
-- way a nightly check dies.
--
-- VERIFY AFTER APPLYING -- this migration is not done until the second row
-- appears:
--
--   select coalesce(d.datname, '(all databases)') as db,
--          coalesce(r.rolname, '(all roles)') as role,
--          (select array_agg(e) from unnest(s.setconfig) e where e like 'pgaudit%')
--     from pg_db_role_setting s
--     left join pg_database d on d.oid = s.setdatabase
--     left join pg_roles r on r.oid = s.setrole
--    where array_to_string(s.setconfig, ',') like '%pgaudit%';
--
-- Expect two rows for `postgres`: `pgaudit.log=ddl, role, write` and
-- `pgaudit.role=anadyon_audit`. **One row means the switch is still off.**

alter role postgres set pgaudit.role to 'anadyon_audit';

do $$
begin
  execute format('alter database %I reset pgaudit.role', current_database());
exception when others then
  raise notice '049: could not reset the database-level pgaudit.role (%) — expected in production, where it was never set', sqlerrm;
end
$$;

do $$
begin
  raise notice 'REACHED THE END — pgaudit object auditing armed at the role level';
end;
$$;
