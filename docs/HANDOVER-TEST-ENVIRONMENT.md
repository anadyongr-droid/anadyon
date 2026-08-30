# HANDOVER — observability, e2e in CI, and a staging database

**Written:** 30 August 2026
**Author:** Claude, in the **architect** chair
**For:** Codex, in the **implementer** chair
**Repository state at writing:** `main` at `3927b10`, working tree clean, 775
unit tests across 79 files passing, `tsc --noEmit` clean, `eslint app lib proxy.ts` clean.

Per `AGENTS.md`, this document is the handover — not the conversation that
produced it. It should be buildable from without asking questions. Where it is
silent or wrong, stop and say so rather than inventing a design mid-branch.

The companion document is `docs/ARCHITECTURE-STATUS-2026-08-30.md`, which
records *why* these three things and in this order. It is not required reading
to build any of them.

---

## 0a. Changed after outside review, 30 August — read this first

Three changes to the brief below, from a review recorded in
`docs/RENTAL-SYSTEM-BLUEPRINT.md` §10 (30 August, "outside review"):

1. **Do item 3's Vercel scoping first, and separately.** Before any of the build
   work: confirm in Vercel → Settings → Environment Variables whether the
   Supabase variables are scoped, and if they are not, add **Preview-scoped
   placeholder values** (the pattern `.github/workflows/ci.yml` already uses)
   so previews stop carrying production credentials. Placeholders, not unset —
   `lib/supabase.ts` builds its clients at module scope, so unset variables fail
   the preview *build*. This is under an hour and closes a standing exposure
   that the rest of the work only closes at the end.
2. **Do not wait on staging to exercise the AADE sandbox.** §3 is not a
   prerequisite for it; the first version of this brief implied otherwise. The
   day credentials arrive, file fixture data against the sandbox from a script.
   One thing to do first: the XML is built **inline in the two route handlers**,
   not in a module, so there is nothing to import. Extract the builder into
   `lib/aadeXml.ts` — worth doing regardless, since `lib/aadeXml.test.ts` has to
   read route source to assert on it today. Same for Stripe test mode.
3. **Make `scripts/check-schema-drift.mjs` bidirectional before standing staging
   up**, and run it against production. Today it only reports columns the
   migrations declare that the database lacks; `customers.name` was the reverse,
   which is why nothing caught it. The §3.1 note's claim that it is the only
   column of its class is a hand comparison, not a check — this converts it into
   one. Hours of work.

## 0. What this is, in one paragraph

Anadyon has no error tracking, no automated end-to-end run, and no database
other than production. `docs/HANDOFF-H1.md` §6 states it plainly: **"There is
no staging database. A real booking creates real rows."** That sentence is
still true today, and it means every "check it on the Vercel preview" said in
the last month was pointing at production data. Three pieces of work fix that,
and they are ordered by what they cost against what they return:

| # | Work | Cost | Blocks on |
|---|---|---|---|
| 1 | Error tracking | ~2 hours | nothing |
| 2 | `npm run test:e2e` in CI | ~2 hours | item 3 |
| 3 | Staging Supabase project + Vercel preview wiring | half a day if the migrations replay clean; 1–2 days if they do not | a one-hour replay check, described in §3.1 |

Item 1 is first because it is the only one that is free of the other two and
because the incident that justifies it has already happened. Item 3 is the
keystone — item 2 cannot run without it — but it is third because it is the
one with an unknown in its estimate, and §3.1 exists to remove that unknown
before any of it is committed to.

Build them in the order 1 → 3 → 2. They are numbered by priority, not by
sequence; §2 says so again where it matters.

---

## 1. Error tracking

### 1.1 The current state, verified

- `package.json` contains **no error-tracking dependency**. No Sentry, no
  Bugsnag, no Rollbar, no OpenTelemetry exporter. Checked against both
  `dependencies` and `devDependencies` at `3927b10`.
- The only production signals that exist are:
  - `app/api/cron/morning-briefing/route.ts`, on the single Vercel Hobby cron
    (`vercel.json`, `0 5 * * *`), which posts to Telegram;
  - `app/api/cron/watchdog/route.ts`, which alerts on open emails older than
    four hours and is also invoked by the briefing.
- Both report on **business** state. Neither reports that a request threw.
- Vercel's own runtime logs exist but are not retained on the Hobby plan long
  enough to investigate something reported the next morning, and nothing
  aggregates or alerts on them.

