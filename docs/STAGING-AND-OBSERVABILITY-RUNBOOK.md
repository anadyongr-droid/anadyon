# Staging and observability runbook

**Status:** the isolated Supabase project exists and was reset twice from
current `main` on 19 September 2026. Both runs replayed all 44 migrations and
finished with identical synthetic fixtures, Auth roles, grants and schema
checks. The `staging` branch alias is live with branch-scoped Supabase URL, anon
key and service-role key; synthetic admin and staff both completed browser login
and separate MFA enrolment. The staff role was observed being redirected away
from `/admin/users` to `/admin/reservations`. Production was not changed.
Production-schema parity, hosted vendor flows and Sentry acceptance remain open.
A reviewed plan for closing the remaining parity gaps is in §13, added 20
September 2026.

This runbook creates an isolated test system. It never copies production data,
never reuses production Supabase credentials, and never permits test mail to
reach a customer.

## 1. What the repository now provides

- `npm run check:migration-replay` replays all migrations into empty PGlite,
  applies the synthetic seed twice, and asserts the final compatibility column,
  trigger, private document bucket, and fixture counts.
- `npm run staging:reset` drops only a three-way-verified hosted staging target,
  replays every migration, seeds synthetic operational data, creates or updates
  synthetic `admin` and `staff` Auth users, verifies both logins and role claims,
  then runs schema, grant, fixture and bucket checks.
- `npm run check:schema:parity` creates read-only `public` schema dumps from
  production and staging and compares them in both directions.
- CI has a separate, serialized staging e2e job. Missing staging secrets produce
  a visible GitHub warning; production secret names are not accepted.
- Sentry covers browser, Node route handlers and Next's proxy/edge hooks. Its
  outbound event is reconstructed from a small allowlist. Request bodies,
  headers, cookies, user data, query parameters, breadcrumbs, Replay, tracing,
  logs and metrics are disabled.

## 2. Create the Supabase project

Create a new Supabase project named clearly as staging. Do not restore a backup
and do not copy rows from production. Record these values without pasting them
into chat or GitHub:

- project ref;
- project API URL;
- anon key;
- service-role key;
- percent-encoded direct or pooler PostgreSQL connection URL.

Create `.env.staging.local` locally; it is ignored by Git. Do **not** put
`CONFIRM_STAGING_RESET` in this file.

```dotenv
STAGING_SUPABASE_PROJECT_REF=the_staging_project_ref
STAGING_NEXT_PUBLIC_SUPABASE_URL=https://the_staging_project_ref.supabase.co
STAGING_NEXT_PUBLIC_SUPABASE_ANON_KEY=staging_anon_key
STAGING_SUPABASE_SERVICE_ROLE_KEY=staging_service_role_key
STAGING_SUPABASE_DB_URL=postgresql://postgres:percent_encoded_password@db.the_staging_project_ref.supabase.co:5432/postgres

STAGING_ADMIN_EMAIL=staging-admin@anadyon.invalid
STAGING_ADMIN_PASSWORD=use_a_unique_generated_password
STAGING_STAFF_EMAIL=staging-staff@anadyon.invalid
STAGING_STAFF_PASSWORD=use_another_unique_generated_password

E2E_TARGET=staging
```

The two emails deliberately use the reserved `.invalid` domain. Auth marks
them confirmed without sending mail. On first browser login, enrol a different
TOTP factor for each account; the production-strength MFA gate stays enabled.

## 3. Reset staging

First prove the migration and seed chain locally:

```sh
npm ci
npm run check:migration-replay
```

Then run the hosted reset yourself. The acknowledgement must be typed into the
command and must contain the exact staging ref:

```sh
CONFIRM_STAGING_RESET=reset-the_staging_project_ref npm run staging:reset
```

The command refuses to run unless all of these agree:

1. the official Supabase API hostname;
2. the project ref embedded in the database host or pooler username;
3. the acknowledgement typed for this run.

It also compares available `.env.local` production credentials and refuses if
any URL or service credential is reused. It then verifies 29 synthetic vehicles,
five synthetic customers, six reservations, an open damage item, rates, extras,
the private `reservation-documents` bucket, Auth role claims, schema visibility,
and least-privilege grants.

Run the command twice. Both runs must finish with the same counts. This is the
acceptance test for reset reproducibility and seed idempotency.

## 4. Compare schemas in both directions

Supply the two database URLs only for this read-only check:

```sh
PRODUCTION_SUPABASE_DB_URL=production_url STAGING_SUPABASE_DB_URL=staging_url npm run check:schema:parity
```

