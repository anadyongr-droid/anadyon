# Staging and observability runbook

**Last verified:** 24 October 2026, Claude — **section 22 added: staging's branch is level with production, its database reset is Tasos's, and W61's premise was wrong.** The `staging` branch was 34 commits behind `main` and 0 ahead, so it fast-forwarded cleanly — and it is **not decorative**: `scripts/deployment-boundary-lib.mjs` makes it the only Vercel Preview branch permitted to carry staging Supabase credentials, so it *is* the hosted staging environment, and it had been serving code from 2 October. **The correction that matters:** W61 held that a green staging e2e proved nothing about recent work because it ran against that old deployment. It does not — `e2e-staging` checks out **the pull request's own code** and runs it under vitest against the staging *database*; nothing fetches a deployed URL and no workflow references the branch. The overstatement ran in the costly direction, reading as "do not trust the gate". **The branch was safe to move without a database reset**, verified rather than assumed: the three migrations staging lacks are 047/049 (pgaudit configuration, a `nologin` role — nothing app-visible) and 048, whose every statement is a no-op on a database built from the baseline, which staging is and production never was. **Preflight green:** all 48 migrations replay in filename order and the synthetic seed is idempotent at exactly the counts the reset asserts. **The reset stays with Tasos for three independent reasons** — it applies migrations, it drops the hosted staging database, and it reads `.env.staging.local`. Earlier: 4 October 2026, Claude — **section 17 is rewritten where it had gone stale: the fingerprint has now run against production three times and every one of W42 to W46 came from running it, none from reviewing it.** The "never yet run" paragraph is replaced by what the three runs found, and "why the `pgaudit` migration is still unwritten" by the migration itself — 047 audits by object rather than by role, which makes the unanswerable dashboard-role question irrelevant; it is written, not applied, and W47 is the gap that survives applying it. Earlier: 3 October 2026 (evening), Claude — **the production role inventory is now read from production** and recorded at the end of section 17: five roles bypass RLS, `service_role` cannot log in, and `supabase_read_only_user` already exists, which bears on W29. The `pgaudit` migration stays unwritten because the deciding fact — which role the dashboard editors run as — is still unanswered. Earlier the same evening: **section 17 added: the nightly production fingerprint, which is the first control here that can see a change made in a logged-in dashboard.** Tested against a real Postgres with all 45 migrations replayed, silent when production matches, and recorded as **never yet run against production** — the first scheduled night is the first real run. Also section 16 revised after Codex reviewed these controls: two paste-ready Codex files did not load at all, the gate failed open on Codex when it could not parse an event, and two bypasses are closed. The heading is weaker and the mechanisms are unchanged. Earlier the same day: section 16 added: the production Supabase data plane is now denied to both agents, verified by firing the rules in a live session rather than by reading the config, with the three things it does not cover named. Earlier: 2 October 2026, Codex.

**Status:** the isolated Supabase project exists and was reset twice from
current `main` on 19 September 2026. Both runs replayed all 44 migrations and
finished with identical synthetic fixtures, Auth roles, grants and schema
checks. The `staging` branch alias is live with branch-scoped Supabase URL, anon
key and service-role key; synthetic admin and staff both completed browser login
and separate MFA enrolment. The staff role was observed being redirected away
from `/admin/users` to `/admin/reservations`. On 2 October PR #185 merged and
the `staging` branch was fast-forwarded to its merge commit `5979091`; Vercel
reported the corresponding staging deployment ready and the stable alias loaded
successfully. Stripe, Resend and Sentry browser/server acceptance have passed.
Positive AADE sandbox acceptance, a fresh Sentry proxy event tagged `staging`,
the manual Preview cron and one fresh browser quote-to-reservation journey are
still open. No production AADE filing or Supabase migration was performed.
The permanent `staging` branch is now four commits behind `main`; sync and
rerun acceptance after the clean-verifier defect in audit finding A03 is fixed.
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

The checker validates that the Supabase CLI and a running Docker Desktop are
available **before it reads either URL**. Child-process output is captured and
every known or incidental PostgreSQL URL is redacted before a diagnostic can
reach the terminal. Never replace the captured runner with `execFileSync(...,
{ stdio: "inherit" })`: Node includes the complete failing command in the
exception, and `--db-url` contains the database password.

This safeguard was added after the first hosted attempt on 20 September failed
the Docker prerequisite and Node reproduced the production connection string
in its uncaught exception. No database was reached and staging was not
attempted, but the production database password required rotation. Regression
tests now simulate that exact failure and fail if a URL or password survives.

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

**Enforced boundary (20 September):** production credentials must never be
scoped to general Preview. Only the `staging` Git branch may receive server-side
test credentials, and its Supabase URL must name `fzycvstifmltxybffinq`.
`npm run build` now checks this before Next.js starts: general previews fail if
they receive Supabase or vendor server credentials; staging fails if it receives
Gmail, Telegram, Twilio, Anthropic, Apify or Wise values, a live Stripe key, an
AADE production flag, or the wrong Supabase project. The Vercel dashboard was
re-scoped on 20 September after a live audit found production credentials in
general Preview. Environment changes affect new deployments only, so older
Preview artifacts must be deleted after a clean staging replacement is ready.

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
  Browser and server delivery passed on 1–2 October. Raw browser-event JSON was
  inspected after enabling the project scrubber: geographic keys were null and
  marked removed; no geographic values were stored. Proxy delivery after #185
  and the `staging` environment tag still need one fresh hosted event.
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
- **Item 5 exposed and closed a live boundary failure.** Vercel metadata showed
  that general Preview inherited production Supabase and vendor credentials.
  Production values were narrowed to Production only; the `staging` branch kept
  only its isolated Supabase URL, anon key and service-role key. A build-time
  policy now makes recurrence a build failure. Existing Preview artifacts retain
  their build-time snapshot and are tracked for deletion under E15 after the
  clean replacement staging deployment is verified.

---

## 14. Supabase removes the automatic Data API grant — 30 October 2026

**Observed in production, 3 October 2026 — migration 046 needs no paste there.**
The first production fingerprint reported `service_role` holding privileges on
every table 046 grants: `vehicle_blocks`, `vehicle_change_requests`,
`inspection_templates` and the rest of the nine. Supabase's default privileges
granted them when each table was created, which is exactly what this section
says — *"Production is unaffected"* — now confirmed against the live database
rather than reasoned from the rule.

**So 046 remains necessary and remains unapplied, deliberately.** Its purpose is
a **replayed** environment: a staging reset, `supabase db reset`, a new project
or a preview branch, where the automatic grant will not exist after
30 October 2026. `lib/serviceRoleGrants.test.ts` holds the migrations to the
rule; production never needed the fix. One fewer thing on the operator's list,
established by the check on its first night.


**Verified against Supabase's own documentation on 23 September 2026**, not
taken from the notification email. `supabase.com/docs/guides/api/securing-your-api`
states it plainly: *"Supabase is changing the platform default to revoke these
automatic grants so that exposure becomes opt-in."* The page carries no date;
the 30 October date comes from the email to `anadyon.gr@gmail.com`.

### What actually changes

Today a table created in `public` automatically receives `SELECT`, `INSERT`,
`UPDATE` and `DELETE` for **`anon`, `authenticated` and `service_role`**. After
30 October it receives nothing unless a `GRANT` says so.

**Existing tables keep their privileges.** Production is unaffected and needs no
action. That is the whole of the good news, and it is also what makes this easy
to file as "nothing to do".

### Why it matters here anyway

The exposure is not production. It is **every database built by replaying the
migrations**: the staging reset (`scripts/reset-staging.mjs`), `supabase db
reset`, a new project, a preview branch.

This project reaches the database as **`service_role`** through `supabaseAdmin`
for essentially everything — `DEFINING-STATEMENTS.md` §6 is why: anon and
authenticated are deliberately revoked, so the service role is the application's
only route in. A replayed database whose tables carry no `service_role` grant is
not degraded, it is unusable.

### The gap, as measured on 23 September 2026

Migration **023** grants `all privileges on all tables in schema public to
service_role`. That covers every table existing **at that moment** and nothing
created afterwards.

Three tables created later were granted correctly in their own migrations —
`booking_email_deliveries`, `booking_email_events`, `promo_redemptions` — so the
convention already existed here. It was applied unevenly. **Nine were not:**

