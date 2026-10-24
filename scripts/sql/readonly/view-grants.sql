-- Read-only. Who can reach the public VIEWS, which no existing check looks at.
--
-- WHY THIS EXISTS. Supabase removes the automatic Data API grant on
-- 30 October 2026. Migration 046 closed the nine *tables* created after 023's
-- blanket `grant on all tables in schema public`, and
-- `lib/serviceRoleGrants.test.ts` holds that closed. **Neither considered
-- views**, and `public.vehicle_open_damage` was created on 30 August 2026,
-- after 023 — so on a replayed database it would carry no grant at all, and
-- `app/api/admin/vehicles/damages/route.ts` reads it through `supabaseAdmin`
-- as `service_role`.
--
-- The nightly fingerprint cannot see this either: its grant section filters
-- `relkind in ('r','p')`, so a view's privileges are outside everything this
-- project inspects. That is the gap this query exists to measure, and it has
-- to be measured rather than assumed in both directions:
--
--   * service_role missing on a view breaks a replayed database after
--     30 October;
--   * anon or authenticated *present* on a view is a DEFINING-STATEMENTS §6
--     exposure — the grant is the boundary, and a view Supabase granted
--     automatically was never covered by 019's or 023's revokes, which named
--     tables.
--
-- Grants are read from the ACL with `aclexplode` rather than from
-- `information_schema`, for the reason established on 5 October: production's
-- `postgres` is not a superuser, and the information_schema views are scoped
-- to "currently enabled roles", so they silently omit grants made by another
-- grantor.
select
  c.relname                                        as view_name,
  coalesce(grantee.rolname, 'PUBLIC')              as grantee,
  string_agg(distinct acl.privilege_type, ', '
             order by acl.privilege_type)          as privileges
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) as acl
  left join pg_roles grantee on grantee.oid = acl.grantee
 where n.nspname = 'public'
   and c.relkind in ('v', 'm')
 group by 1, 2
 order by 1, 2;
