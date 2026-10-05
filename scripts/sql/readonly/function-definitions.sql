-- The stored text of every function in `public`, so a definition difference can
-- be explained instead of guessed at.
--
-- WHY. The nightly fingerprint reports three `function.definition` differences
-- (`check_rate_limit`, `finalise_check_out_impl`,
-- `find_available_eligible_vehicle`) and the annotation truncates each one. Two
-- explanations fit, and they want opposite responses:
--
--   * the two servers deparse the same body differently -- the replay runs
--     PostgreSQL 18.3 under PGlite and production is 17.6 -- in which case the
--     answer is to match the versions, not to loosen the comparison; or
--   * the repository's SQL was edited after it was pasted, which is cosmetic and
--     is the same shape as W42.
--
-- `check_rate_limit` is already known to be the second kind: the difference is
-- two comment lines present in the migration and absent from production. The
-- other two are unestablished, and W49(b) and W52 are both waiting on which.
--
-- Postgres stores a function body verbatim, so this settles it: the text here is
-- what was actually run against production.
select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as function,
       md5(pg_get_functiondef(p.oid)) as digest,
       length(pg_get_functiondef(p.oid)) as characters
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.prokind in ('f', 'p')
   and not exists (
     select 1 from pg_depend d
      where d.objid = p.oid and d.classid = 'pg_proc'::regclass and d.deptype = 'e'
   )
 order by 1;

-- And the three in question, in full.
select pg_get_functiondef(p.oid) as definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('check_rate_limit', 'finalise_check_out_impl', 'find_available_eligible_vehicle')
 order by p.proname;