| Table | Created by |
|---|---|
| `vehicle_blocks` | `20260828120000_vehicle_blocks.sql` |
| `vehicle_change_requests` | `20260830120000_vehicle_change_requests.sql` |
| `inspection_templates` | `20260830230000_rental_handovers.sql` |
| `inspection_template_views` | ″ |
| `rental_handovers` | ″ |
| `handover_photos` | ″ |
| `handover_damage_observations` | ″ |
| `handover_damage_photos` | ″ |
| `rental_handover_events` | ″ |

That is the whole of check-out and check-in — phase 2 — plus vehicle blocking
and the change-request queue.

### Nothing we already run would have caught it

Worth stating, because both look like they should:

- **`scripts/check-grants.mjs`** asserts that anon, authenticated and PUBLIC
  hold *nothing*. It checks the **deny** side. A database where `service_role`
  also holds nothing passes it cleanly.
- **`npm run check:migration-replay`** replays against PGlite with the Supabase
  roles stubbed (`scripts/pgliteSupabaseStubs.mjs`), so grants there are inert
  by construction.

### What was done

- **Migration `20260923120000` / paste copy `046`** grants the four DML
  privileges on those nine tables to `service_role`. Narrow on purpose: it
  matches what the platform granted automatically and what the three correct
  migrations already use, and grants nothing to anon or authenticated. None of
  the nine carries a sequence.
- **`lib/serviceRoleGrants.test.ts`** walks the migrations in order, models
  023's blanket grant as covering everything before it, and fails naming any
  table created without a grant. It asserts the migration and table counts
  first, so a regex that stopped matching cannot make it pass by finding
  nothing.

### The convention from here

**A migration that creates a table in `public` grants it in the same
migration.** Recorded in `AGENTS.md` beside the rule about never applying one.
The test enforces it; the convention explains it.

**Last verified:** 23 September 2026, Claude — change confirmed against Supabase
documentation, gap measured against the migrations, replay passing at 45.


## 15. Staging deployment acceptance — 29 September 2026

**Last verified:** 29 September 2026, Codex (implementer).

Tasos requested completion of staging deployment today. The staging branch's
four historical commits comprise an empty deployment marker and three merges;
there is no staging-only application change. Main through `28150c5` was merged
without conflicts or rewriting staging history. Deployment remains pending
until the stable alias identifies the new commit.

### Schema evidence and declared limitations

Both Supabase projects report ACTIVE_HEALTHY. Read-only catalogue comparison
covered 1,098 entries on each side: public columns (types, nullability, defaults),
function definitions and ACLs, constraints, indexes, policies, table grants and
RLS flags. It found exactly these ten differences:

- Six `quotes` columns: production permits null `first_name`, `last_name`,
  `email`, `vehicle_type`, `pickup_date` and `dropoff_date`; staging requires all
  six. The two date columns are `text` in production and `date` in staging.
- `check_rate_limit` and `find_available_eligible_vehicle` differ only in
  explanatory comments and whitespace, confirmed by reading both definitions.
- Production alone has `quotes` policy `Service role only`, `ALL TO public
  USING (false)`. This permits no rows; staging's absence also defaults to deny.
  RLS flags and table grants match. No policy was removed.
- Staging alone has `quote_rate_limits_blocked_idx` on `blocked_until`, created
  by the replayed baseline. It is a performance index, not a data constraint.

The six quote differences remain a real compatibility limitation: passing a
synthetic staging journey does not prove compatibility with nullable/text
historical production rows. Preserve both schemas pending a separately reviewed
migration; no production data or schema was changed. The index and deny policy
remain documented differences, not quietly removed or masked.

Migrations 042–046 are now present in production, so the obsolete 042–045
exceptions were removed from `schema-parity-pending.json`. New tests first
failed against the old manifest. The dump checker remains strict: the known
historical differences are documented here but are **not** suppressed to report
false equality. The read-only catalogue comparison is evidence independent of
`npm run check:schema:parity`; the latter has not been run this session.

### Remaining acceptance

- Current stable deployment, credential boundary and public smoke checks: pending.
- Authenticated browser journey: pending; the Mac was locked when browser
  access was attempted. Both synthetic users still have their expected role and
  one verified MFA factor in staging; this is not proof of a current login.
- Redirected mail, Stripe, AADE and Sentry require their test-account setup and
  remain unverified. They are not implied by a successful deployment or mocked
  transport tests. No vendor messages have been sent in this session.


### 1 October 2026 — Live integration acceptance

Last verified: 1 October 2026, Codex.

Stable alias points to READY deployment dpl_CvqTbQrzg2SerMahwKjz4f7MqRjd.
Staging Stripe sandbox payment of EUR 90 on synthetic reservation
30000000-0000-4000-8000-000000000003 succeeded; return URL stayed on staging.
Stripe dashboard reported one event delivery, zero failures. Database confirms
confirmed status and deposit_paid_at 2026-09-30 23:08:07Z. Resend's delivered
callback returned 200, received=true and deliveryMatched=true; the delivery
record confirms redirected mail to anadyon.gr@gmail.com and delivered status.
These checks do not cover a fresh public quote submission.

Corrected the Resend webhook path from stripe-webhook to resend-webhook, keeping
the bypass query credential unchanged. Both vendor URLs require Vercel's bypass
parameter; do not record complete URLs in documentation.

AADE_PRODUCTION is false in Preview/staging. DCL trial reached an HTTP-success
response but the application stored submitted with null dcl_mark. This is NOT
acceptance: DCL v1.1 uses statusCode and newClientDclID; HTTP 200 can carry
XMLSyntaxError/ValidationError. Response guard fix is under development, and the
request XML still needs validation against the official schema. The synthetic
record remains submitted/null as evidence; no production rows changed.

Sentry search across project environment variables returns no results. Monitoring
acceptance and the independent staging cron configuration remain open.

### 1 October 2026 — Sentry account onboarding

Last verified: 1 October 2026, Codex.

Confirmed authenticated access to organization `anadyon-ike` and created its Next.js project `javascript-nextjs`. Manual setup displays an EU ingestion DSN. No wizard was run, no paid upgrade selected, and no additional telemetry enabled. Saved NEXT_PUBLIC_SENTRY_DSN, SENTRY_ORG and SENTRY_PROJECT as Config values scoped only to Preview/staging and verified the scope in Vercel. Redeployment and browser/server/proxy test-event verification remain pending; account creation alone does not establish working monitoring.

## 16. Agent network controls — production is denied to a direct tool call, 3 October 2026

Two agents work in this repository and both reach the internet. Neither has any
business touching the production Supabase project, and `AGENTS.md` already says
why writing that down is not enough: *"A rule that matches command strings is a
reminder to the agent that wrote the command, not a control on what the process
can do."*

So a tool call that **names** production is denied, and `tests/agentNetworkControls.test.ts`
is what stops the deny list going missing or going wrong.

**The heading of this section was weaker by the evening of the same day, and the
wording matters.** It said *"the production data plane is denied"*. Codex then got
three ordinary commands past the gate — two are now closed, one cannot be — so what
these layers deny is an **accidental, directly addressed** request. They do not
withstand a command that derives its destination at runtime, and they are writable
by the agents they govern. The boundary is staging-only credentials, external
browser policy, and configuration an agent cannot edit (W34). See section 8 of
[`agent-controls/CONSOLIDATED-2026-10-03.md`](agent-controls/CONSOLIDATED-2026-10-03.md).

### The two refs, in one place

`scripts/deployment-boundary-lib.mjs` already owned `STAGING_PROJECT_REF`. It now
also exports `PRODUCTION_PROJECT_REF` (`idfavwwfiuncoudkcfsp`, read from
`docs/audits/2026-08-18-prelaunch.md`) and `PRODUCTION_DENY_HOSTS`. Every control
that must avoid production reads from there rather than carrying its own copy of a
twenty-character string nobody would notice was wrong. Both refs are public — they
ship in the client bundle — so naming them discloses nothing.

### What each layer actually enforces, because they are not equal

