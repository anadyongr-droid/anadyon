# Staging and observability runbook

**Status:** the isolated Supabase project exists, has been reset twice by the
owner, and the four staging-only GitHub Actions secrets are installed. Hosted
Preview/vendor/Sentry acceptance remains open. Codex must not run migrations
against any hosted Supabase project.

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

The command dumps only the `public` schema and never dumps rows. Equal
SHA-256 output is a pass. A mismatch prints lines found only in production and
only in staging and retains both dumps in a newly created temporary directory.
Every difference must be explained or closed before staging is trusted.

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
- [x] `npm run staging:reset` passes twice consecutively (31 August 2026).
- [ ] `npm run check:schema:parity` reports equality or every difference is documented.
- [ ] Synthetic admin and staff can log in and enrol MFA.
- [ ] Staff is refused administrator-only actions.
- [ ] Browser booking succeeds: quote → reservation → redirected email.
- [ ] Document upload and signed download work in `reservation-documents`.
- [ ] Stripe test-mode webhook and payment flow work on the stable branch alias.
- [ ] AADE sandbox flow is tested when sandbox credentials exist.
- [ ] Manual morning briefing returns successfully without reaching production Telegram.
- [ ] Sentry receives browser, server and proxy errors with raw-event privacy inspected.
- [ ] Staging e2e CI passes and has been observed failing on a deliberate break.

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
hosted project it passes 78/78 locally. The remaining §8 CI checkbox stays open
until this correction lands on `main`, the GitHub staging job passes there, and
the fail/green history is linked. Preview scoping, browser MFA, documents,
Stripe, AADE, the morning briefing and Sentry remain separate hosted acceptance
items; none is implied complete by the database or CI evidence above.
