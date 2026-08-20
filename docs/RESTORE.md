# Restoring the database from a backup

Written 20 August 2026. **This procedure has not yet been performed end to
end.** The archive has been proved to decrypt and to list cleanly — the backup
job does that on every run and refuses to upload otherwise — but no dump in
this project has yet been loaded into a live Postgres. Until that has been done
once, treat the timings here as estimates and expect to hit at least one thing
this document does not mention.

---

## Before anything else

**Never restore over the live database as a first step.** Restore into a
*separate* target, confirm the data is what you expect, and only then decide
what to do about production. A restore that turns out to be the wrong day, or
half a table short, is recoverable — one that has already overwritten the live
database is not.

**The passphrase is the backup.** `BACKUP_PASSPHRASE` in GitHub Actions secrets
is the only thing that can open these archives, and GitHub will not show it to
you again. If it exists nowhere else, then losing access to the GitHub account
loses every backup at the same moment. It belongs in a password manager, or on
paper somewhere physical.

## What you need

| Thing | Where it lives |
|---|---|
| `BACKUP_PASSPHRASE` | GitHub → Settings → Secrets → Actions |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Cloudflare R2 → Manage API tokens |
| `R2_ACCOUNT_ID`, `R2_BUCKET` | Cloudflare R2 dashboard |
| `aws`, `openssl`, `psql` | `brew install awscli openssl libpq` |

## What is in an archive

Three files, and the order they are loaded in matters.

| File | Typical size | What it is |
|---|---|---|
| `roles.sql` | ~370 bytes | Database roles |
| `schema.sql` | ~40 KB | Tables, functions, policies, triggers |
| `data.sql` | ~505 KB | Every row, as `COPY` statements |

Sizes are from the 20 August 2026 backup. A `data.sql` of a few hundred bytes
means an empty dump — the job is supposed to refuse those, but check anyway.

---

## 1. Find the backup you want

```bash
export AWS_ACCESS_KEY_ID=…  AWS_SECRET_ACCESS_KEY=…  AWS_DEFAULT_REGION=auto
export R2_ENDPOINT="https://<account-id>.r2.cloudflarestorage.com"
export R2_BUCKET=<bucket-name>

aws s3 ls "s3://$R2_BUCKET/daily/"   --endpoint-url "$R2_ENDPOINT"
aws s3 ls "s3://$R2_BUCKET/monthly/" --endpoint-url "$R2_ENDPOINT"
```

Names are `anadyon-YYYY-MM-DDTHH-MM-SSZ.tar.gz.enc`, in UTC. `daily/` keeps 30,
`monthly/` keeps 12.

## 2. Download and decrypt it

```bash
STAMP=2026-08-20T00-57-03Z          # the one you chose

aws s3 cp "s3://$R2_BUCKET/daily/anadyon-$STAMP.tar.gz.enc" . \
  --endpoint-url "$R2_ENDPOINT"

read -rsp "passphrase: " BACKUP_PASSPHRASE; export BACKUP_PASSPHRASE; echo

openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 \
  -pass env:BACKUP_PASSPHRASE \
  -in "anadyon-$STAMP.tar.gz.enc" -out "anadyon-$STAMP.tar.gz"

mkdir -p restore && tar -xzf "anadyon-$STAMP.tar.gz" -C restore
ls -lh restore/
```

`bad decrypt` means the wrong passphrase. Nothing else produces that message.

## 3. Look at it before you load it

```bash
head -40 restore/schema.sql
grep -c "^COPY" restore/data.sql          # roughly, tables with rows
grep "^COPY public.reservations" restore/data.sql
```

Confirm the date inside matches the date on the filename, and that the tables
you care about are actually present.

## 4. Load it somewhere that is not production

The safest target is a throwaway Postgres on your own machine:

```bash
docker run --rm -d --name anadyon-restore \
  -e POSTGRES_PASSWORD=restore -p 5433:5432 postgres:17

export TARGET="postgresql://postgres:restore@localhost:5433/postgres"
```

A second free Supabase project works too, and is the better test if you intend
to fail over to it — it exercises the same extensions and the same managed
roles that the real project has.

Then, in this order:

```bash
psql "$TARGET" -f restore/roles.sql
psql "$TARGET" -f restore/schema.sql
psql "$TARGET" -f restore/data.sql
```

**Errors you should expect and ignore** on `roles.sql`, and on parts of
`schema.sql` when the target is a Supabase project: `role "…" already exists`,
`extension "…" already exists`, and complaints about `supabase_admin` or other
managed roles. Supabase creates those itself. What must *not* error is
`data.sql` — a failure there means rows did not load.

## 5. Check the restore is real

```bash
psql "$TARGET" -c "select count(*) from reservations;"
psql "$TARGET" -c "select count(*) from quotes;"
psql "$TARGET" -c "select max(created_at) from reservations;"
psql "$TARGET" -c "select count(*) from customers;"
```

Compare those against the live database. `max(created_at)` should sit just
before the backup's timestamp — that gap is exactly how much you would lose.

## 6. Only now, production

Restoring into the live project is a decision, not a step, and what it should
be depends on the failure:

- **Some rows deleted by mistake** — do not restore the whole database. Pull
  just those rows out of `data.sql` and insert them by hand.
- **A table or the schema is damaged** — restore into a new project, verify, and
  repoint `NEXT_PUBLIC_SUPABASE_URL` and the keys in Vercel at it.
- **The project is gone** — new project, full restore, repoint Vercel, then
  redo the settings that live outside the database: auth Site URL and redirect
  allow-list, storage buckets, and the cron secret.

Whatever the case: **take a fresh dump of the live database first**, even a
broken one. It costs a minute and it is the only copy of the current state.

---

## What the backup does not contain

`supabase db dump` covers the database. It does not cover:

- **Storage objects** — files in the `reservation-documents` bucket. Customer
  licences and passports are not backed up by this job.
- **Auth configuration** — Site URL, redirect allow-list, MFA settings, the
  provider list.
- **Edge functions**, and project settings generally.

Auth *users* live in the database and are included. The configuration around
them is not.

## Practising it

Do steps 1 through 5 against Docker once, without touching production. It takes
about fifteen minutes and it is the only way to find out whether this document
is right before the day it has to be.
