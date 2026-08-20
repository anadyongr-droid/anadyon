-- 023_least_privilege_grants.sql  — paste this whole block into the Supabase SQL editor.
-- Wrapped in a transaction: if the paste is cut short, nothing is applied.
begin;

revoke all privileges on all tables    in schema public from public, anon, authenticated;
revoke all privileges on all sequences in schema public from public, anon, authenticated;
revoke all privileges on all functions in schema public from public, anon, authenticated;
grant select on rates          to anon, authenticated;
grant select on extras_config  to anon, authenticated;
alter default privileges in schema public
  revoke all on tables    from public, anon, authenticated;
alter default privileges in schema public
  revoke all on sequences from public, anon, authenticated;
alter default privileges in schema public
  revoke all on functions from public, anon, authenticated;
grant all privileges on all tables    in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant all privileges on all functions in schema public to service_role;
create or replace function assert_least_privilege()
returns table(grantee text, table_name text, privilege_type text)
language sql
security definer
set search_path = public
as $$
  select g.grantee::text, g.table_name::text, g.privilege_type::text
    from information_schema.role_table_grants g
   where g.table_schema = 'public'
     and g.grantee in ('PUBLIC', 'anon', 'authenticated')
     and not (g.table_name in ('rates', 'extras_config') and g.privilege_type = 'SELECT')
   order by g.grantee, g.table_name, g.privilege_type;
$$;
revoke all on function assert_least_privilege() from public, anon, authenticated;
grant execute on function assert_least_privilege() to service_role;

select 'REACHED THE END' as status;
commit;
