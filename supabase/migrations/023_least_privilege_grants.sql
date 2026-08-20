-- Removes every residual privilege from PUBLIC, anon and authenticated.
--
-- Migration 019 revoked SELECT on ten tables, which closed the leak that
-- prompted it. It left the rest: anon and authenticated still hold INSERT,
-- UPDATE, DELETE, TRUNCATE, REFERENCES and TRIGGER on internal tables, and
-- authenticated still holds SELECT on quotes, reservations, vehicles and the
-- vehicle cost and damage tables.
--
-- Nothing is exposed by this today. RLS is enabled with no permissive policy,
-- so the row filter refuses everything regardless of the grant, and probing
-- production with the anon key returns 401 on both select and insert for every
-- table checked.
--
-- The point is that it should fail twice. Least privilege is not a single
-- barrier; a policy added later in good faith — "let staff read their own
-- reservations" — would silently inherit whatever grants happen to remain.
-- Removing them means such a policy grants exactly what it says and nothing
-- that was lying around.
--
-- The two genuinely public tables are re-granted explicitly afterwards, so the
-- exception is stated rather than left over.

-- ── Everything, from everyone ─────────────────────────────────────────────
revoke all privileges on all tables    in schema public from public, anon, authenticated;
revoke all privileges on all sequences in schema public from public, anon, authenticated;
revoke all privileges on all functions in schema public from public, anon, authenticated;

-- ── The deliberate exceptions ─────────────────────────────────────────────
-- Correction to an earlier claim in this file: the booking form does NOT read
-- these with the anon key. Every read of rates and extras_config goes through
-- supabaseAdmin — lib/ratesServer.ts, /api/quote, /api/admin/rates and the
-- competitor comparison — and the browser bundle makes no table reads at all;
-- its Supabase client is used only for auth.
--
-- So these two grants are not required by anything today. They are kept
-- anyway, deliberately and narrowly: SELECT on the pricing figures that are
-- already printed on the public website, carrying no personal data. The cost
-- of keeping them is close to nothing, and removing them on a live booking
-- path to gain nothing measurable is the wrong trade — if the grep above ever
-- missed a caller, the failure would land on the form customers use to book.
--
-- If they are ever removed, do it separately from this migration and watch the
-- booking form directly afterwards.
grant select on rates          to anon, authenticated;
grant select on extras_config  to anon, authenticated;

-- ── And for anything created later ────────────────────────────────────────
-- Without this, the next `create table` arrives carrying the default grants
-- and the work above quietly undoes itself one migration at a time.
alter default privileges in schema public
  revoke all on tables    from public, anon, authenticated;
alter default privileges in schema public
  revoke all on sequences from public, anon, authenticated;
alter default privileges in schema public
  revoke all on functions from public, anon, authenticated;

-- ── Service role keeps what it needs ──────────────────────────────────────
-- Every application path runs through the service role behind an
-- authenticated route; the revokes above must not reach it.
grant all privileges on all tables    in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant all privileges on all functions in schema public to service_role;

-- ── A way to check, rather than assume ────────────────────────────────────
-- Returns any privilege held by a role that should hold none. Empty means the
-- intended state. Called by scripts/check-grants.mjs so this is verified from
-- CI rather than remembered.
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

-- Explicit, not inherited. scripts/check-grants.mjs calls this over PostgREST
-- with the service role key, so service_role must hold EXECUTE.
--
-- It very likely would anyway: Supabase ships default privileges granting new
-- functions to service_role, which is why migration 014's functions are
-- callable today despite the same revoke. But this migration exists to stop
-- depending on grants that merely happen to be there, and it would be a poor
-- joke for the check that proves least privilege to be the one thing relying
-- on an inherited default. It is also created after the ALTER DEFAULT
-- PRIVILEGES above, which is exactly the kind of ordering that makes inherited
-- behaviour hard to reason about.
grant execute on function assert_least_privilege() to service_role;