| Layer | Where | Strength |
|---|---|---|
| `WebFetch(domain:…)` deny | `.claude/settings.json` | **Enforced.** Claude Code refuses the fetch. The `domain:` form also feeds the sandbox's denied-domain list, so it strengthens by itself the day sandboxing is enabled. |
| `Bash(curl*…)`, `psql`, `pg_dump`, `supabase link`, `--project-ref` | `.claude/settings.json` | **A speed bump**, in `AGENTS.md`'s sense. Catches the obvious spelling; does not survive a shell variable. Worth having, not the boundary. |
| `[features.network_proxy] domains` | `~/.codex/config.toml` | **Enforced for Codex's shell commands only — corrected 3 October, it does NOT reach the browser.** The Codex permissions documentation states *"The network proxy only filters traffic from local commands that run inside the sandbox"* and names Browser and Computer Use among what it does not control. This row previously claimed the opposite; the full correction and how the error was made are in `AGENT-ACCESS-AND-MONITORING.md` §3. Paste-ready text in `docs/agent-controls/codex-network-deny.toml`. |
| OS-level block | `sandbox.enabled` | **Deliberately not enabled.** See below. |

### Verified by firing it, not by reading the config

On 3 October, in a live session, immediately after the rules landed:

| Attempt | Result |
|---|---|
| `WebFetch https://idfavwwfiuncoudkcfsp.supabase.co/rest/v1/` | `WebFetch denied access to domain:idfavwwfiuncoudkcfsp.supabase.co.` |
| `curl` to the same host | `Permission to use Bash with command curl … has been denied.` |
| `WebFetch https://fzycvstifmltxybffinq.supabase.co/rest/v1/` | **HTTP 401** — staging still reachable |
| `grep idfavwwfiuncoudkcfsp docs/audits/2026-08-18-prelaunch.md` | ran normally |

The third and fourth rows are the point. A deny that blocked everything would also
have passed the first two, and a control that blocks the grep which audits it is a
control nobody can review. §8 asks for the claim to be checked; this is the check.

### Three things this does not cover, each a decision

**The production dashboard in a browser.** The dashboard is a *path* under
`supabase.com` and these rules match *hosts*, so excluding the production project
would take the staging dashboard and the Supabase documentation with it. A session
already signed in to the production dashboard is therefore **not covered by
anything in this section**. The nightly production fingerprint is what is meant to
catch that, after the fact; it is not built yet.

**The public website.** `anadyon.gr` is deliberately reachable. Verifying a
published claim against a rendered page is what §8 and §10 require, and it is what
caught the live terms-versus-insurance mismatch recorded as A02. Denying it would
have removed the check, not the risk.

**`api.vercel.com`.** One host serves every project, so a deny would break
legitimate staging work. Production deploys are held off by branch protection and
by the existing `Bash(vercel --prod*)` deny instead.

### Why sandboxing is not switched on here

The OS-level network block needs `sandbox.enabled`, and the sandbox's
allowed-domain list **starts empty**. Turning it on repository-wide would break
`npm ci` for every agent on the next run. That is a separate change with an
allowlist to build and test first, not a one-line addition — and claiming it as
part of this one would be exactly the gate that overstates its own assurance.

**Recorded as not done, never as done.**


### The root-owned install, fired on the Mac — 3 October 2026, 20:59

The gate no longer lives only at a path the agents may write. `scripts/install-managed-gate.sh`
installed it with `sudo`, and the result was checked rather than reported:

| Check | Result |
|---|---|
| `ls -l` on the installed gate | `-rwxr-xr-x 1 root wheel 18446` — root-owned, not the operator's account |
| 18446 bytes against `origin/main` | identical, so the installed copy is the current gate and not an older build |
| a production `curl` event piped into the root-owned copy | deny JSON on **stdout**, reason on **stderr**, **exit 2** — all three signals |
| the relocated copy's import | resolved `../../scripts/deployment-boundary-lib.mjs` beside it, which is what a flat copy would have broken |

**Fired inside a real session, 19:09 UTC.** The decision log on the Mac carries
a refusal with a `session_id` — `d97b7a78…`, a `curl` at the production host,
denied. A hand-piped event has no session id and a cloud session's log lives in
its own container, so that line can only have come from a **local Claude Code
session on this machine**. It is the first evidence of the gate refusing a real
agent, in a real session, on the machine it governs, rather than of the gate
refusing a test.

**And the installer's own two firings are not in that file**, which is worth
knowing before anything tries to collect these logs: the installer runs under
`sudo`, so its `os.tmpdir()` was root's directory and not the operator's
`/var/folders/pq/…`. **The decision log is per user.** A collector that reads one
path will silently miss decisions made under another account — the same shape as
every other control here that looked present and saw nothing.

**What that buys and what it does not.** Neither agent can edit the gate it runs
under any more, because neither holds the password that installed it — the
circularity Fable put second in the order of work is broken for Claude Code.
**But a correct file is not a file in force**, and whether Claude Code actually
loads `/Library/Application Support/ClaudeCode/managed-settings.json` is
unconfirmed until `/hooks` is read in a **new** session: managed settings are
read at startup. That distinction is precisely the one W32 collapsed, so it is
stated rather than assumed.

`allowManagedHooksOnly` remains unset, so the project hook runs too and the gate
fires twice. Harmless — both copies are the same file and agree — but the managed
one is not yet the only one.

### Round two, evening of 3 October — what was repaired, and what to run on the Mac

Codex reviewed these controls and upheld six findings. Four of them meant a control
was **inert while its test was green**, which is the operational lesson of the day:
every claim below that now carries a "verified by" was previously carried by a test
that read a file rather than by anything exercising it.

| Repaired | Was | Now |
|---|---|---|
| `codex-network-deny.toml` | `deny = [...]` — **rejected by Codex's loader**, so pasting it enforced nothing | `domains = { "<host>" = "deny" }`, the documented schema |
| `codex-hooks-template.json` | `PreToolUse` at the top level — **zero hooks loaded** | wrapped in `hooks`; commentary moved to the `.md` because a `_comment` key fails the same strict schema |
| The gate on malformed input | `permissionDecision: "ask"` — **unimplemented on Codex, which continues the call** | `deny` + reason on stderr + exit 2, which both agents implement |
| `echo '…<prod-host>' > .env.local` | allowed, because `echo` only prints | denied — a redirect ends a segment's claim to be an inspection |
| `Write` into `.env.local` | allowed, because file tools write documents | denied — an env file points at production rather than describing it |
| The denial message | named `&&`, then `cd` | names the segment that actually reaches production |

**Still open and not fixable here:** `source .env.local && npm run dev` names no
production identifier and is allowed. It is asserted in the test suite **as an
expected allow** so the limit stays visible.

**Three runs this section cannot record, because they need the Mac.** Each is on
the open items list; none takes more than five minutes.

1. **`/hooks`, then trust, then fire.** A non-managed Codex hook loads as
   `untrusted` and **does not run**. Trust it, `curl` the production host, and check
   `$TMPDIR/production-gate.jsonl` gained a line. Until then the corrected template
   is verified for *structure* only — W32 is withdrawn but not replaced by a positive
   result.
2. **Run both config files through the real loader** after any edit. The parse test
   in CI holds our transcription to the schema as documented; it cannot see a change
   on Codex's side, and `untrusted` being removed as an approval value is the
   precedent. **W35.**
3. **E29**, unchanged and still the most informative five minutes on the list:
   does `URLBlocklist` survive `pushState` inside the Supabase dashboard?

## 17. The nightly production fingerprint — post-event oversight, 3 October 2026

**What it is for.** Every other agent control in this project is *prevention*
running on the machine the agents run on: a `PreToolUse` gate, deny lists, a
Codex config. All of them see a tool call. **None of them sees a click in a
logged-in production dashboard**, which all three review passes named as the
largest residual risk. This is the one control that does, because it does not
watch the agent at all — it watches production, and something that happened
leaves a trace whatever route it took.

It is therefore **detection, not prevention**, and the honest claim is a
*latency*: an unexplained structural change or a disappearance of rows is
visible the next morning, not prevented tonight.

### How it decides what is wrong

| | |
|---|---|
| **Expected** | the migrations, replayed into PGlite on the runner |
| **Actual** | production, read through `psql` |
| **The query** | `scripts/sql/production-fingerprint.sql`, run against **both** |
| **Declared changes** | `supabase/expected-changes/` markers absorb what they named |
| **Row counts** | `scripts/sql/production-counts.sql`, compared with last night's |

**Not a committed baseline, and that is the main design decision.** A baseline
file has to be refreshed by hand after every legitimate change, and a file
refreshed by hand becomes a record of whatever production looked like the last
time somebody remembered. The migrations are already the reviewed statement of
what production should be, and they are current by construction. One query file
serves both sides so they cannot drift — `DEFINING-STATEMENTS.md` §5's rule for
pricing, applied for the same reason.

