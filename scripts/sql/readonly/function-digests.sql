-- The digest of every `public` function body, with comments and whitespace
-- normalised away -- so a definition difference can be compared exactly instead
-- of scraped out of a report.
--
-- WHY THIS, AND NOT THE FULL TEXT. `function-definitions.sql` returns the
-- definitions, and reading them back out of the workflow's output cost three
-- failed attempts on 6 October: psql's aligned output wraps long values and
-- marks each wrapped line with a trailing `+`, the column padding travels with
-- the text, and a regex for the body stopped at the *opening* dollar-quote. Each
-- was a bug in my scraping, not in the data -- which is the point: **comparing
-- 32 characters beats parsing 13,000.**
--
-- `\pset` makes the output machine-readable rather than pretty. The workflow
-- leaves formatting to the query file on purpose, because some queries are for
-- a person to read and some are for an agent to compare.
\pset format unaligned
\pset tuples_only on
\pset fieldsep '|'

-- Comments first, then whitespace: the same normalisation
-- `scripts/productionFingerprint.mjs` applies, so the two sides are directly
-- comparable. If these digests match the replay's, a `function.definition`
-- difference is comments added to a migration after it was pasted -- cosmetic,
-- and W52's case for normalising them away. If they differ, the two PostgreSQL
-- versions deparse the same body differently, and the answer is to match the
-- versions instead.
select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
       || '|' || md5(
            btrim(
              regexp_replace(
                regexp_replace(pg_get_functiondef(p.oid), '--[^' || chr(10) || ']*', ' ', 'g'),
                '\s+', ' ', 'g'
              )
            )
          )
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.prokind in ('f', 'p')
   and not exists (
     select 1 from pg_depend d
      where d.objid = p.oid and d.classid = 'pg_proc'::regclass and d.deptype = 'e'
   )
 order by 1;
