# Staging and observability runbook

**Last verified:** 4 October 2026, Claude — **section 17 is rewritten where it had gone stale: the fingerprint has now run against production three times and every one of W42 to W46 came from running it, none from reviewing it.** The "never yet run" paragraph is replaced by what the three runs found, and "why the `pgaudit` migration is still unwritten" by the migration itself — 047 audits by object rather than by role, which makes the unanswerable dashboard-role question irrelevant; it is written, not applied, and W47 is the gap that survives applying it. Earlier: 3 October 2026 (evening), Claude — **the production role inventory is now read from production** and recorded at the end of section 17: five roles bypass RLS, `service_role` cannot log in, and `supabase_read_only_user` already exists, which bears on W29. The `pgaudit` migration stays unwritten because the deciding fact — which role the dashboard editors run as — is still unanswered. Earlier the same evening: **section 17 added: the nightly production fingerprint, which is the first control here that can see a change made in a logged-in dashboard.** Tested against a real Postgres with all 45 migrations replayed, silent when production matches, and recorded as **never yet run against production** — the first scheduled night is the first real run. Also section 16 revised after Codex reviewed these controls: two paste-ready Codex files did not load at all, the gate failed open on Codex when it could not parse an event, and two bypasses are closed. The heading is weaker and the mechanisms are unchanged. Earlier the same day: section 16 added: the production Supabase data plane is now denied to both agents, verified by firing the rules in a live session rather than by reading the config, with the three things it does not cover named. Earlier: 2 October 2026, Codex.

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

1. **A read.** Selecting every customer row changes no state. `pgaudit` is the
   only thing that sees one, and it is blocked on a single unverified fact —
   which Postgres role the dashboard's editors run as. `scripts/sql/who-runs-the-dashboard.sql`
   is paste-ready for that answer; the migration is deliberately **not** written
   until it exists, because auditing the wrong role gives a log that is empty on
   exactly the activity it was installed for. **W31.**
2. **A change reverted before the next run.** The window is one night.
3. **Who did it.** A diff says what changed, never who. Attribution needs the
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

| Run | How | What it found |
|---|---|---|
| 1 — 3 Oct 23:34 | `workflow_dispatch` | **W42.** Production's `quotes` differs from `001_baseline.sql` in twelve columns, all looser; `quote_rate_limits_blocked_idx` is missing; one policy is undeclared. The drift the control was built to find, found on first use. |
| 2 — 4 Oct 05:40:42 | `schedule` (00:10 cron) | **W43** — the cron fires, five and a half hours late, so a heartbeat must look for *a* run in a day and never for a run at a time. And **W44** — every one of W42's rows came back annotated `declared as quotes`, absorbed by migration 047's marker. A declaration about grants was explaining column differences, by a migration that has not been applied. |
| 3 — 4 Oct 07:26 | `workflow_dispatch`, after the fix | `high (14)`, `normal (10)`, `explained (2)`, exit 2 — the counts predicted before it was triggered. No masked rows. Reading *which two* rows remained `explained` produced **W45** and **W46**. |

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

**W47 — still open, and the one this cannot close.** The fingerprint reads no
settings, so `pgaudit.role` being unset or `pgaudit.log` cleared stays invisible
— exactly what a project reset or a restore would do, leaving the extension and
the grants in place. It cannot be built until 047 is applied, because PGlite has
no such setting either and the expected side would read empty every night.

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

**Not applied.** Awaiting Tasos, with the paste copy
`supabase/migrations/paste/047_pgaudit_customer_object_audit_paste.sql`; W31, and
the expected-change marker in force expires 17 October. W47 is the gap that
remains even after it is applied.
