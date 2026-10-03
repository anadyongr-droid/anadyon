-- Row counts per public table, as one row of JSON: `{"reservations": 412, …}`.
--
-- **A count, not a value.** The same constraint as the fingerprint: this file
-- runs against a database holding customers' addresses and dates of birth, and
-- its output is carried between nightly runs, so it must be incapable of
-- carrying a customer's data. A cardinality cannot.
--
-- **Why `count(*)` and not `reltuples`.** The planner's estimate is free and
-- approximate, and the event this exists to catch is **rows disappearing** —
-- the fear the whole oversight exercise started from. An estimate drifts by
-- more than a deletion would, so the one thing it must detect is the one thing
-- it would hide.
--
-- `query_to_xml` is the standard way to count every table in one statement
-- without writing a function: it runs the generated `count(*)` per table and
-- returns the result as XML, which `xpath` then reads back. Clumsy, but it keeps
-- this a plain read-only query — nothing is created in production to support a
-- monitoring job, which matters when the whole point is that production stops
-- changing in ways nobody declared.
select jsonb_pretty(coalesce(jsonb_object_agg(counted.relname, counted.rows), '{}'::jsonb)) as counts
  from (
    select c.relname,
           (xpath(
              '/row/n/text()',
              query_to_xml(format('select count(*) as n from public.%I', c.relname), false, true, '')
            ))[1]::text::bigint as rows
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'r'
  ) counted;