The command dumps only the `public` schema and never dumps rows. Equal SHA-256
output is a pass. While 042–045 remain pending on production, it classifies
complete SQL statements against `scripts/schema-parity-pending.json`: only the
functions and grants attributable to those migrations are permitted, 044 is
declared explicitly as data-only, and every production-only or unexplained
staging statement fails the check. Required schema-producing migrations must
also be observable; a missing expected difference fails rather than silently
shrinking the boundary. Both dumps are retained in a new temporary directory.

Update the manifest when Tasos applies a pending migration to production. Never
broaden a pattern merely to make the check green: the manifest is the declared
boundary, not a suppression list.

Also run these against the mapped staging values; `staging:reset` already runs
them once automatically:

```sh
npm run check:schema
npm run check:grants
```

## 5. Vercel Preview variables

Use the existing Vercel project and scope every value below to **Preview only**.
Never edit the corresponding Production value during staging setup.

| Application variable | Preview value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | staging project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | staging anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | staging service-role key |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | Google's published v2 test site key |
| `RECAPTCHA_SECRET_KEY` | matching published test secret |
| `MAIL_REDIRECT_TO` | one controlled Anadyon test inbox |
| `NEXT_PUBLIC_SITE_URL` | stable Vercel branch alias, not an immutable deployment URL |
| `STRIPE_SECRET_KEY` | Stripe **test-mode** key only |
| `STRIPE_WEBHOOK_SECRET` | secret for the staging branch-alias endpoint |
| `RESEND_API_KEY` | test/restricted key appropriate to the verified sending domain |
| `RESEND_WEBHOOK_SECRET` | secret for the staging branch-alias endpoint |
| `CRON_SECRET` | independent staging secret |
| `AADE_USER_ID`, `AADE_SUBSCRIPTION_KEY` | sandbox credentials, if available |
| `AADE_PRODUCTION` | leave unset/false |

Leave Gmail, Telegram, Twilio, Anthropic, Apify, backup and Wise variables unset
unless that integration is under an explicit sandbox test. In particular,
staging must not post the morning briefing to the production Telegram group.

Preview deployments do not run Vercel crons. Trigger the briefing by hand,
against the stable branch alias:

```sh
curl -fsS -H "Authorization: Bearer YOUR_STAGING_CRON_SECRET" https://YOUR_STABLE_BRANCH_ALIAS/api/cron/morning-briefing
```

Register Stripe and Resend webhook endpoints against that same stable branch
alias. A deployment URL changes and should not be registered.

## 6. Sentry setup

Create a Sentry Next.js project and choose the shortest practical retention.
Add these values to Vercel Preview first:

