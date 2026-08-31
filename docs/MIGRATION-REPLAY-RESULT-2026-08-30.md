# Migration replay result — 30 August 2026

**Branch:** `codex/test-environment-foundation`
**Base:** `3927b10`
**Hosted databases touched:** none

## Initial result

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

## Architect decision and verified repair

The architect recorded the decision in `docs/RENTAL-SYSTEM-BLUEPRINT.md` §10:
migration 017 must make itself self-contained by adding the production-only
legacy column when it is absent:

```sql
alter table customers add column if not exists name text;
```

This is a no-op for production, where the column already exists. On a fresh
database it lets the rest of migration 017 install the same nullable `text`
column and compatibility trigger that production has.

After implementing that decision, the permanent replay check passed all 37
migrations and queried the final catalogue to verify:

- `public.customers.name` exists exactly once;
- its type is `text` and it is nullable;
- `customers_sync_legacy_name_trg` is attached to `public.customers`.

No hosted database was touched. The full test-environment implementation is now
unblocked.

The replay script remains a permanent gate: every future migration is included
automatically, and no fake `customers.name` column exists in the compatibility
harness.

## Reverification after current main — 31 August 2026

After merging `origin/main` at `02c6795`, the permanent check replayed all **38**
current migrations, including `20260830160000_vehicle_open_damage_view.sql`,
and applied the synthetic seed twice with the same final counts. The newer
bidirectional schema-declaration test initially failed because it still expected
`customers.name` to be undeclared and allowlisted. That obsolete exception was
removed; the test now requires migration 017 to declare the column.
