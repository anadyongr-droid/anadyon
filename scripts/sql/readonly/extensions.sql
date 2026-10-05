-- Every extension installed in production, with its version.
--
-- WHY. The nightly fingerprint has never compared the extension list, because
-- the replay carries only `plpgsql` while production carries Supabase's set. On
-- 4 October objects an extension *owns* were excluded too, so `pgaudit`'s own
-- functions would stop being nightly noise. Together those made installing an
-- extension invisible -- found by Codex on 5 October, who reproduced it.
--
-- `supabase/expected-extensions.json` is the reference instead, and this is the
-- query that fills it. An extension can add outbound network reach (`http`,
-- `dblink`) or replace privileged functions wholesale, so the list is worth
-- blessing explicitly rather than inferring.
select e.extname as extension,
       e.extversion as version,
       n.nspname as schema
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
 order by 1;