| Variable | Sensitivity |
|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` | public identifier by design |
| `SENTRY_ORG` | non-secret slug |
| `SENTRY_PROJECT` | non-secret slug |
| `SENTRY_AUTH_TOKEN` | secret build credential; Preview/Production only as needed |

Add the same build variables as GitHub secrets only if CI source-map upload is
desired. An absent auth token deliberately skips source-map upload and does not
fail the build. Uploaded client maps are deleted from the deployment artifact.

Do not enable Session Replay in the Sentry dashboard or add its integration to
the app. Do not enable request-body, cookie, header, query, user, log, metric or
performance collection. The repository tests pin those exclusions, but the
dashboard should agree.

Verify on a disposable preview branch, never production:

1. temporarily throw a generic error from one server route and confirm one
   scrubbed event reaches Sentry;
2. temporarily throw a generic error from `proxy.ts` and confirm it reaches
   Sentry without waiting for Vercel's five-minute timeout;
3. trigger a generic browser error and confirm it reaches Sentry;
4. inspect the raw event JSON: no email, passport, cookie, request body, URL
   query or customer identity may appear;
5. remove the temporary throws before the branch is merged.

The CSP accepts only the exact HTTPS ingest origin parsed from the DSN. An
invalid or non-Sentry DSN fails the build instead of silently widening CSP.

## 7. GitHub Actions secrets

Add only these staging-specific names:

```text
STAGING_SUPABASE_PROJECT_REF
STAGING_NEXT_PUBLIC_SUPABASE_URL
STAGING_NEXT_PUBLIC_SUPABASE_ANON_KEY
STAGING_SUPABASE_SERVICE_ROLE_KEY
```

Do not populate the job with production Supabase secret names. The staging job
runs only after the main build job, has a twelve-minute timeout, serializes all
runs against the shared database, writes a JUnit report, and uploads that report
on failure. The global Resend stub and `.invalid` test recipient remain active.

To prove the CI gate rather than merely see it green, make a disposable preview
commit that breaks one route assertion, confirm the staging job fails for that
assertion, then remove the break.

## 8. Final acceptance checklist

- [x] `npm run check:migration-replay` passes locally (31 August 2026).
- [x] `npm run staging:reset` passes twice consecutively from current `main`
  (44 migrations, 19 September 2026).
- [ ] `npm run check:schema:parity` reports equality or every difference is documented.
- [x] Synthetic admin and staff can log in and enrol separate MFA factors
  (19 September 2026).
- [x] Staff is refused administrator-only user management: `/admin/users`
  redirects to `/admin/reservations`, and no Users navigation is rendered
  (19 September 2026).
- [ ] Browser booking succeeds: quote → reservation → redirected email.
- [x] Document upload and signed download work in `reservation-documents`
  (31 August 2026). Six hosted checks prove the bucket is private with its
  10 MB/image-and-PDF contract, a signed upload accepts a synthetic PDF,
  anonymous download is refused, the admin list returns it, a five-minute
  signed URL returns the exact bytes, and deletion invalidates access and
  leaves no object behind. The first run failed because the list exposed the
  internal timestamped object key as the staff-facing filename; that display
  defect was fixed before the acceptance item was closed.
- [ ] Stripe test-mode webhook and payment flow work on the stable branch alias.
- [ ] AADE sandbox flow is tested when sandbox credentials exist.
- [ ] Manual morning briefing returns successfully without reaching production Telegram.
- [ ] Sentry receives browser, server and proxy errors with raw-event privacy inspected.
- [x] Staging e2e CI passes and has been observed failing on a known-bad prior
  revision (runs `33413251647` and `33398661882`, 31 August 2026).
- [x] The expanded hosted commercial-path suite passes 84/84 against staging
  with transport-level mail suppression (local unrestricted run, 1 September
  2026). A first attempt from the managed DNS sandbox failed with `ENOTFOUND`;
  rerunning with outbound access isolated that as a runner limitation.

No checkbox involving a hosted service is complete merely because the code for
it exists. Record the date and evidence when the owner performs each one.

## 9. Implementation verification — 30 August 2026

The repository-side implementation was verified without contacting or changing
any hosted Supabase project, Vercel environment or Sentry account:

- all 37 migrations replayed in filename order, and the synthetic seed applied
  twice with stable counts;
- 787 unit/regression tests passed across 82 files;
- TypeScript completed with no errors;
- ESLint completed with no errors and the existing 22 React hook warnings;
- the production Next.js build compiled, validated route-module exports, type
  checked and generated all 93 routes;
- translation checks passed 14/14 pages, static accessibility checks passed
  28/28 pages, and SEO checks passed 60/60 assertions;
- Playwright passed 70 browser checks across Chromium and Firefox. Four
  rate-dependent checks skipped as designed because the local server used
  placeholder Supabase credentials;
- the AADE XML builders retained their behavior tests after moving from route
  modules into `lib/aadeXml.ts`. This move was required because Next.js 16
  correctly rejects arbitrary exports from `route.ts` files.

The local managed environment does not permit Turbopack's helper process to
bind its internal port, so the successful local production build used Next's
webpack builder. GitHub CI remains the independent default-build gate.

Still deliberately unverified are every hosted acceptance item in §8: the
owner must create the staging project, run the reset twice, compare schemas,
configure Preview and GitHub secrets, inspect Sentry's raw event, and exercise
the real staging browser/vendor flows. The implementation PR must remain draft
until those results are recorded.

## 10. Main reconciliation — 31 August 2026

The branch was first merged with `origin/main` at `02c6795`, then refreshed to
`5e95861` after the Gate 0, first legally independent counter-schema work,
checked-in agent permission rules and development-only admin-view access
landed. The current replay is 39/39 migrations and the suite is 866/866 unit
tests. The first merge exposed and closed the obsolete `customers.name`
schema-declaration exception described in the replay result document.

Final local verification against that reconciled state:

- TypeScript passed and ESLint reported zero errors with 22 existing warnings;
- the webpack production build compiled and generated all 94 routes (GitHub CI
  remains the independent default-Turbopack gate);
- translation passed 14/14 pages, static accessibility passed 28/28 pages and
  SEO passed 60/60 assertions;
- Playwright passed 70 Chromium/Firefox checks, with four rate-dependent checks
  skipped because the isolated build deliberately used placeholder Supabase
  credentials.

## 11. Hosted staging activation — 31 August 2026

The owner created staging project `fzycvstifmltxybffinq` and ran the guarded
reset twice. Both runs replayed 39 migrations and finished with the same
synthetic state: 29 vehicles, five customers and six reservations; both
synthetic Auth roles verified; anonymous reads and writes to sensitive tables
returned 401; public rates and extras remained read-only; residual grants were
zero; the private document bucket existed; and the schema check matched 391
columns across 29 tables in both directions against the declared migration
state. No production data was copied.

The four §7 values were then installed as encrypted repository secrets in
`anadyongr-droid/anadyon`. Their values were not printed or committed. Rerunning
Actions workflow `33398661882` proved the staging job was no longer skipped:
the normal build stayed green and the hosted e2e phase failed 15 of 78 checks.
That was useful evidence, not a database failure. All 22 security checks and
all readiness checks passed. The failures identified stale test contracts:

- direct route-handler tests had no Next.js request context for `after()`;
- mail mocks predated the audited-mail recipient export and normalised result;
- the fake Resend provider reused one message id, unlike the real provider;
- one test expected atomic replay to duplicate a quote, contradicting the
  deployed idempotency rule;
- two admin tests tried to confirm bookings without the payment attestation the
  current workflow deliberately requires.

The harness now queues and drains post-response work, models unique provider
ids, and asserts the current booking/payment contracts. Against the isolated
hosted project it passed 78/78 locally, then GitHub run `33413251647` passed the
same credentialled staging job after its normal build gate. Together with the
15-failure report from run `33398661882`, this records both sides of the gate
without manufacturing an artificial failure. Preview scoping, browser MFA,
Stripe, AADE, the morning briefing and Sentry remain separate hosted acceptance
items; none is implied complete by the database or CI evidence above. The
private reservation-document lifecycle was subsequently closed on 31 August by
six destructive-but-self-cleaning checks against synthetic staging data; no
production object or customer record was read or written.

## 12. Sign-off continuation — 1 September 2026

The full hosted e2e suite passed 84/84 against the isolated project. It covered
the quote and booking path, idempotent replay, conversion, lifecycle,
availability and statutory guards, fleet/customer operations, least privilege,
schema-readiness assertions and private document lifecycle. Resend was replaced
at module level and the fallback recipient remained the reserved `.invalid`
address, so no message left the test process.

Two read-only RPC presence calls then established that migration 041 is not yet
on staging: both `handover_actor_role` and `finalise_check_out_impl` returned
`PGRST202`. Migration 040's seven tables are present. Migration 042 entered
`main` later, in PR #93, so it is necessarily absent from the project last reset
before that merge as well. This explains why repository-schema parity cannot
pass yet and makes a guarded reset from current `main` the preferred owner-only
database action: it applies 041 and 042 in order and reruns all fixture, grant,
bucket, role and drift checks. Applying both paste files manually is the
fallback, not an action for Codex.

Vercel reports the `main` production deployment at commit `93ee45a` as `READY`.
Preview runtime logs contain no error or fatal entries in the latest 24-hour
window. Environment-variable scopes were not marked verified: the available
Vercel API does not expose them, and the browser session was not signed in.

The permanent `staging` branch was created from `93ee45a`; an empty marker
commit (`c6082a2`) triggered its first deployment. Vercel reports that deployment
as `READY`, with no alias error, at the protected stable branch alias
`anadyon-git-staging-anadyon.vercel.app`. Vendor test callbacks may use that
alias after Preview variables have been inspected and confirmed to target only
the staging vendors and database.

Production observability exposed a separate operational issue, not a staging
failure: the morning briefing logged `invalid_grant` for Gmail reply detection
and email sync on 31 August. Refreshing the production Gmail OAuth grant belongs
in the operational queue and must not be disguised as part of staging sign-off.

## 13. Parity plan — 20 September 2026

Codex proposed eight ways to bring staging closer to production without copying
production data and without applying migrations 042–045 to production. Reviewed
and re-scoped here. **The plan is sound; the changes below are sequencing,
ownership and two corrections.**

### What was checked first, and why it changed the plan

Codex's item 3 listed *"server-side price recalculation"* as something to test.
`DEFINING-STATEMENTS.md` §5 said the API **never** recalculates. Both could not
be right.

The code settles it: `app/api/quote/route.ts:301` is headed "Server-side
verification — recalculate independently from DB" and computes `serverTotal`,
`serverDeposit` and `serverBalanceDue`; the client's deposit is bound to
`_clientDeposit` and discarded. **Codex was right and §5 was stale** — corrected
in #125, along with §6 and §10. §1 was also wrong and is deliberately left
wrong pending **W18**.

That is the reason this section leads with verification rather than tasks: the
plan was being written against a document that described an older system.

### Already built — do not rebuild

**Item 2 (two schema baselines) extends `npm run check:schema:parity`; it does
not replace it.** §4 above already dumps both `public` schemas and compares
SHA-256. What it cannot currently express is an *expected* difference, so it
will now fail permanently — staging carries 042–045 and production does not.

Codex's refinement is the right one and is the single highest-value item here:
keep the byte comparison, but take a declared list of pending migrations and
fail only on differences that list does not explain. A check that is expected to
fail gets ignored, and an ignored check is worse than none.

**Implemented 20 September:** the checker now compares whole SQL statements,
including intact dollar-quoted function bodies, against the narrow migration
manifest. Focused tests prove that an unrelated staging object, any
production-only object, and a missing required migration all fail. The live
read-only comparison is still an acceptance step because no database URL is
stored in the agent worktree.

### Ordering, with reasons

1. **Item 2 — expected-difference schema parity.** Highest value. Turns "042–045
   are pending" from something a person remembers into something the build
   asserts. Restores a check that is currently guaranteed red.
2. **Item 1 — synchronise the `staging` branch.** Nine commits behind with two
   staging-specific commits. Review those two before merging `main` in; they are
   the only thing that makes this more than a fast-forward.
3. **Item 6 — deployment identity.** Cheap, and it removes a whole class of
   wasted session. An admin-only diagnostic showing deployed commit, environment
   name and Supabase project ref answers "was staging even running that code?"
   without inference. A stale `.next` already cost a session on the frozen-pane
   work.
4. **Item 3 — deployed-browser journey.** The highest-value *test*: every
   existing suite calls route handlers directly and therefore cannot see the
   browser or the network boundary. **What it will not prove:** it exercises
   synthetic data, so green means the code path works, not that production data
   fits it.
5. **Item 5 — configuration shape.** Compare variable *names* and assert values
   differ. It must never print a value, only a name and a boolean.
6. **Item 7 — synthetic data coverage.** See the §13 boundary below.
7. **Item 8 — scheduled drift checks.** Last, deliberately. Built before items
   1–2 define what "drift" means, it reports noise and gets muted.

### Item 4 is mostly not agent-actionable, and was listed as though it were

Stripe test mode, a restricted Resend key, AADE sandbox credentials and a
separate Sentry project are each an account action requiring Tasos's login. An
agent should hand him the exact steps rather than plan around them. The one
genuinely agent-side piece — Google's reCAPTCHA test keys — is already handled
and guarded by the build-time assertion in `next.config.ts`.

### The §13 boundary on this work

None of items 1–8 changes the operating model, so none needs approval **as test
infrastructure**. Two need care:

- **Item 7's fixtures may represent states, not enforce policy.** Synthetic data
  covering under-age bands, expired documents and overlapping reservations is
  fine. A fixture that *encodes* an eligibility rule is one step from that rule
  being treated as agreed, and **W7/W10 are open and unapproved**.
- **Item 3's journey exercises the booking flow; it must not alter it.** If the
  journey cannot pass without changing what a customer is asked, charged or
  told, that is a finding to report — not a fix to make.

### The staging FDW trap, stated once

<!-- price-exempt: names the synthetic staging figure in order to warn against it -->
`staging:reset` reseeds from `supabase/seeds/staging.sql`, so staging shows the
Full Damage Waiver at **€12/day** and carries no GPS row. That is correct for
staging and is synthetic. **Production is €5.00/day**, verified on the live
Admin → Rates screen on 19 September. An hour was lost to this confusion on 19
September and the wrong figure reached five documents, plus §10 of the
principles. `lib/publishedPriceParity.test.ts` now fails the build if it reaches
a document again.

### What this does not address

Applying 042–045 to production remains Tasos's, per `AGENTS.md`. Nothing above
brings that forward, and **no item requires it.**

### Progress — 20 September 2026

- **Item 1 complete.** The two staging-only commits were reviewed: one was an
  empty deployment marker and the other an earlier merge from `main`; neither
  carried a staging-only application or configuration change. Current `main`
  through #134 was merged into `staging` without rewriting its history. The
  merged tree passed 99 test files / 1,068 tests locally, Vercel reported the
  stable branch deployment ready at commit `17da564`, and the stable alias
  loaded its public homepage with no browser-console errors.
- **Item 6 implemented.** `GET /api/admin/deployment-identity` reports only the
  deployed commit, Vercel environment and Supabase project ref. It is omitted
  from staff access, independently requires the proxy-resolved admin role, sets
  `Cache-Control: no-store`, and never returns an environment-variable value or
  Supabase URL. Hosted acceptance remains unrun until this change is merged and
  deployed.