### 1.2 Why this is first

`docs/INCIDENT-ADMIN-MIDDLEWARE-TIMEOUT.md`. On 23 August the owner could not
reach `/admin` at all for roughly three hours. The document is thorough — it
separates verified fact from inference, and records two plausible causes
already disproved so nobody re-derives them — and its status line still reads:

> **Status: UNRESOLVED. Cause not established.**

Its §6 says what the missing capability is, exactly: if certain `[proxy]`
console lines appear before the timeout, the stall is in the role-resolution
block; if none appear, it is at `getUser()`. **Nobody could read those lines**,
because there was nowhere they were being collected. The whole investigation
came down to a log line that was emitted and lost.

That is the argument. It is not "best practice"; it is a specific three-hour
outage whose cause is still unknown because the evidence was not captured.

### 1.3 What to build

Sentry (`@sentry/nextjs`) is the recommendation — free at this volume, first
class Next.js support, and it captures middleware, which is where the incident
was. Any equivalent that captures all three runtimes is acceptable; if you pick
something else, record why in the blueprint.

**Read `node_modules/next/dist/docs/` before writing any of it.** `AGENTS.md`
opens with this and it applies here more than anywhere: Next 16 changed the
instrumentation hooks, and every Sentry setup guide and wizard you will find —
including the one the package ships — was written against an older major. The
file names, the hook names and the client-side entry point are all things to
confirm against the vendored docs rather than recall.

Coverage must include, and be demonstrated for, all three:

1. **Middleware** (`proxy.ts`). This is the one that matters. The incident was
   here, and a middleware runtime is not covered by a server-side init.
2. **Server route handlers** (`app/api/**`).
3. **The browser**, for the admin screens and the booking form.

### 1.4 Constraints — these are not optional

- **No PII may leave the building.** `customers` holds passport numbers,
  licence numbers, dates of birth, addresses and emails. Configure the client
  with PII sending **off** by default, and add an explicit scrubbing hook that
  drops request bodies, cookies and headers rather than trusting the default
  deny-list to know what a Greek passport field is called. Write a unit test
  that feeds a representative event through the scrubber and asserts a known
  passport-shaped value does not survive it.
- **Do not enable Session Replay.** It records the admin screen, and the admin
  screen shows the customer table. This is the single most likely way to turn
  an observability improvement into a data-protection incident.
- **The CSP must be updated in the same commit.** The policy is defined in
  `next.config.ts`; `lib/csp.test.ts` pins it, and `app/api/csp-report/route.ts`
  collects violations. An ingest domain missing from `connect-src` does
  not error visibly — the browser blocks the report and the dashboard simply
  stays empty, which looks identical to "no errors happened". Add the domain,
  update the test, and prove the test fails without the change.
- **The DSN is public by design but the auth token is not.** The auth token
  used for source-map upload belongs in Vercel and GitHub secrets, never in
  the repository. `docs/HANDOFF-H1.md` §7: *"Never commit `.env.local`. It
  holds live secrets."*
- **Errors must not be swallowed on the way.** Several routes already catch
  and convert to a status code — `UnfilableError` in the AADE routes is the
  deliberate example. Reporting must happen before the conversion, or the
  handled-but-real failures stay invisible.

### 1.5 Acceptance

- A deliberately thrown error in a server route appears in the dashboard.
- A deliberately thrown error in `proxy.ts` appears in the dashboard. **Do this
  one on a preview deployment, never on production** — see the "Do not" list in
  the incident document: an untested middleware change landing on the one path
  that is already broken can make a lockout permanent.
- The CSP test fails when the ingest domain is removed.
- The scrubber test fails when the scrubbing hook is removed.
- CI stays green, and the build does not require the auth token to be present
  (an unset token must skip source-map upload, not fail the build).

Per `AGENTS.md`: run each new test against the unfixed code and watch it fail
before trusting it. This project has twice shipped a test that asserted the bug
and passed.

---

## 2. The end-to-end suite in CI

**Sequence note:** this is item 2 by value and item 3 by order. It cannot be
built before the staging database in §3 exists, for the reason in §2.2. Read it
now so §3 is built with it in mind; write it after.

### 2.1 What already exists

More than you would expect. `tests/e2e/` holds nine files and they cover the
whole commercial path:

