-- The structural fingerprint of a database, as one row of JSON.
--
-- **Run against two databases and compared.** The *expected* side is the
-- migrations replayed into PGlite, which is what the repository says production
-- should be. The *actual* side is production itself. One file, two callers —
-- `DEFINING-STATEMENTS.md` §5's rule for pricing, applied here for the same
-- reason: two queries that drift produce a diff nobody can trust, and the first
-- response to an untrustworthy alarm is to mute it.
--
-- **It contains no data, by construction.** Every row this returns comes from a
-- catalog, never from a table: names, types, flags, grants, policy expressions.
-- The repository is public and the production database holds customers' dates of
-- birth, addresses and phone numbers (`.github/workflows/backup.yml` says so and
-- encrypts for it), so a fingerprint that could carry a value would be a leak
-- with a cron schedule. `tests/productionFingerprint.test.ts` asserts the output
-- of this file against a seeded database and fails if a seeded value appears in
-- it.
--
-- **Scope is the `public` schema.** `auth`, `storage`, `extensions` and
-- `graphql` are Supabase's, differ from PGlite by construction, and would make
-- every run noisy. Noise is the failure mode that kills a nightly check.
--
-- Row counts are deliberately NOT here. They change every hour of every day, so
-- they cannot be diffed against a baseline derived from migrations; they are
-- compared night-to-night instead, by `compareCounts` in
-- `scripts/productionFingerprint.mjs`.
select jsonb_pretty(jsonb_build_object(
  'tables', coalesce((
    select jsonb_object_agg(c.relname, jsonb_build_object(
      'rls_enabled', c.relrowsecurity,
      'rls_forced', c.relforcerowsecurity,
      'columns', coalesce((
        select jsonb_object_agg(a.attname, format_type(a.atttypid, a.atttypmod) ||
          case when a.attnotnull then ' not null' else '' end)
          from pg_attribute a
         where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
      ), '{}'::jsonb),
      'grants', coalesce((
        -- Grants are the boundary §6 is about: "The grant is the boundary; the
        -- policy is the filter." A table reachable by `anon` is readable whatever
        -- its policies say, so this is the field the severity rules key on.
        --
        -- The grantee list is an allow-list, and that is a deliberate trade with
        -- one obligation attached. Production carries a dozen platform roles
        -- PGlite has never heard of -- `supabase_admin`, `supabase_etl_admin`,
        -- `supabase_read_only_user`, `dashboard_user`, the `pg_*` built-ins --
        -- and listing them would put a grant row for every one of them on every
        -- table of every run, present on the production side and absent from the
        -- replayed side by construction. That is the noise that gets a nightly
        -- check muted.
        --
        -- **The obligation: a role this repository creates must be listed here,
        -- or the migration that creates it is invisible to the check.** Read on
        -- 4 October 2026 that `anadyon_audit` was not, which meant migration
        -- 047's six grants -- the mechanism by which `pgaudit` is told which
        -- objects to watch -- could be revoked in production and no run would
        -- say so. `tests/productionFingerprint.test.ts` now reads every
        -- `create role` in `supabase/migrations/` and fails naming any role
        -- missing from this list.
        --
        -- **Read from the table's own ACL, not from `information_schema`.**
        -- Changed 4 October 2026 after Codex's second review. Both relevant
        -- information_schema views are scoped to the connected role:
        -- `role_table_grants` "identifies all privileges granted on tables or
        -- views where the grantor or grantee is a currently enabled role" and
        -- "omits tables that have been made accessible to the current user by
        -- way of a grant to PUBLIC"; `table_privileges` is scoped the same way,
        -- so it is not the fix either. **A grant made by a role we are not a
        -- member of -- `supabase_admin`, for instance, which the dashboard runs
        -- as -- would therefore be invisible**, and that is precisely the change
        -- this check exists to find. `pg_class.relacl` expanded with
        -- `aclexplode` has no such scoping: it is the authoritative list,
        -- grantee `0` meaning `PUBLIC`.
        --
        -- Codex reported this as "PUBLIC grants are invisible", which is not
        -- quite it: a `grant select to public` issued by the connected role does
        -- appear, verified by firing it in a replayed database on 4 October. The
        -- defect is real and one step along -- the view hides a grant by a role
        -- we cannot see, PUBLIC or otherwise -- and the ACL closes both.
        select jsonb_object_agg(g.grantee, g.privs)
          from (
            select case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as grantee,
                   jsonb_agg(distinct a.privilege_type order by a.privilege_type) as privs
              from aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
             -- The SQL-standard seven, which is what `information_schema`
             -- reported and therefore what both sides of this comparison have
             -- always been read against. `MAINTAIN` is deliberately excluded:
             -- it arrived in PostgreSQL 17, the replayed side runs 17 under
             -- PGlite, and production's major version is not something this
             -- file controls -- so including it would print an extra privilege
             -- on every table of every run for no security question. It grants
             -- `vacuum`, `analyze`, `reindex` and `cluster`, never a read or a
             -- write of a row.
             where a.privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE',
                                        'TRUNCATE', 'REFERENCES', 'TRIGGER')
             group by 1
          ) g
         where g.grantee in ('anon', 'authenticated', 'service_role', 'postgres', 'PUBLIC',
                             'anadyon_audit')
      ), '{}'::jsonb),
      'policies', coalesce((
        select jsonb_object_agg(p.polname, jsonb_build_object(
          'command', p.polcmd,
          'permissive', p.polpermissive,
          'roles', (select coalesce(jsonb_agg(r.rolname order by r.rolname), '[]'::jsonb)
                      from pg_roles r where r.oid = any(p.polroles)),
          'using', pg_get_expr(p.polqual, p.polrelid),
          'check', pg_get_expr(p.polwithcheck, p.polrelid)
        ))
          from pg_policy p where p.polrelid = c.oid
      ), '{}'::jsonb),
      'triggers', coalesce((
        select jsonb_agg(t.tgname order by t.tgname)
          from pg_trigger t where t.tgrelid = c.oid and not t.tgisinternal
      ), '[]'::jsonb),
      'indexes', coalesce((
        select jsonb_agg(ic.relname order by ic.relname)
          from pg_index i join pg_class ic on ic.oid = i.indexrelid
         where i.indrelid = c.oid
      ), '[]'::jsonb),
      -- **Definitions, not just names.** Added 4 October 2026: Codex changed an
      -- existing index and trigger in a controlled probe and the comparison
      -- returned nothing, because the lists above hold names. An index narrowed
      -- to a partial one, or a trigger repointed at another function, keeps its
      -- name and does all of its work differently.
      'trigger_definitions', coalesce((
        select jsonb_object_agg(t.tgname, pg_get_triggerdef(t.oid))
          from pg_trigger t where t.tgrelid = c.oid and not t.tgisinternal
      ), '{}'::jsonb),
      'index_definitions', coalesce((
        select jsonb_object_agg(ic.relname, pg_get_indexdef(i.indexrelid))
          from pg_index i join pg_class ic on ic.oid = i.indexrelid
         where i.indrelid = c.oid
      ), '{}'::jsonb)
    ))
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p')
  ), '{}'::jsonb),

  -- Views and functions carry their **definitions** as well as their shape.
  -- Until 4 October 2026 they carried neither: a view was `{kind}` and a
  -- function `{security_definer, returns}`, and the comparison only noticed one
  -- appearing or disappearing. Codex flipped an existing function to
  -- `security definer` and redefined a view in a controlled probe, and the
  -- report stayed silent -- which is the single largest blind spot found in
  -- this check so far, because **a view is a stored select statement**: widening
  -- one to expose a column, or pointing it at another table, needs no new object
  -- at all.
  'views', coalesce((
    select jsonb_object_agg(c.relname, jsonb_build_object(
      'kind', c.relkind,
      'definition', pg_get_viewdef(c.oid, true)
    ))
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('v', 'm')
  ), '{}'::jsonb),

  'functions', coalesce((
    -- `prosecdef` is security definer, which is how a function hands out
    -- privileges its caller does not have. A new one is worth a look, and so is
    -- an existing one that becomes one.
    --
    -- `prokind` is restricted to functions and procedures because
    -- `pg_get_functiondef` raises on an aggregate or a window function, and an
    -- error here loses the whole fingerprint rather than one row.
    select jsonb_object_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
      jsonb_build_object(
        'security_definer', p.prosecdef,
        'returns', pg_get_function_result(p.oid),
        'definition', pg_get_functiondef(p.oid)
      ))
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind in ('f', 'p')
  ), '{}'::jsonb),

  -- **Every grantee the allow-list above does not read, named once.**
  -- Added 4 October 2026, and it closes the hole the allow-list leaves: a role
  -- created through the dashboard and granted `select` on `customers` would not
  -- appear in any table's `grants` map, because that map reads six named roles.
  -- Listing it per table would mean 29 rows for one finding, so this is one
  -- sorted list of names: a role that appears here appears once, and the
  -- question it asks -- who is this, and why can it read a customer table? --
  -- is answerable from the name alone.
  --
  -- The excluded names are the platform's own, which PGlite has never heard of
  -- and which would otherwise be permanent rows: Supabase's `supabase_*` family,
  -- the `pg_*` built-ins, PostgREST's `authenticator`, the dashboard's
  -- `dashboard_user`, and `pgbouncer`.
  'grantees', coalesce((
    select jsonb_agg(distinct g.grantee order by g.grantee)
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
      cross join lateral (
        select case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as grantee
      ) g
     where n.nspname = 'public' and c.relkind in ('r', 'p')
       and g.grantee not in ('anon', 'authenticated', 'service_role', 'postgres', 'PUBLIC',
                             'anadyon_audit', 'authenticator', 'dashboard_user', 'pgbouncer')
       and g.grantee not like 'pg\_%'
       and g.grantee not like 'supabase%'
  ), '[]'::jsonb),

  'extensions', coalesce((
    select jsonb_object_agg(e.extname, e.extversion) from pg_extension e
  ), '{}'::jsonb)
)) as fingerprint;