**Markers are what stop it crying wolf.** `AGENTS.md` forbids an agent applying
a migration, so a human pastes it and the structural change arrives before the
branch merges. That window is *normal*, and without a declaration this check
would fire on every legitimate migration. An alarm that fires monthly on correct
behaviour gets muted, and a muted alarm is worse than none because it still
looks present.

### Severity, and the one row that is not a question

| Severity | What earns it | Exit |
|---|---|---:|
| **critical** | a table other than `rates` or `extras_config` is readable by `anon` | 3 |
| **high** | a table or column production lacks and the code expects; a table nobody declared; RLS off; a lost `service_role` grant; a new security-definer function; rows fallen by more than 5% | 2 |
| **normal** | an added index or trigger; a small fall in rows | 0 |
| **explained** | a change an expected-change marker named | 0 |

`critical` is reserved for one thing because §6 is blunt about it: *"Row-level
security filters rows, not columns, so a readable table is a readable table."*
An `anon` grant is a customer-data exposure the moment it exists, so **a marker
never absorbs one** — a marker records what somebody intended, and `critical`
records what is true.

### What it cannot see

1. **A read.** Selecting every customer row changes no state, so no state diff
   will ever show it. `pgaudit` is the only thing that sees one, and **as of
   4 October 2026 it is configured**: migration 049 sets
   `pgaudit.role = anadyon_audit` on `postgres`, which is what the dashboard SQL
   editor runs as, and the fingerprint now watches that setting (W47). The
   dashboard-role question that blocked this for two days was never answered —
   object auditing made it irrelevant.
   **But configured is not fired, and this paragraph previously said otherwise.**
   No harmless read has been performed and no `AUDIT: OBJECT` line confirmed in
   the Postgres logs, and `pgaudit`'s own documentation describes logging as
   best-effort. Until that test runs, this is a control whose output nobody has
   seen — the shape of the four inert controls this project produced in one week.
   Treated as **not verified**, per `DEFINING-STATEMENTS.md` §8. **W31**, and the
   two steps are in it. Scope: `postgres` sessions, not the application's own
   reads — **W54**.