| File | Covers |
|---|---|
| `00-baseline.e2e.ts` | preconditions |
| `00-no-mail-escapes.e2e.ts` | that nothing in the suite can send real mail |
| `01-quote.e2e.ts` | quote generation |
| `02-conversion.e2e.ts` | quote → booking |
| `03-lifecycle.e2e.ts` | the reservation lifecycle |
| `04-guards.e2e.ts` | the refusals |
| `05-operations.e2e.ts` | operational endpoints |
| `06-security.e2e.ts` | access control |
| `07-readiness.e2e.ts` | deployment readiness |

`vitest.e2e.config.ts` runs them with `fileParallelism: false` and a 30-second
timeout. `npm run test:e2e` is already a script. `tests/e2e/setup.ts` stubs the
Resend transport for every file in the suite — and its comment records why that
floor exists rather than being left to each test: `01-quote.e2e.ts` once sent
two real messages per quote, a dozen quotes a run, until the owner's inbox
filled with hundreds of them.

So the suite is not the work. The work is making it runnable by a machine.

### 2.2 Why it is not in CI today

It talks to the real Supabase project. Not a fixture, not a container — the
production database. Running it on every pull request would create and mutate
real reservations, real customers and real vehicle blocks, on the system the
business is being run from that morning.

That is the whole blocker. It is why §3 comes first.

### 2.3 What to change

**`tests/e2e/setup.ts` reads `.env.local` off disk with `readFileSync`.** In a
GitHub Actions runner that file does not exist and the setup file throws before
a single test runs. Change it to fall back to `process.env` when the file is
absent — keep the file path as the local-developer convenience it is, do not
remove it — so the same suite runs unchanged in both places.

Add a job to `.github/workflows/ci.yml`. **Follow the existing "Schema drift
check" step as the pattern**, including its lesson, which is written out at
length in that file and is worth restating:

> A check that reports success for something it did not look at is worse than
> no check, because it gets believed.

So: when the staging credentials are absent, the step must emit a
`::warning title=...` and exit 0 — visibly skipped, never quietly green.

Other requirements:

- Point it at the **staging** project's URL and service-role key, held as
  GitHub secrets distinct from any production ones. Do not reuse the existing
  `SUPABASE_SERVICE_ROLE_KEY` secret name; a name collision here is a
  production write from a pull request.
- Run it **after** the unit tests and build, for the same reason those are
  ordered as they are: stop the pipeline at the cheapest point.
- Give it its own timeout and upload whatever it produces on failure, the way
  the Playwright step already does.
- Consider whether it runs on every pull request or only on `main` and on
  demand. Every PR is better; if runtime makes that painful, say so with the
  measured number rather than assuming.

### 2.4 Acceptance

- The suite runs green in CI against staging.
- Deliberately break one route handler, push, and watch the CI job go red for
  that specific reason. This is the same discipline as a regression test: an
  e2e job that has never failed has not been shown to work.
- The job is visibly skipped, with a warning, when the secrets are unset.
- No test in the suite can reach a real inbox — `00-no-mail-escapes.e2e.ts`
  already asserts this; confirm it still passes in the CI environment, where
  the environment variables arrive by a different route.

---

## 3. The staging Supabase project

### 3.1 Step zero — the one-hour check that removes the unknown

**Do this before anything else, and before quoting a date.**

The estimate for this item splits on one question: do the 37 migrations in
`supabase/migrations/` replay cleanly, in order, into an empty database? If
they do, standing up staging is mostly clicking and configuration. If they do
not — because an early migration references something a later one creates, or
because production carries a hand-applied change that never became a migration
— then the work is repairing the migration history, which is a different and
larger job.

You already have the tool. `@electric-sql/pglite` is in `devDependencies` and
several tests already execute migrations through it — see
`lib/vehicleChangeRequestsMigration.test.ts`,
`lib/atomicBookingMigration.test.ts` and the others matching
`lib/*Migration.test.ts` for the established pattern.

Write a script (or a test) that applies **all** of them in filename order into
one empty PGlite database and reports the first failure. Two caveats:

- PGlite is not Supabase. It has no `auth` schema, no `storage` schema, and no
  `service_role`/`anon`/`authenticated` roles. Migrations that reference those
  will fail for reasons that are not migration-history problems. Stub the
  missing roles and schemas up front and record exactly what you stubbed, so a
  reader can tell a real failure from a harness gap.
