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
        select jsonb_object_agg(g.grantee, g.privs)
          from (
            select grantee, jsonb_agg(distinct privilege_type order by privilege_type) as privs
              from information_schema.role_table_grants
             where table_schema = 'public' and table_name = c.relname
               and grantee in ('anon', 'authenticated', 'service_role', 'postgres', 'PUBLIC')
             group by grantee
          ) g
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
      ), '[]'::jsonb)
    ))
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p')
  ), '{}'::jsonb),

  'views', coalesce((
    select jsonb_object_agg(c.relname, jsonb_build_object('kind', c.relkind))
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('v', 'm')
  ), '{}'::jsonb),

  'functions', coalesce((
    -- `prosecdef` is security definer, which is how a function hands out
    -- privileges its caller does not have. A new one is worth a look.
    select jsonb_object_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
      jsonb_build_object('security_definer', p.prosecdef, 'returns', pg_get_function_result(p.oid)))
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
  ), '{}'::jsonb),

  'extensions', coalesce((
    select jsonb_object_agg(e.extname, e.extversion) from pg_extension e
  ), '{}'::jsonb)
)) as fingerprint;
