-- The platform roles a Supabase dump names and a plain Postgres has never
-- heard of. Applied to the throwaway restore target only.
--
-- WHY THIS IS NOT IN `scripts/pgliteSupabaseStubs.mjs`. That file is the
-- fixture for the migration replay, which is a merge gate. Adding roles to it
-- to make an unrelated job quieter would change what the gate tests, and its
-- own header is explicit that one shared copy exists so the gate and the tests
-- cannot drift. This is the opposite situation: these roles are not part of
-- what our migrations assume, they are what `supabase db dump` writes into its
-- `ALTER ... OWNER TO` and `GRANT` statements because that is who owns things
-- in a real Supabase project.
--
-- Creating them is not pretending to be Supabase. It removes a class of error
-- that would otherwise bury a real one: `scripts/restoreDrill.mjs` tolerates
-- these by pattern, and a hundred tolerated lines are a hundred places for a
-- genuine failure to hide.
--
-- `nologin` throughout. Nothing connects as them; what matters is that the
-- names resolve.
do $$
declare
  platform_role text;
begin
  foreach platform_role in array array[
    'supabase_admin',
    'supabase_auth_admin',
    'supabase_storage_admin',
    'supabase_read_only_user',
    'supabase_realtime_admin',
    'supabase_replication_admin',
    'dashboard_user',
    'authenticator',
    'pgbouncer'
  ] loop
    if not exists (select 1 from pg_roles where rolname = platform_role) then
      execute format('create role %I nologin', platform_role);
    end if;
  end loop;
end
$$;

-- Schemas a Supabase dump references in passing. `auth` and `storage` come
-- from the shared stubs; these are the rest.
create schema if not exists extensions;
create schema if not exists graphql;
create schema if not exists graphql_public;
create schema if not exists realtime;
create schema if not exists vault;