- `supabase/migrations/paste/` holds 19 files against 37 in the parent
  directory. That is expected — the paste copies exist for migrations applied
  by hand and `lib/migrationPasteParity.test.ts` enforces the pairing. Replay
  the parent directory, not the paste copies.

Report the result before continuing. If it is clean, say so and proceed. If it
is not, stop and write up what broke — that is a design question for the
architect, not something to fix inside this branch.

#### §3.1 — RUN, 30 August 2026. Result: one blocker, decided, chain now clean.

Codex ran this and stopped exactly as instructed. Recorded here so the next
reader does not repeat it:

- **16 of 37 applied.** 017 failed with `column "name" of relation "customers"
  does not exist`.
- **Cause:** `001_baseline.sql` uses `CREATE TABLE IF NOT EXISTS` on tables the
  hand-made `supabase/schema.sql` had already created, so in production the
  baseline's `customers` definition was a no-op and the legacy `name text NOT
  NULL` column survived. 017 assumes it. 017's own header already says this.
- **Decision** (blueprint §10, 30 August): prepend
  `ALTER TABLE customers ADD COLUMN IF NOT EXISTS name text;` to 017. Do **not**
  amend 001, and do **not** make 017 conditional. The reasoning is in the
  blueprint entry; 017 has no paste copy, so nothing moves with it.
- **Verified:** with that one line, **all 37 replay**, and `customers.name` ends
  `text`, nullable, with `customers_sync_legacy_name_trg` attached — the state
  production reached by a different route.
- **`customers.name` is the only column of its class.** All five tables shared
  between `schema.sql` and 001 were compared directly; nothing else is missing.

**This changes the exit criterion below.** A green replay proves the chain runs;
it does not prove the result matches production. `scripts/check-schema-drift.mjs`
compares one direction only — columns the migrations declare that the database
lacks — and `customers.name` was the opposite, which is why nothing caught it.
Before staging is declared working, compare the replayed schema against the
live one in **both** directions and record the diff. That comparison is now part
of §3.6.

### 3.2 The rule about applying migrations

`AGENTS.md`, verbatim:

> **Never apply a Supabase migration.** Write the numbered migration and its
> byte-identical `supabase/migrations/paste/` copy, and hand both to Tasos.

That rule was written about production and a new empty staging project is not
production, but the rule as written has no exception and a stale
`paste/` copy has already reached production once. So: **you may create and
apply migrations against a local PGlite database freely** — that is what the
existing migration tests already do — and **you may not apply anything to any
hosted Supabase project, staging included.** Prepare the ordered list and the
commands; Tasos runs them.

### 3.3 What the migrations do not give you

Replaying the schema is not a working environment. Four things are needed on
top, and each of them has already caused a problem in this project:

**Auth users with `app_metadata.role`.** Nothing in `supabase/migrations/`
creates a user. `proxy.ts` resolves the role from `app_metadata.role` and
**denies on an unresolved role, deliberately** — its comment records that the
previous fallback to `"staff"` handed the customer database to anyone who
signed up. So a staging project with a perfect schema and no seeded users is a
staging project where nobody can log in. Seed at least one `admin` and one
`staff`. `docs/INCIDENT-ADMIN-MIDDLEWARE-TIMEOUT.md` §7.1 makes the same point
from the other direction: a missing role claim is the first thing to check
when the admin area is unreachable.

**The `reservation-documents` storage bucket.**
`supabase/migrations/021_reservation_documents_bucket.sql` creates it, and
`001_baseline.sql` also records it as a manual dashboard step at lines 464–469.
Confirm which of those actually runs on a fresh project before assuming the
migration covers it. `app/api/admin/documents/route.ts` and
`.../documents/download/route.ts` both hard-code the name. **The absent bucket
is a defect this project has already shipped** — `.github/workflows/ci.yml`
names it as the cost of a check that passed without looking.

**Grants.** `scripts/check-grants.mjs` exists and `npm run check:grants` runs
it. Run it against staging and expect it to pass. `docs/HANDOFF-H1.md` §7:
*"Never grant table access `TO anon`."*

**Seed data — synthetic, never a production dump.** This is a hard line, not a
preference. The `customers` table holds passport numbers, licence numbers,
dates of birth and email addresses of real people who consented to a car
rental, not to their identity documents being copied into a test system with
looser access. Copying that table into staging is a GDPR breach on the day it
is done, independently of what happens next.

Write a seed script that generates: the vehicle fleet (29 vehicles is the real
number, and shapes matter more than volume — several categories, at least one
blocked, at least one with open damage), a handful of customers with obviously
fake identity data, and enough reservations across enough dates for the
availability allocator to have something to decide. It must be idempotent.

### 3.4 Resettability, or staging lies to you

The known failure mode of a staging environment is not that it breaks — it is
that it drifts. Somebody fixes something by hand, nobody writes it down, and
six weeks later staging passes a change that production rejects. **A stale
staging is worse than none**, because it is believed.

Two requirements follow, and they are the difference between this being worth
building and not:

1. **One command resets it.** Drop, replay every migration, re-seed. If a reset
   takes a checklist, it will stop being done.
2. **Nothing is ever fixed by hand.** A schema change reaches staging as a
   migration or it does not reach staging. A seed-data change edits the seed
   script. If you find yourself opening the Supabase SQL editor against
   staging to make something work, that is the signal that a migration is
   missing — write the migration.

Add the reset command to `package.json` alongside the other `check:` and
`test:` scripts, and give it a "Conventions that bite" entry in
`docs/README.md` — that file is the index, and a capability nobody can find is a
capability nobody uses.

### 3.5 Vercel wiring

Four things already work in your favour, for free, because
`VERCEL_ENV === "preview"` is already load-bearing in the codebase:

- `app/robots.ts` returns `disallow: /` for anything that is not the production
  deployment, so staging cannot be indexed.
- `lib/recaptchaKeys.ts` — `isLiveSite()` is false on preview, which is what
  permits Google's published always-passing reCAPTCHA test pair. The live site
  refuses that secret outright. See `docs/PREVIEW-RECAPTCHA-TEST-KEYS.md`;
  without this, the booking form cannot be driven by a machine at all, because
  a real token needs a human.
- `lib/mailer.ts` honours `MAIL_REDIRECT_TO`, which sends every message to one
  address regardless of recipient.
- `AADE_PRODUCTION` left unset selects the AADE sandbox.

Set the environment variables **scoped to Preview** in the Vercel project — not
globally, or a mis-scoped variable points production at staging. The full list
of variables the code reads is:

```
AADE_PRODUCTION            GMAIL_REDIRECT_URI          RESEND_WEBHOOK_SECRET
AADE_SUBSCRIPTION_KEY      MAIL_REDIRECT_TO            STRIPE_SECRET_KEY
AADE_USER_ID               NEXT_PUBLIC_RECAPTCHA_SITE_KEY
ANTHROPIC_API_KEY          NEXT_PUBLIC_SITE_URL        STRIPE_WEBHOOK_SECRET
APIFY_TOKEN                NEXT_PUBLIC_SUPABASE_ANON_KEY
BACKUP_PASSPHRASE          NEXT_PUBLIC_SUPABASE_URL    SUPABASE_SERVICE_ROLE_KEY
COMPANY_BRANCH             RECAPTCHA_SECRET_KEY        TELEGRAM_BOT_TOKEN
COMPANY_VAT_NUMBER         RESEND_API_KEY              TELEGRAM_CHAT_ID
CRON_SECRET                                            TWILIO_ACCOUNT_SID
GMAIL_CLIENT_ID                                        TWILIO_AUTH_TOKEN
GMAIL_CLIENT_SECRET                                    TWILIO_FROM_NUMBER
                                                       WISE_BUSINESS_HANDLE
