# Migration replay result — 30 August 2026

**Last verified:** 4 October 2026, Claude — extended with what the production
fingerprint found (W42), which is the same defect this document opened with,
measured against production rather than against a replay.

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

After first merging `origin/main` at `02c6795`, the permanent check replayed all
**38** migrations then present, including
`20260830160000_vehicle_open_damage_view.sql`, and applied the synthetic seed
twice with the same final counts. The newer
bidirectional schema-declaration test initially failed because it still expected
`customers.name` to be undeclared and allowlisted. That obsolete exception was
removed; the test now requires migration 017 to declare the column.

After the branch was refreshed again to `origin/main` at `5e95861`, the same
check passed **39/39**, including the new rental-handover migration.


## 4 October 2026 — the same defect, measured against production: W42

The nightly production fingerprint compared the replayed migrations with
production for the first time on 3 October and found **twelve `quotes` column
differences, one missing index and one undeclared policy**. This is the document
that owns the subject, because the sentence above — *"production had a
hand-created legacy `name` column that was never represented in the baseline"* —
is the whole explanation, and the fingerprint has now measured how far it
reaches.

### The question, and the answer

The question was whether production drifted away from the repository, or whether
`001_baseline.sql` describes a database it was never run against. **It is the
second**, and four pieces of evidence settle it without touching production:

1. **`supabase/schema.sql` — "Run this in the Supabase SQL editor" — creates
   `vehicles`, `customers`, `reservations`, `rates` and `extras_config`, and no
   `quotes` table at all.**
2. **`supabase-migration.sql` at the repository root runs
   `ALTER TABLE quotes ADD COLUMN IF NOT EXISTS …` and never creates `quotes`.**
   It assumes the table is already there. So `quotes` was created by something
   that is not in this repository: by hand, in the SQL editor.
3. **Migration `010_close_schema_drift.sql` says so in its own header**, on
   15 August: *"Closes the drift between 001_baseline.sql and the deployed
   database. The baseline declares columns the live database never received."*
   It was written because quote → reservation conversion failed on
   `customer_first_name`, and a full column comparison then found three more
   tables in the same state.
4. **The baseline has declared the missing index and the stricter types since
   15 August** — `git show 84460a1:supabase/migrations/001_baseline.sql` carries
   both `CREATE INDEX IF NOT EXISTS quote_rate_limits_blocked_idx` and
   `pickup_date date NOT NULL`. Production has neither. A file that has said this
   for fourteen months against a database that never had it was never executed
   there.

### Why migration 010 did not finish the job, and could not have

010 repaired the subset that was making pages error, with
`ALTER TABLE … ADD COLUMN IF NOT EXISTS`. That form can only ever **add a
missing column**. It cannot change a column's type, it cannot add a `not null`
constraint, and it says nothing about an index — so every difference of *type*,
*nullability* and *index* survived it untouched and invisible.

**That is the general lesson and it is worth more than the twelve rows.** A
reconciliation script written with `IF NOT EXISTS` everywhere is silently
partial: it converges on *presence* and never on *shape*. The project has now
hit this three times — the `customers.name` column above, 010's four tables, and
the `quotes` columns the fingerprint found — and each time the repair looked
complete because nothing compared the result.

### What the fingerprint found that nothing in the repository explains

The undeclared `Service role only` policy on `quotes`, `using: false`, **appears
nowhere in `supabase/`**. Nothing in the repository creates a policy of that
name, which is Supabase's dashboard naming. So it was created through the
dashboard, outside every control this project has — and it is the first object
found that way. It blocks rather than exposes, so it is not an incident; what it
is, is proof that the thing the fingerprint was built to detect does happen.

### What the type differences have cost so far, and what they could

Nothing has broken, and the reason is worth stating: the application treats
these values as strings on both sides — `lib/bookingFields.ts` and
`lib/calendarReservations.ts` declare `pickup_date: string`, and PostgREST will
write a string into a `date` column or a `text` one without complaint. An ISO
date also sorts correctly as text, so comparisons have behaved.

**The cost is the absent validation.** A `text` column accepts `"asap"`, and
`lib/aadeXml.ts` places `pickup_date` directly into `<issueDate>` for the tax
authority. A value that would have been refused at write time by a `date` column
is instead refused by AADE, after the rental.

### What is NOT the remedy

**Editing `001_baseline.sql` to match production so the check goes quiet.**
Twelve questions would become zero by fiat, and the one control that can see
production would be silenced by the thing it found. If the baseline is corrected
to describe the deployed database, each difference is a decision recorded in
this document — production is right, or the file is — and the file says plainly
that it is a description of a hand-built database and was never executed.

### What is left, and who owns it

- The **exact twelve columns** are in the fingerprint report, which is a run
  artifact and 30-day retained; they are not reproduced here because reading
  them from a chat transcript rather than from the report is how a list gets one
  entry wrong. **Unverified until read from the report** (§8). Owner: agent,
  next run.
- **Whether any difference is worth a migration** then follows per column, with
  `pickup_date` the first candidate. Altering a column's type on a live table
  with rows in it is Tasos's to apply, as every migration is.
- The **undeclared policy**: decide whether to declare it in a migration or drop
  it. Owner: agent to propose, Tasos to apply.
