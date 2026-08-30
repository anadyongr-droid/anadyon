# Migration replay result — 30 August 2026

**Branch:** `codex/test-environment-foundation`  
**Base:** `3927b10`  
**Hosted databases touched:** none

## Result

`npm run check:migration-replay` applies the tracked migrations in filename
order to one empty PGlite database. The check passed migrations 001–016 and
stopped at:

```text
017_customers_legacy_name_column.sql
ERROR 42703: column "name" of relation "customers" does not exist
```

The harness stubs only the Supabase facilities that PGlite does not supply:

- roles `anon`, `authenticated`, and `service_role`;
- schema `storage` and the columns of `storage.buckets` used by migration 021.

No `customers` column is stubbed. Adding one would conceal the migration-history
defect this check exists to detect.

## Why this is a real replay failure

`001_baseline.sql` creates `customers` with `first_name`, `last_name`, and
`full_name`, but no `name` column. Migration 017 begins with:

```sql
alter table customers alter column name drop not null;
```

and then creates a trigger function that reads and writes `NEW.name`. A fresh
Postgres database therefore cannot apply migration 017 after migration 001.
The migration's own commentary explains the divergence: production had a
hand-created legacy `name` column that was never represented in the baseline.

## Decision required before staging work continues

The implementation handover says to stop and return this failure to the
architect rather than repair migration history inside the staging branch. The
architect needs to choose and record how fresh databases represent the legacy
production-only column. The principal options are:

1. amend the historical baseline/replay path so the legacy column exists when
   migration 017 runs;
2. make migration 017 conditional when the legacy column is absent;
3. introduce a reviewed, squashed bootstrap baseline for new environments and
   retain the historical chain only as the production audit trail.

Each option changes the meaning of already-applied migration history, so this
branch deliberately chooses none of them.

## Work paused by this result

Per `docs/HANDOVER-TEST-ENVIRONMENT.md` §3.1, implementation is paused before:

- Sentry/error-tracking integration;
- staging Supabase provisioning, schema application, or seeding;
- Vercel Preview environment wiring;
- the end-to-end CI job.

The replay script remains useful whichever repair is selected: the accepted
repair must make all tracked migrations pass without adding a fake
`customers.name` column to the compatibility harness.