```

Go through that list deliberately. Each one is either pointed at a sandbox,
pointed at staging, or left unset — and "left unset" must be a decision, not an
oversight. `TELEGRAM_CHAT_ID` in particular: leave it unset or point it at a
separate chat, or staging's briefing lands in the group the business reads
every morning.

**Three things that will not work the way you expect:**

- **Vercel does not run crons on preview deployments.** The single cron in
  `vercel.json` fires only against production. Both cron routes authenticate
  with `Bearer ${CRON_SECRET}`, so on staging they are triggered by hand with
  `curl`. Put the exact commands in this document's §3.6 acceptance list and in
  `docs/README.md`; a capability that needs reconstructing is not one.
- **Stripe needs its own webhook endpoint** registered against the staging URL,
  in test mode, with its own `STRIPE_WEBHOOK_SECRET`. Note that a Vercel
  preview URL changes with every deployment — register the stable branch alias,
  not a deployment URL.
- **Resend needs the same** for `RESEND_WEBHOOK_SECRET`, and its sending domain
  must be one that is verified. Combined with `MAIL_REDIRECT_TO` this is belt
  and braces, which is the correct amount here.

### 3.6 Acceptance

- The reset command, run twice in a row, produces the same working environment
  both times.
- A booking can be made end to end on the staging URL, in a browser, by hand:
  quote → conversion → confirmation email arrives at the redirect address.
- Login works as `admin` and as `staff`, and the staff account is refused the
  things it should be refused. `06-security.e2e.ts` covers this; a manual pass
  first tells you whether the seeding is right.
- `npm run check:schema` and `npm run check:grants` both pass against staging.
- A document upload reaches the `reservation-documents` bucket and can be
  downloaded again.
- **The replayed schema is compared against production in both directions**, and
  any difference is either explained or closed. See the §3.1 result note: the
  existing drift checker only looks one way, and the one defect found so far was
  invisible to it.
- The morning briefing, triggered by hand with `CRON_SECRET`, produces output.

---

## 4. What this does not buy

Stated plainly so nobody is surprised later, and because a handover that only
lists benefits is not an honest one.

**Neither of the two real production defects found this month would have been
caught by any of this.** The blueprint's 28 August entry records them: a
turnaround applied to only one end of a rental, and the Calendar drawing a
booking a day earlier than its stored date. Both were found by reading code.
Both were then covered by unit tests. An end-to-end suite running against a
staging database would have exercised both paths and reported success, because
both produced plausible output — and the entry's own conclusion is the sharp
part: the existing tests *"asserted the predicate as written rather than the
behaviour it was meant to produce."* A staging environment does not fix that.
Nothing does except deciding what the behaviour should be before asserting it.

What staging actually buys is the three things that are impossible today:

1. A place to exercise vendor sandboxes — AADE, Stripe, NBG — against real
   request/response cycles rather than against a mock of what the documentation
   says they do. This is the strongest single argument for it, and it is the
   reason the AADE work currently stops at "written, untested against the
   sandbox".
2. A place the e2e suite can run unattended, which is item 2.
3. A place to look at an admin screen while logged in. Worth naming: **no admin
   screen changed this weekend has been verified by eye**, because this
   container has no Supabase session. Five merged pull requests were reviewed
   as source and tests only.

---

## 5. Open questions — for the architect, not for this branch

Raise these rather than deciding them, per `AGENTS.md`: *"An idea worth having
is worth raising, not building unasked."*

1. **Does staging get its own Vercel project, or does it ride the preview
   deployments of the existing one?** This handover assumes the second — it is
   cheaper and it is what `VERCEL_ENV === "preview"` already anticipates — but a
   separate project gives a stable URL, which makes the Stripe and Resend
   webhook registration substantially less fragile.
2. **Does the e2e job run on every pull request, or on `main` and on demand?**
   Answer with the measured runtime.
3. **Does the staging database get reset on a schedule, or only on request?**
   A nightly reset defeats drift permanently but destroys any state somebody
   was mid-way through examining.
4. **What is the retention setting on the error tracker?** It receives
   stack traces from routes that handle identity documents. Even scrubbed,
   shorter is better, and the free tier's default may be longer than
   `docs/RENTAL-SYSTEM-BLUEPRINT.md` §4.2b's retention thinking allows.

---

## 6. Related documents

- `docs/ARCHITECTURE-STATUS-2026-08-30.md` — why these three, in this order.
- `docs/INCIDENT-ADMIN-MIDDLEWARE-TIMEOUT.md` — the outage that justifies item 1.
- `docs/HANDOFF-H1.md` §6–§7 — "There is no staging database", and the standing
  security rules.
- `docs/PREVIEW-RECAPTCHA-TEST-KEYS.md` — the test key pair and why it is safe
  on preview and catastrophic on production.
- `docs/RENTAL-SYSTEM-BLUEPRINT.md` §7 — the build order these three sit
  alongside, and §10 for the revision history.
- `.github/workflows/ci.yml` — the existing pipeline, and the schema-drift step
  whose skip-loudly pattern item 2 should copy.