2. **An extension.** The fingerprint excludes objects an extension owns (W55,
   so `pgaudit`'s own two functions stop being nightly noise) and it has never
   compared the extension *list* at all, because production carries a dozen
   Supabase extensions PGlite lacks. **Those two decisions together make
   installing an extension invisible** — found by Codex on 5 October, in a change
   made the night before. An extension can add network reach (`http`, `dblink`)
   or privileged functions, so this is the sharpest blind spot currently known.
   **W57** closes it with a committed inventory compared against production, and
   until the inventory exists the check reports its own absence rather than
   passing quietly.
3. **A change reverted before the next run.** The window is one night.
4. **Who did it.** A diff says what changed, never who. Attribution needs the
   gate's decision log, and only for tool calls.

### Where the credential is, and why that matters

`SUPABASE_DB_URL` is a GitHub Actions secret — the same one the nightly backup
has used for eleven consecutive runs — and the comparison script takes **files,
never a connection string**. So an agent wrote this check and no agent can reach
the key or the database. A control an agent could reach is a control an agent
could quiet, which is the whole shape of the arrangement.

The session runs `psql` with `PGOPTIONS=-c default_transaction_read_only=on`, so
the server itself would refuse a write even from an edited file.
`tests/productionFingerprint.test.ts` separately asserts that neither SQL file
contains a writing statement.

### It carries no customer data, and that is tested

The repository is public and production holds dates of birth, addresses and
phone numbers. Both queries read catalogs and cardinalities only. The test seeds
a recognisable surname into a replayed database and **fails if it appears
anywhere in the fingerprint** — because the output leaves production nightly and
is kept as a workflow artifact for 30 days.

### A check that could not run never reports green

A missing secret, an absent file, or an empty `psql` result produces
**`NOT RUN` and a non-zero exit**, never silence. Open item E21 exists because
CI's own production drift step *exits successfully without comparing anything*
when its secrets are absent, which is worse than having no step: it looks like
cover. Tonight's counts are still stored when the comparison fails, so the night
after an incident is not blind.

### Verified, and not

**Verified here:** the catalog query runs on a real Postgres with all 45
migrations replayed and returns 29 tables; it finds exactly `rates` and
`extras_config` readable by `anon`, which is an independent confirmation of §6;
the comparison is **silent** when production matches the migrations; it exits 3
on an `anon` grant, 2 on an undeclared table or a fallen row count, 1 when it
cannot run; a seeded customer value does not reach the output. Four load-bearing
rules were neutralised one at a time and nine tests failed, then passed again
restored.

### What three real runs found — 3 and 4 October 2026

The paragraph that stood here said the query had never been run against
production and that the first scheduled night would be the first real run. It
has now run three times, and **every finding below came from running it, not one
from reviewing it.** That is the part worth keeping: this mechanism was designed
with Codex, reviewed by Fable twice, and carried 29 tests before the first run.

| When (UTC) | How | What it found |
|---|---|---|
| 3 Oct 23:34 | `workflow_dispatch` | **W42.** Production's `quotes` differs from `001_baseline.sql` in twelve columns, all looser; `quote_rate_limits_blocked_idx` is missing; one policy is undeclared. The drift the control was built to find, found on first use. **Answered 4 October:** the baseline was never run against production — the evidence and the per-column decisions are in [`MIGRATION-REPLAY-RESULT-2026-08-30.md`](MIGRATION-REPLAY-RESULT-2026-08-30.md). The undeclared policy carries Supabase's dashboard naming and exists nowhere in `supabase/`: the first object found to have been made through the dashboard, which is what this check is for. |
| 4 Oct 05:40:42 | `schedule` (00:10 cron) | **W43** — the cron fires, five and a half hours late, so a heartbeat must look for *a* run in a day and never for a run at a time. And **W44** — every one of W42's rows came back annotated `declared as quotes`, absorbed by migration 047's marker. A declaration about grants was explaining column differences, by a migration that has not been applied. |
| 4 Oct 07:26 | `workflow_dispatch`, after the fix | `high (14)`, `normal (10)`, `explained (2)`, exit 2 — the counts predicted before it was triggered. No masked rows. Reading *which two* rows remained `explained` produced **W45** and **W46**. |
| 4 Oct 21:19 | `workflow_dispatch`, after 048 and 049 were applied | **W42's fourteen `high` rows all gone** — and two new ones in their place: `pgaudit_ddl_command_end()` and `pgaudit_sql_drop()`, functions the extension installs in `public` and the replay can never hold. Permanent noise introduced by the migration meant to strengthen the check (W55). |
| 5 Oct 05:24:27 | `schedule` (00:10 cron) | **W43's second measurement: 5 h 14 min late**, after 5 h 30 min the night before. Two consistent readings, which is enough to size a heartbeat: a report is not late until it is missing for a day. Ran against the pre-fix `main`, so it still carried W55's two rows. |
| 5 Oct 06:00 | `workflow_dispatch`, after 047/048/049 and the extension fix | **The first clean run: exit 0, no `high` row, no alert.** Production and the repository agree on everything that matters. It also answered W49: zero column rows across 29 tables means `format_type` agrees between PostgreSQL 18.3 and 17.6, so W42's twelve findings were real drift and not a rendering artifact. |

**W45** — the grantee allow-list in `production-fingerprint.sql` did not include
`anadyon_audit`, so migration 047's six grants were invisible on both sides. Once
047 is applied, revoking them would disarm `pgaudit` and no run would say a word.
The allow-list stays — naming production's platform roles would put a grant row
for each on every table of every run, which is the noise that gets a check muted
— and the rot is caught instead: the suite reads every `create role` in
`supabase/migrations/` and fails naming a role the SQL does not read.

**W46** — a grant difference is reported against the table, so 047's marker
absorbed two unrelated `service_role` grant rows on the tables it names. Only
`normal` severity was masked. `explainWith` now needs the marker to name the
table **and** the grantee.

**Then Codex's second review, the same afternoon, found six more** — all
upheld, all fixed, and all of them a *missing* answer rather than a wrong one: a
grant made by a role we are not a member of was invisible (and the check connects
as `postgres`, which on Supabase is not a superuser, so a dashboard grant by
`supabase_admin` would not have appeared); an object present on both sides was
never compared, so an existing function flipped to `security definer` produced
nothing; no marker was validated on the night, so an applied one could absorb
somebody else's change forever; markers named objects and not kinds, which is
W44's root rather than its symptom; an `authenticated` grant was reported
`normal`; and the Telegram alert fired only on the comparison step's failure, so
the check went silent in exactly the circumstances where it had stopped checking.
W48 has each one, its reproduction and its fix.

**W51 — the report was unreadable from an agent container, and that was found
the same way everything else was: by running the thing.** The 4 October run
triggered to answer W49 produced its rows, sent its alert, and offered an agent
nothing through the API but the job's failure — GitHub serves logs and artifacts
from a storage domain, and the step summary is not in the API at all. Every
unexplained row is now also a **check-run annotation**, which the API does serve:
one per severity, because GitHub shows at most ten of each level per step and a
night with fourteen `high` rows would have lost four without saying so. Read them
with `GET /repos/{owner}/{repo}/check-runs/{id}/annotations`.

**W47 — BUILT 4 October, the hour it became possible.** The fingerprint now
reads `pg_db_role_setting`, filtered to `pgaudit%` entries so a co-resident
secret cannot reach a public artifact, and **compares** it rather than asserting
it one-sidedly. That became possible by accident: 047's database-level `set` is
accepted by PGlite and impossible on Supabase, so 049 arms the role-level switch
*and* `reset`s the database-level one — after which both sides carry the same
single row. Every difference is `high`, because a correct database has one row
here and there is no noise to trade against. Fired both ways before it was
trusted: production's real state today produces
`setting — expected [… pgaudit.role=anadyon_audit], found [pgaudit.log…]` at
`high`, and the armed state is silent.

### The production role inventory — read 3 October 2026

Read from production by Tasos, from the second query of
`scripts/sql/who-runs-the-dashboard.sql`. **Every login role, and every role that
bypasses row-level security.**

| Role | Super | Bypasses RLS | Can log in | What it is |
|---|:--:|:--:|:--:|---|
| `supabase_admin` | **yes** | yes | yes | the platform's own superuser |
| `postgres` | no | **yes** | yes | the project owner; what a SQL console normally uses |
| `supabase_etl_admin` | no | **yes** | yes | platform replication/ETL |
| `supabase_read_only_user` | no | **yes** | yes | **a read-only login that already exists** |
| `service_role` | no | **yes** | **no** | the application's privileged role, reached by role switch |
| `authenticator` | no | no | yes | what PostgREST logs in as, then switches to `anon` / `authenticated` / `service_role` |
| `pgbouncer`, `supabase_auth_admin`, `supabase_replication_admin`, `supabase_storage_admin` | no | no | yes | platform internals |

**Three things follow, and the third is a finding for a different item.**

**1. Five roles bypass RLS.** Every policy in the database is irrelevant to any
of them. That is not a defect — `DEFINING-STATEMENTS.md` §6 already says the
grant is the boundary and the policy is only the filter — but it is the concrete
reason the §6 rule is written the way it is: a control that depended on policies
holding against a privileged session would be no control at all.

**2. `service_role` cannot log in**, which is worth recording because it is a
small, real piece of good news: the application's privileged role is reachable
only by a role switch from `authenticator`, not by connecting with it directly.
A leaked service-role *key* is still a full read of every table through the API;
a leaked role password is not a thing that exists.

**3. `supabase_read_only_user` already exists — which bears on W29.** That item
is about giving the second agent read-only access so findings can be checked by
someone who did not write them, and it was scoped on the assumption that a
read-only credential would have to be created, possibly on a paid plan. One
exists. **It bypasses RLS, so it reads every customer row**, which makes it
exactly the wrong credential to hand an agent for *production* and a plausible
one for *staging*. Unverified: whether its password is retrievable, whether it
is the role behind the dashboard's read-only mode, and whether Supabase
documents it as supported for external use. **Checked before use, not assumed.**

### The `pgaudit` migration, written 3 October — by going around the question

This subsection previously explained why the migration was deliberately absent:
`pgaudit` is configured **per role**, auditing the wrong role produces a log that
is empty on exactly the activity it was installed for, and the deciding fact —
which role the dashboard's editors run as — could not be established. Three
attempts failed and are worth keeping, because each looks like it should work:
the Table Editor has **no query box**; `pg_stat_activity` showed no new
connection, because a dashboard read is a short-lived connection already closed
by the time the next query runs; and the Postgres logs returned nothing, because
Supabase logs neither connections nor statements by default. All that is proven
is that the SQL editor runs as `postgres`, tagged
`supabase/dashboard-query-editor`.

**`pgaudit` also audits per object, and that makes the question irrelevant.**
Migration `20261003233000_pgaudit_customer_object_audit.sql` names the tables
instead of the roles: a `nologin noinherit` role `anadyon_audit` is granted on
the six tables worth watching, `pgaudit.role` is pointed at it, and any role
touching them is logged — including one nobody identified. Reads are audited on
`customers`, `reservations` and `quotes`; writes only on
`booking_email_deliveries`, `booking_email_events` and `emails`, because the
admin mailbox view and the delivery poll read those constantly and read-auditing
them would produce a log nobody can read, which is how auditing gets switched
off.

The grants expose nothing: the role cannot log in and has no members, so its
privileges are never exercised — they are the documented mechanism for telling
`pgaudit` which objects to watch. §6 holds because that boundary is unreachable.

**Two statements may be refused and each is wrapped.** `pgaudit.log` and
`pgaudit.role` are superuser-set, and `postgres` on Supabase is not a superuser
(`rolsuper = false`, read from production 3 October). If they are refused, the
extension, the role and the grants still apply and only the switch is missing —
enable `pgaudit` from **Dashboard → Database → Extensions** and re-run the file.
**The migration is not done until the verification query in its header returns a
row**; if it returns nothing, auditing is off whatever the file printed.

**Applied 4 October 2026 — and it did not arm the audit. Two corrections
follow, and both are mine.**

**The switch could never have worked as 047 wrote it.** 047 used
`alter database <current> set pgaudit.role`, wrapped, on the reasoning that the
parameter is superuser-set and might be refused. It was refused, and the header
then told the operator to enable the extension and re-run the file — which would
have failed identically, for ever. Supabase's own documentation for the extension
says why: *"Supabase limits full privileges for file system and database
variables, meaning PGAudit modifications can only occur at the role level."*
Their published recipe is three statements and the middle one is
`alter role "postgres" set pgaudit.role to '<audit role>'`. 047 did the first and
the third; **migration 049 does the second.**

**And it was nearly recorded as working.** The status query after the paste
returned `switch_rows 1`, which I read as "the switch is set". It says *a* row in
`pg_db_role_setting` mentions pgaudit, not which one. Reading the row showed only
`pgaudit.log=ddl, role, write` on `postgres`: writes, DDL and role changes
logged, **reads not**. A count is not an identity, and §8 exists for exactly this.

**The scope claim in 047 is narrower than written.** Its header says object
auditing means "any role touching them is logged, including one nobody
identified". That holds for the database-level switch Supabase does not allow. At
the role level the audit covers sessions **of the role it is set on** — here
`postgres`, which is what the dashboard SQL editor runs as. So it covers
precisely the path every review called the hardest and no other control can see:
a person reading customer data in a logged-in browser. It does **not** cover the
application's own reads, which arrive as `authenticator` →
`anon`/`authenticated`/`service_role`. Auditing those would log every admin page
view, and a log nobody can read is how auditing gets switched off — the same
reasoning 047 used for the email tables. A deliberate limit, recorded as one
(W54).

## 18. Every alert path, and which of them has actually fired — 20 October 2026

*Written in answer to a one-line question — "are all alert firing scripts up and
running now?" — which turned out not to have a one-line answer. There are four
paths, not one, they do not share a credential, and "configured" and "proven"
are different states. The list below is what each one is and how it was
established, so the next person asking does not have to re-derive it (§9).*

**The channel is one Telegram group; the credential is two different places.**
Three paths run on GitHub's machines and read `TELEGRAM_BOT_TOKEN` and
`TELEGRAM_CHAT_ID` from **Actions secrets**. The fourth is the application, and
it reads the same two names from **Vercel → Project → Settings → Environment
Variables**. Proving one says nothing about the other, which is why E17 closing
did not close E20.

| Path | What fires it | Proven? |
| --- | --- | --- |
| `production-fingerprint.yml` | Nightly, 00:10 UTC. Any `high` difference, **or any earlier step failing**. | **Both directions.** Fired for real four times (4–5 October); silent across ten consecutive clean nights, 11–20 October; and the early-failure branch fired deliberately on 8 October via `simulate_early_failure` — run 37783295976, step 6 `failure`, "Tell someone" **success**. |
| `backup.yml` | Nightly, 23:30 UTC, `if: failure()` only. | **Channel yes, this path no.** Twelve consecutive successes to 20 October, so the step has not run since it was repaired on 21 September. `simulate_failure` is added today for exactly this reason — see below. |
| `alert-test.yml` | Manual only. Its whole purpose is proving the channel. | **Yes, today.** Run 39397051787, 20 October 08:56 UTC, success — and `scripts/send-telegram-alert.mjs` fails the step unless Telegram answers `ok: true`, so a green run means a message arrived rather than that a request was sent. |
| The application — `lib/telegram.ts`, called by the Stripe webhook, the morning briefing cron, the email watchdog and the mailer | Deposit received, booking not stored, briefing, health check. Vercel credentials. | **No. This is E20 and it has never fired in evidence anyone can read.** |

**`ci.yml` is deliberately not on this list.** Its two `if: failure()` steps
upload Playwright artefacts; they send nothing. A failed CI run reaches Tasos
through GitHub's own notification email, and adding a Telegram alert for a red
branch would train the reader to skim the channel — the habit the backup alert
depends on not existing.

### Why the application path cannot be proven by reading the code

`lib/telegram.ts` is the one path that fails quietly, and in two different ways:

- **No token:** it logs `TELEGRAM_BOT_TOKEN not set — skipping Telegram alert`
  and **returns**. Nothing goes red, nothing queues, and the console it writes
  to is Vercel's.
- **No chat id:** it falls back to a **hardcoded** group,
  `-1003920236402`. So a missing variable does not fail — it posts somewhere,
  possibly somewhere nobody is watching.

Both are reasonable for a library that must not turn a missed alert into a
failed payment, and both mean the code cannot tell you whether the path works.
The Actions-side script `scripts/send-telegram-alert.mjs` makes the opposite
choice on purpose — it requires both names and exits 1 — because a workflow step
has nothing to protect.

### What does answer it: `alert_outbox`

`scripts/sql/readonly/alert-outbox-health.sql`, run through the read-only
production query workflow, reads the table that `lib/telegram.ts` writes to when
a delivery fails. The four outcomes it distinguishes are in the file's own
header. The one that needs care is **no `tg:` rows at all**, which means either
every send succeeded first time or none was attempted — distinguished by the
`briefing:` rows the morning cron writes on every run whether or not it alerted.

**It reads no payload.** An alert body can carry a customer's name and booking,
and this output lands in check-run annotations on a public repository; keys,
timestamps and Telegram's own error description are what is diagnostic anyway.

So E20 splits. Half of it is now an agent task — read the table, which needs
nobody at a keyboard. The other half, confirming the two names exist in Vercel,
is a dashboard an agent cannot see, and stays with Tasos.

### `backup.yml` gains an on-demand failure

`workflow_dispatch` now takes `simulate_failure`, which exits the dump step
non-zero **before it connects to anything** — so the job fails where a real dump
failure would, with no database access, nothing uploaded, and the previous
night's archive untouched.

This is the same correction `simulate_early_failure` made to the fingerprint on
8 October, and it is here for the same reason: the alert was rewritten on
21 September after four failed runs had each reported the old inline `curl` as
successful while nothing arrived, and every run since has succeeded. A repair
that has not been exercised is a repair nobody has seen work. Re-fire it whenever
this workflow changes.

### What the queue actually said — read 20 October, run 39397701195

```
 section        | prefix               | rows | unsent | newest      | oldest
 by prefix      | booking-confirmation | 2    | 0      | 2026-08-23  | 2026-08-23
 by prefix      | briefing             | 64   | 0      | 2026-10-20  | 2026-08-16
 by prefix      | urgent               | 27   | 0      | 2026-08-22  | 2026-08-16
 by prefix      | watchdog             | 7    | 0      | 2026-08-21  | 2026-08-17
 telegram queue | tg:                  | 0    | 0      | 0 abandoned | none ever queued
```

No `delivery error` row came back at all, so nothing in the table has ever
carried an `error`.

**What this establishes.** The Vercel cron runs — 64 `briefing` rows, the newest
dated **today**, across 65 days. And `queue()` has **never** written a row, so no
alert has ever been recorded as undelivered.

**What it does not establish, and this is the trap the query was built to
avoid.** Zero `tg:` rows is consistent with two opposite worlds:

1. every application alert was accepted by Telegram first time; or
2. **`TELEGRAM_BOT_TOKEN` is absent in Vercel**, in which case `sendTelegram`
   returns *before* `deliver()` and therefore before `queue()` — total silence,
   nothing sent and nothing recorded.

The `briefing` rows cannot break the tie either: the row is inserted with
`sent_at` already set, **after** `sendTelegram(msg)` and regardless of what it
returned. It records that the cron reached the end, not that a message arrived.

### The thing that does break the tie, and it is a button

`lib/healthChecks.ts` already has `checkAlertChannel`, and it is written to
distinguish exactly these cases: no token ("alerts are skipped silently, not
even queued"), a token that is not shaped like one (the two variables holding
each other's values), and otherwise the **last four digits of the chat id in
use** — which answers "is it the hardcoded fallback or the configured group?"
without echoing a credential.

It runs behind **Admin → Settings → Site health**, on a button, by deliberate
design: `formatHealthAlert` delivers failures over Telegram, so a broken alert
channel cannot report over Telegram that it is broken.

So E20 does not need a Vercel expedition after all. It needs one admin login and
one button — and the deployment answers the question about itself, which is what
section 17's reasoning said a control should do.

## 19. Are the backups actually there — answered from the bucket, 20 October 2026

*Asked by Tasos on seeing the simulated failure alert: "I now wonder if we only
got a backup failure because we checked — have we been creating backups for the
last four weeks?" The question was better than the evidence available to answer
it, which is why this section exists.*

**The answer is yes, and it is now read from the bucket rather than inferred.**
`backup-inventory.yml`, run 39402993779:

```
=== daily ===
30 archive(s), 2026-09-21 to 2026-10-20, median 163400 bytes
The backups are present and unbroken.

=== monthly (reported, not enforced) ===
  2026-09-01 23:33:31     138176 anadyon-2026-09-01T23-33-24Z.tar.gz.enc
  2026-10-01 02:16:38     162368 anadyon-2026-10-01T02-16-33Z.tar.gz.enc
```

Thirty dailies on thirty consecutive dates — the retention limit exactly, so the
bucket is full rather than short — no missing night, nothing stale, nothing
below a fifth of the median size. Two monthlies, one per month since the scheme
started.

### Why the three things that already existed were not good enough

Each of these *was* true, and none of them answers the question:

1. **The run history.** 30 scheduled runs on 30 consecutive dates, all green.
   This is the weakest evidence in the building, because it is **specifically
   the evidence that lied on this workflow**: four failed backups reported the
   alert step as successful while nothing was delivered (E17). A green tick
   means a step exited 0.
2. **Last night's log.** The archive was built (161K), `archive decrypts and
   lists cleanly`, and `aws` confirmed `upload: … to s3://***/daily/…`. Good
   evidence about **one night**.
3. **The prune line.** `removing daily/anadyon-2026-09-20T16-17-50Z…` — the
   prune keeps thirty, so deleting exactly one dated 20 September means
   thirty-one objects existed spanning a month. **But a count is not a
   distribution.** Thirty-one objects between 20 September and 20 October is
   equally consistent with a fortnight of doubled uploads and a fortnight of
   nothing. This is the same error as `switch_rows 1` in section 17: *a count
   is not an identity*, and it is the second time it has nearly been made here.

The listing is the only one of the four that distinguishes those cases, which
is the general lesson: **the artefact, not the job that was supposed to produce
it.**

### What the check enforces, and what it deliberately does not

Three failures, each chosen against a way this could rot silently:

| Failure | Why it is a failure |
| --- | --- |
| A missing day inside the window | The job is nightly; a date with no archive is a night that produced nothing, whatever the run log said. |
| Newest older than 48 hours | A bucket of correct but old archives is a stopped schedule. 48 rather than 24 because the job starts at 23:30 UTC and has drifted past midnight. |
| An archive under a fifth of the median | The dump guard refuses a file under 100 bytes, but it runs **before** compression and cannot see an archive that shrank because a table stopped being dumped. Measured against the bucket's own median so no constant needs maintaining as the database grows. |

Two archives on one day is **reported, not failed**: a re-run produces one
legitimately, and a doubled schedule produces one illegitimately, so it is said
rather than enforced. The monthlies are listed but not checked — one object a
month makes "a missing day" meaningless there.

### What it still does not prove, and this is the honest limit

**That an archive restores.** Listing a file is not opening it, and the nightly
job's own decrypt check reads only the archive it has just made in memory — it
has never opened one that came back out of R2. A 30-object bucket of
undecryptable files would pass every check in this section.

That is **E23**, the restore drill, and it stays open. This section narrows what
E23 has left to prove — the archives exist, are the right size, and cover every
night — which is worth having, and is not the same as proving one restores.

## 20. The restore drill, and what the first real run found — 20 October 2026

*E23, open since the backups began, closed by running it rather than by
scheduling an afternoon for it. `restore-drill.yml`, first run 39407010918.*

**The headline, and it is the answer to the question E23 asked:**

```
restored anadyon-2026-10-20T01-58-16Z.tar.gz.enc
  29 table(s) restored, 29 in production; 1742 rows restored against 1744 live
  note: 2 table(s) are behind production, which is expected of an overnight dump:
        alert_outbox (99/100), quote_rate_limits (9/10)
```

**Every public table came back, with every row but two** — and those two are
rows written to production between the 01:58 dump and the 10:07 comparison, in
the two tables that take a row on ordinary traffic. The archive stored in R2
on 20 October is a complete copy of the rental system's data, verified by
restoring it, not by inspecting it.

### What the pipeline proved on the way

Each of these had never been done before with an archive that had been
*stored*, as opposed to one still in the memory of the job that made it:

1. The object was **fetched** from R2 with the credentials in Actions secrets.
2. It **decrypted** — AES-256, PBKDF2 at 600k iterations, with the passphrase
   from a secret. This is the step that would have exposed a passphrase
   changed since the archive was written, and the one no previous check could
   reach.
3. It **unpacked** to `roles.sql`, `schema.sql`, `data.sql`.
4. `schema.sql` **built the public schema** in a stock PostgreSQL 17.
5. `data.sql` **loaded every row**.

### What it found that is a genuine limitation, not noise

**The `auth` and `storage` schemas do not restore outside Supabase.** The dump
faithfully contains them — `auth.users`, `auth.sessions`, `auth.identities`,
`auth.mfa_factors`, `storage.objects` and the rest — and a plain PostgreSQL has
nowhere to put them, because those tables are created by Supabase's own
platform migrations rather than by anything in this repository. The first run
reported 24 such errors.

That is worth stating plainly because it changes what a recovery looks like:

- **The rental data recovers anywhere.** Reservations, quotes, vehicles, rates,
  costs, damages, the AADE queue — all of it restores into any PostgreSQL 17.
- **Staff identities recover only into a Supabase project.** A new project,
  then `schema.sql` and `data.sql` — or staff re-invited and MFA re-enrolled,
  which is the documented path in section 2 and takes minutes rather than
  being a data-loss event.

So the honest statement of recovery position is: *the business data is safe and
proven restorable; the login layer is a rebuild, not a restore.* Nobody had
written that down before, because nobody had tried it.

### Where the classification draws its line, and why there

`scripts/restoreDrill.mjs` tolerates an error naming a relation in a **platform
schema** — `auth`, `storage`, `realtime`, `graphql`, `vault`, `extensions` —
and fails on anything naming `public`. Two narrower exemptions cover
`auth.users` and `storage.buckets` having fewer columns in the shared stubs
than in Supabase, and two name the `supabase_realtime` publication and the
pgaudit event-trigger functions, neither of which a stock server has.

**`public` is ours and is never exempt.** `tests/restoreDrill.test.ts` proves
it: widening the patterns to any schema makes three tests fail, and that was
run deliberately before trusting them. Tolerating wholesale would have buried
`relation "public.reservations" does not exist` among two dozen platform lines,
which is precisely the line the drill exists to surface.

### What is still not proven

That a **Supabase project** can be rebuilt from these files end to end. The
drill proves the archive is complete and loadable; it does not create a project
and point the application at it. That is a larger exercise, it needs Tasos's
dashboard, and it is now the only part of E23 left — recorded as **W60** rather
than left inside a closed item.

### The first alert it sent was wrong, and that is a defect in the alert

The run above failed, so the drill sent:

> ❌ **Restore drill failed.** The newest off-site archive did not restore into
> a usable copy of the database. The backups may be unrecoverable — this is the
> check that opens one.

**The alarm was real and the diagnosis inside it was invented.** The job had
failed, so firing was correct; but the same run had restored 29 of 29 tables
and 1,742 of 1,744 rows. Nothing about it suggested the backups were
unrecoverable. Tasos asked whether the message was valid information, which is
how it was found.

This is worse than a clumsy sentence, and `backup.yml`'s own comment says why:
a nightly "backup succeeded" message trains the reader to ignore the channel.
An alert that announces a disaster during a **successful** restore does the
same thing faster, because the next real one is read as another false alarm —
and this project has already spent weeks on an alert channel nobody trusted.

`scripts/restore-drill-alert.mjs` now builds the message from the verdict file
and keeps three cases apart:

| What the run established | What the alert says |
| --- | --- |
| A table missing, or empty where production has rows | *Data did not come back*, naming the table and the counts, because the alert is read on a phone away from the log |
| Errors in `public` but the counts came back | *The data itself came back* — serious, worth reading, **not** a lost backup |
| It never reached a restore | *The drill could not complete* — this says nothing yet about whether the archive is good |

`tests/restoreDrillAlert.test.ts` holds them apart: restoring the original
wording fails six of its nine tests, which was run before trusting them.

**The general rule this is an instance of.** An alert may state what the run
established and what to do about it. It may not state what the failure might
mean. The fingerprint learned the same lesson from the other direction when a
count was read as an identity — here a failure was read as a diagnosis.

### The confirming run, 39417766890

With the classification corrected, the same archive run again:

```
restored anadyon-2026-10-20T01-58-16Z.tar.gz.enc
  29 table(s) restored, 29 in production; 1742 rows restored against 1744 live
  45 platform error(s) tolerated (Supabase roles and schemas a plain Postgres lacks)
  note: 2 table(s) are behind production, which is expected of an overnight dump:
        alert_outbox (99/100), quote_rate_limits (9/10)
The archive restores to a usable copy of production.
```

Exit 0, and the "Tell someone" step **skipped** — the drill is silent when the
backups are good, which is the behaviour the whole alert design depends on.
Forty-five platform errors tolerated and none in `public`.

**Both directions are therefore exercised**, which is the standard section 18
holds every alert path to: this one has fired on a failure (39407010918) and
stayed quiet on a success (39417766890), on the same archive, hours apart.

## 21. The Data API change, checked once more ten days out — 20 October 2026

*Supabase emailed a reminder on 20 October: from **30 October** a table created
in `public` receives no Data API privileges unless a `GRANT` says so. This
section is what re-checking the position found, and it belongs here rather than
in a new document because section 14 already owns the subject (§9).*

**The position is unchanged and holds.** Migration 046 is applied and verified
in production (28 September, open item M5), `lib/serviceRoleGrants.test.ts`
keeps every table a migration creates granted to `service_role`, and no
migration since 046 creates a table. Nothing in the email was new.

### Two things the email's generic advice would get wrong here

Supabase's suggested snippet grants `select` to `anon` and full CRUD to
`authenticated`. **Following it would break §6.** This application talks to the
database only as `service_role`, through `supabaseAdmin`; `anon` and
`authenticated` are revoked deliberately and `scripts/check-grants.mjs` asserts
they hold nothing. The two exceptions — `rates` and `extras_config` — are
granted `select` to `anon` by migration 023 explicitly, so a replay recreates
them without help from the platform.

**Sequences are a non-issue, and for a reason rather than by luck.** Every
primary key in this schema is a `uuid` with `gen_random_uuid()`; there is no
`serial` or identity column anywhere, so no sequence needs `usage`. Migration
023's `grant all privileges on all sequences in schema public to service_role`
covers what exists. A future migration introducing a serial column would need
its own sequence grant, and the test does not model that — recorded here rather
than left as a surprise.

### What re-checking nearly got wrong

**Views were outside the model, and that looked like a live defect.**
`public.vehicle_open_damage` is a view created on 30 August 2026, after 023's
one-time blanket grant; migration 046 and the test both matched `create table`;
and the nightly fingerprint's grant section filters `relkind in ('r','p')`, so
nothing in this project inspects a view's privileges. The admin damages
endpoint reads that view as `service_role`.

Production was then read through the read-only query workflow, run
**39493105577**:

```
      view_name      |   grantee    |                      privileges
---------------------+--------------+--------------------------------------------------
 vehicle_open_damage | postgres     | DELETE, INSERT, MAINTAIN, REFERENCES, SELECT,
                                      TRIGGER, TRUNCATE, UPDATE
 vehicle_open_damage | service_role | DELETE, INSERT, MAINTAIN, REFERENCES, SELECT,
                                      TRIGGER, TRUNCATE, UPDATE
```

A migration was written on the strength of that — **and withdrawn, because
there was nothing to fix.** The view's own migration grants it on line 55:

```sql
grant select on public.vehicle_open_damage to service_role;
```

**The trap is worth naming, because it is specific to reading grants.**
Production holds *all eight* privileges where the migration grants exactly one.
Production having **more** than the repository reads like the repository having
**none** — and the platform default had in fact added the other seven on top of
our `select`. §8 says verify against the live system; it does not say a single
reading cannot be misread. The second grep — for a grant naming the view, in
the view's own file — is what settled it, and it should have been the first.

### What was kept

- **`scripts/sql/readonly/view-grants.sql`**, so a view's privileges are
  answerable without a dashboard. Nothing else in the project could answer it.
- **The test now models views as well as tables** — a preventive extension, not
  a fix. It passes today because the one view is granted; it was proved able to
  fail by injecting a synthetic ungranted view, which it named.
- **§6 is now verified for views, which it never had been.** No `anon`, no
  `authenticated` on `vehicle_open_damage`, and the reason is worth keeping:
  023's `alter default privileges in schema public revoke all on tables from
  public, anon, authenticated` reaches objects created *later*, so it covered a
  view written six weeks afterwards. **The revoke side was future-proof; the
  grant side was not** — which is exactly why 046 had to exist and why the
  automatic grant's removal is survivable here.

### Nothing is needed from Tasos for 30 October

No migration to apply, no setting to change. The deadline passes without
action: production keeps its existing grants, and a replayed database carries
every grant it needs in the migrations themselves.

## 22. Bringing staging level with production — 24 October 2026

Asked for directly: *"bring the staging project in line with production."* It
decomposes into two halves that are **not** the same thing, and only one of them
is an agent's to do.

### W61's premise was wrong, and the correction changes what needs doing

W61 said the staging end-to-end suite *"passes — but against a deployment built
from `6276d32` (PR #196, 2 October), so a green staging run currently says
nothing about anything merged in the last three weeks."*

**That is not how the suite runs.** `.github/workflows/ci.yml`'s `e2e-staging`
job checks out **the pull request's own code** and runs it in-process under
vitest; `tests/e2e/setup.ts` then points that code at the staging *database*,
asserting the host is exactly `${STAGING_SUPABASE_PROJECT_REF}.supabase.co`
before any client is constructed. Nothing in the job fetches a deployed URL, and
no workflow in the repository references the `staging` branch at all.

So the code under test has always been current. When #223 ran its staging e2e
today it ran **#223's** code. **The green run was a real signal about recent
work, not a stale one** — W61 overstated the problem, and in the direction that
reads as "do not trust the gate", which is the costlier error.

**What was genuinely stale is different, and there are two of them:**

1. **The hosted staging deployment.** The branch named `staging` is not
   decorative: `scripts/deployment-boundary-lib.mjs` makes it the *only* Vercel
   Preview branch permitted to carry staging Supabase credentials, and it
   *requires* them — every other preview branch fails the boundary if it has
   any. So `staging` **is** the hosted staging environment, and it was serving
   code from 2 October.
2. **The staging database.** Three migrations exist on `main` that a staging
   reset would replay and that staging's last reset predates — 047, 048, 049.
   Its synthetic fixtures are also from the 2 October reset.

### Done: the branch, fast-forwarded

`staging` was **34 commits behind `main` and 0 ahead**, so it took a
`--ff-only` merge with no merge commit and nothing to reconcile.
`git diff origin/main..origin/staging` is now empty.

**It was safe to do without touching the database**, and that is worth stating
because the obvious worry is deploying new code onto an old schema. The three
migrations staging lacks cannot break application code:

| Migration | What it does | App-visible? |
|---|---|---|
| 047 | `create extension pgaudit`, a `nologin` role `anadyon_audit`, grants to it, pgaudit settings | **No** — audit configuration only |
| 049 | `alter role postgres set pgaudit.role` | **No** — one configuration parameter |
| 048 | `alter column … type date` / `set not null` / `numeric(10,2)` on `public.quotes`, one `create index if not exists`, one policy if absent | **No** — see below |

048 is the one that looks dangerous and is not. It exists because
**production's `quotes` was never built from the baseline** — `001_baseline.sql`
was never run against it — so production had drifted in *shape* and 048 closes
that. Staging is built by replaying every migration **from** the baseline, so
staging's `quotes` already has the shape 048 imposes; every statement in it is a
no-op against a correct schema. Confirmed by replay rather than assumed: 048
applies cleanly on top of a database built from the baseline alone.

### Preflight run, so the reset is not a leap

`npm run check:migration-replay` — **48 migrations applied in filename order,
passed**, including 046–049, and it also verified the synthetic seed is
idempotent and produces exactly the counts `scripts/reset-staging.mjs` asserts
afterwards: **29 vehicles, 5 customers, 6 reservations**, an open damage and the
private `reservation-documents` bucket.

That is the same work a hosted reset does, so a clean replay is direct evidence
the reset will succeed rather than fail halfway.

### Not done, and it is Tasos's for three separate reasons

The database half is `npm run staging:reset`, and an agent must not run it:

1. **It applies migrations.** `AGENTS.md` and `DEFINING-STATEMENTS.md` put that
   with Tasos without distinguishing staging from production, and the reason —
   a stale paste copy once reached production — does not become irrelevant on a
   staging target.
2. **It is destructive.** `supabase db reset --db-url` **drops the hosted
   staging database** before replaying. No real data is lost (the fixtures are
   synthetic and `supabase/seeds/staging.sql` says so on its first line), but an
   irreversible drop against a hosted project is not an agent's unprompted call,
   and `.claude/settings.json` denies the command as a reminder of exactly that.
3. **It needs credentials an agent cannot read.** The script loads
   `.env.staging.local`, and `Read(./.env*)` is denied precisely so a
   service-role key never enters an agent's context or transcript.

**The steps, paste-ready, in order.** Run from the repository root on a machine
with Docker Desktop running and `.env.staging.local` present:

```sh
# 1. Preflight — already green here on 24 October, but it is seconds and it is
#    the thing that proves the replay the reset is about to perform.
npm run check:migration-replay

# 2. The reset itself. CONFIRM_STAGING_RESET is deliberately not readable from
#    any env file, so it must be typed each time.
CONFIRM_STAGING_RESET=yes npm run staging:reset
```

`reset-staging.mjs` verifies its own target three ways before touching anything,
then replays all 48 migrations, loads the synthetic fixtures, seeds both
synthetic Auth users, asserts the counts above, and runs `check:grants`
automatically. If any count is wrong it throws rather than reporting success.

**Then, optionally, the two-way schema comparison** — this is the only step that
answers *"is staging now identical to production?"* rather than *"is staging
built from the repository?"*, and it needs both database URLs:

```sh
PRODUCTION_SUPABASE_DB_URL=… STAGING_SUPABASE_DB_URL=… npm run check:schema:parity
```

Section 4 covers how that check protects the credentials in its own failure
output, and why the captured runner must never be replaced with
`stdio: "inherit"`.

### What remains unverified from here, deliberately

**Which migrations the staging database currently holds has not been read**, and
cannot be from an agent container — there are no staging credentials in it. The
047/048/049 gap above is inferred from the branch's date and the migration
history, not from querying staging. It does not change the action: a reset
replays all 48 regardless of what is there now, which is why the reset is the
answer rather than applying three files.

**The hosted staging deployment did come up green.** Vercel reported
`success — Deployment has completed` against `2287438` on the fast-forwarded
branch, so main's code is now building and running in the staging environment
against the staging Supabase project. That is the half of "in line with
production" that is finished: same code, same deployment boundary, a database
still carrying 2 October's fixtures until the reset above is run.
