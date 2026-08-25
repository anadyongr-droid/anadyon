# Anadyon production optimisation and security review

**Date:** 19 August 2026  
**Production:** `https://anadyon.gr`  
**Reviewed revision:** `aff7175c8fd558c175e8558549f74487101a926b`  
**Vercel deployment:** `dpl_XtXGYsJ4DL5RnUa6MFpUcPaNAv7f` (`READY`, production)  
**Method:** read-only production checks, live browser inspection, Vercel runtime/deployment review, GitHub/CI review, source review, dependency audit, and live Supabase schema/security/query inspection. No production data or repository code was changed.

## Executive conclusion

The public site is currently available, the price estimate now renders immediately in the booking modal, the latest production deployment is healthy, and I did **not** find a presently exploitable Critical vulnerability in the reviewed surfaces. The earlier anonymous access to privileged database functions remains closed.

The system is nevertheless **not yet at the strongest operational-security posture**. Four High-priority items should be addressed promptly:

1. The public booking write is not atomic and ignores both database insert results. It can tell a customer the request succeeded even if the quote or reservation failed, and can consume a promo use without preserving the booking.
2. The live Supabase project has no `reservation-documents` Storage bucket, so the admin document feature is not operational.
3. The daily morning-briefing job has already exceeded its 60-second runtime and still performs several network-heavy jobs serially in one function.
4. GitHub `main` is unprotected, Dependabot security updates are disabled, and code scanning is absent. A direct or compromised push can reach production without an enforced review/check gate.

**Recommendation:** keep the public site live, but treat items H1–H4 below as an immediate hardening sprint. Until H1 is fixed, monitor every web submission and reconcile quote/reservation pairs. Current live data is reassuring: all eight website bookings created on 18–19 August have a matching quote and reservation; the code still does not guarantee that property.

No audit can guarantee that a system is “fully protected from hacking.” The meaningful target is layered controls, least privilege, failure containment, monitoring, tested recovery, and rapid patching. This review found a sound base—server-side price recomputation, MFA enforcement, signed webhooks, RLS, reCAPTCHA, durable rate limiting and strong response headers—but several layers need tightening.

## What passed

- Production deployment is `READY`; current pages returned 200 and no broad production 5xx pattern was present.
- Latest GitHub CI run passed, including the new browser regression suite.
- Local verification: **138/138 unit tests**, **60/60 SEO checks**, TypeScript, production build, translation audit and static accessibility audit passed.
- `npm audit --omit=dev`: **0 known dependency vulnerabilities**.
- Current GitHub secret-scanning alerts: **0**; push protection is enabled.
- No hard-coded production secret was found in the current tracked tree by targeted pattern scanning.
- Anonymous calls to the five previously exposed privileged functions now fail with permission denied; function execution is limited to the service role.
- Supabase is `ACTIVE_HEALTHY`; business queries observed in `pg_stat_statements` are fast (typically about 1 ms). The database engine is not the main source of the perceived delay.
- Server-side pricing is authoritative. Client totals are discarded and recomputed from the live rate card.
- Stripe and Resend webhook signatures are validated against the raw body. The Resend webhook now rejects a forged signature with 401.
- Admin routes deny roleless accounts and enforce TOTP MFA.
- Live headers include HSTS, CSP, `frame-ancestors 'none'`, `object-src 'none'`, `nosniff`, a restrictive permissions policy and a strict referrer policy.
- `www.anadyon.gr` redirects permanently to the apex domain.
- The booking modal opened successfully in the live browser and displayed the price estimate immediately, with no client-side rate request required for the initial render.
- The latest CI Chromium test covers 320, 360, 375, 390, 430 and 768 px widths, the promo row, and immediate price rendering. The production-revision CI run passed.

## Severity-ranked findings

### High

#### H1 — Booking persistence is not atomic and errors are ignored

**Evidence:** `app/api/quote/route.ts:238-347`. `redeem_promo` increments `used_count` first. Quote and reservation inserts then run in `Promise.all`, but Supabase returns `{ data, error }` rather than throwing; neither result is inspected. The two records and promo redemption are separate transactions.

**Impact:** partial bookings, false success responses, orphan quotes/reservations, promo uses consumed for failed bookings, and difficult reconciliation. A reference collision or schema drift could be emailed to the customer even though its quote insert failed.

**Current data check:** 20 quotes exist. The 12 created on 11–14 August predate the paired website-reservation behaviour; all eight quotes created on 18–19 August have a matching website reservation, and no website reservation is missing its quote. This is not evidence that the implementation is safe—only that the observed recent records are consistent.

**Fix:** create one service-role-only Postgres function such as `create_web_booking(...)` that, in a single short transaction:

1. validates and locks the promo;
2. inserts the quote with a database-enforced unique reference;
3. inserts the pending reservation with an explicit `quote_id` foreign key;
4. records two outbox jobs for the customer and office notifications;
5. returns the reference only after commit.

The API must inspect the RPC error and return a non-success response on failure. Add an idempotency key generated by the browser and a unique constraint so retries cannot create duplicates.

#### H2 — Admin document storage is absent in production

**Evidence:** live query of `storage.buckets` returned no rows. The code uses the bucket `reservation-documents` in `app/api/admin/documents/route.ts` and `app/api/admin/documents/download/route.ts`; the baseline migration only contains a comment telling an operator to create it manually.

**Impact:** reservation document list/upload/download operations fail. This also demonstrates that environment setup is not fully reproducible from migrations.

**Fix:** add and apply a migration that creates a **private** bucket with an explicit size limit and allowed MIME types. Validate reservation UUID, filename, MIME type and declared size in the API; normalise or replace filenames; confirm the reservation exists; limit downloads/deletes to paths under that reservation; and add a malware-scanning/quarantine workflow before staff open uploads. Test upload, list, download and delete in preview and production.

#### H3 — Daily operational job can time out and omit work

**Evidence:** Vercel recorded a `morning-briefing` timeout at 60 seconds. `app/api/cron/morning-briefing/route.ts:48-146` serially awaits email sync, reply detection, watchdog, briefing queries/message, and health checks. Health checks themselves make several external calls.

**Impact:** delayed or missing email ingestion, reply detection, alerts or staff briefing. A timeout can occur after some side effects but before the outbox marker is written, making retry behaviour ambiguous.

**Fix:** make the cron a short dispatcher. Split the work into independently retryable jobs with per-step timeouts and idempotency keys. Use Vercel Workflow/Queues when available, or separate protected endpoints plus a durable database job/outbox design. Send/record the business briefing before optional health probes. Parallelise independent database reads. Do not rely solely on raising `maxDuration`.

#### H4 — Production source-control gate is not enforced

**Evidence:** GitHub reports `main` is not protected; Dependabot security updates are disabled; no code-scanning analysis exists. The repository is public. CI uses `actions/*@v4` tags rather than immutable commit SHAs.

**Impact:** accidental or compromised direct pushes can deploy without mandatory CI/review; dependency vulnerabilities rely on manual discovery; mutable Actions tags add avoidable supply-chain trust.

**Fix:** protect `main`; require a pull request, one approval, latest successful CI, resolved conversations and no force push/deletion; restrict who can push; enable Dependabot alerts/security updates and weekly version updates; add CodeQL; pin Actions to full commit SHAs; enable non-provider secret patterns and validity checks if the plan supports them; require MFA/passkeys for GitHub and Vercel owners. Keep production deployment restricted to protected `main`.

### Medium

#### M1 — Admin navigation multiplies authentication round trips

**Evidence:** `proxy.ts:72-171` runs `getUser()`, AAL resolution and `listFactors()` for every protected page and API request. Most admin pages then issue one to four client-side API requests, each traversing the proxy again. The user list also calls `getUserById` once per user. Supabase documentation says `getClaims()` verifies against cached JWKS and is significantly faster than `getUser()` when asymmetric signing keys are used; the `aal` value is already a signed JWT claim.

**Impact:** skeleton/loading delay in admin pages, unnecessary Auth traffic, greater sensitivity to a transient Supabase Auth delay, and scaling cost.

**Fix:** after confirming asymmetric JWT signing, use `getClaims()` in the proxy for identity and signed `app_metadata.role`/`aal` claims. Keep fail-closed role handling. Call `listFactors()` only in enrolment/login/factor-management flows. Use short access-token lifetime and a documented process to revoke sessions after a role change. Consolidate each page’s data into one server-rendered load or one BFF endpoint, and use SWR/React Query for deduplication, caching, cancellation and revalidation. Batch the admin-users factor lookup.

#### M2 — Quote submission waits for two external email calls and has no durable outbox

**Evidence:** `app/api/quote/route.ts:358-455` awaits the office and customer emails serially after database writes. The Resend wrapper returns an error object and these calls do not inspect it.

**Impact:** slower submit response, inconsistent user experience during provider latency, and silent notification loss.

**Fix:** write notification jobs in the same transaction as H1, return success after commit, and process the outbox asynchronously with retry/backoff, delivery status, dead-letter state and alerting. If immediate sending remains temporarily, send both in parallel, inspect both results, record failures, and never make the customer retry a booking that is already stored.

#### M3 — Database privilege grants exceed least privilege

**Evidence:** live grants show `anon` and `authenticated` retain `DELETE, INSERT, REFERENCES, TRIGGER, TRUNCATE, UPDATE` on multiple internal tables; `authenticated` also retains `SELECT` on quotes, reservations, vehicles, vehicle costs and damages. RLS/no-policy currently blocks data access, so this is not a present direct exposure. Migration 019 revoked only `SELECT` on ten tables, not all residual privileges.

**Impact:** larger blast radius if a future policy is mistakenly made permissive. Least privilege should fail at both the grant and RLS layers.

**Fix:** revoke **all** privileges from `PUBLIC`, `anon` and `authenticated` on internal tables and sequences; re-grant only `SELECT` on `rates` and `extras_config`; keep privileged RPCs service-role-only; set matching default privileges; and add an automated assertion over `information_schema.role_table_grants`.

#### M4 — Migration history and drift control are unreliable

**Evidence:** the repository contains migrations 001–020, but the live migration-history query returns none. The CI “Schema drift check” currently exits successfully when its Supabase secrets are absent; the latest green run explicitly logged that it skipped the check. The missing Storage bucket is a concrete environment drift example.

**Impact:** a green build can deploy code against an incompatible schema; recovery and reproduction are uncertain.

**Fix:** reconcile and baseline migration history without replaying destructive statements; make schema verification mandatory in a protected, least-privilege CI environment; compare functions, policies, grants, constraints, indexes and Storage configuration—not only columns. A skipped required check should be neutral/failing, never green. Rehearse restoration into a separate project.

#### M5 — Leaked-password protection is disabled; public signup should be explicitly closed

**Evidence:** Supabase’s live security advisor reports leaked-password protection disabled. Source comments state public signup is enabled. Roleless denial prevents the earlier privilege path, but unused signup remains unnecessary attack surface.

**Impact:** weaker protection against credential stuffing and avoidable account/spam/resource creation.

**Fix:** enable leaked-password protection and a strong minimum password policy; disable public signup if staff accounts are invitation-only; require verified MFA before all admin/API access; make the second staff member complete MFA before operational use; configure recovery controls and keep at least two emergency administrators with separately stored recovery codes.

#### M6 — Stripe webhook processing is not idempotent and ignores persistence failure

**Evidence:** `app/api/stripe-webhook/route.ts:28-44` re-applies the update and sends Telegram on every valid replay. It does not store/check the Stripe event ID or inspect the Supabase update result.

**Impact:** duplicate alerts, overwritten payment timestamp, and a 200 response even if the reservation was not updated. Stripe will then consider the event delivered.

**Fix:** store `event.id` under a unique constraint, process once in a transaction, verify the session currency/amount/reservation relationship, use the provider’s event creation/payment time, check affected row count, and return 5xx on transient persistence failure so Stripe retries.

#### M7 — Document upload API lacks validation and object-level checks

**Evidence:** `app/api/admin/documents/route.ts:26-55` accepts arbitrary `reservation_id`, `file_name`, path and content type; the client-supplied MIME type is discarded; no size/type/path constraints or reservation existence checks are enforced. Staff have access to this API.

**Impact:** once H2 creates the bucket, a compromised staff session could store oversized or active content, traverse logical prefixes, or delete/download another path it can name.

**Fix:** implement the constraints described under H2 and apply storage-side bucket limits as a second layer.

#### M8 — Gmail refresh tokens are stored plaintext and OAuth state is weakly modelled

**Evidence:** `lib/gmail.ts:21-38` creates state using `Math.random()` and stores Gmail tokens as plaintext JSON in `system_settings`. `app/api/admin/gmail/route.ts` uses one global state row; it is not tied to a user/session and has no expiry.

**Impact:** a service-role/database compromise also compromises mailbox access; concurrent connects can overwrite state; replay protection has no time boundary.

**Fix:** use `crypto.randomBytes`, bind state to the initiating user/session in an HttpOnly SameSite cookie or a per-user hashed database record, expire it within minutes, and consume it atomically. Encrypt refresh tokens with a key outside the database (managed KMS/secret service), restrict Gmail scope to read-only as currently done, and alert on reconnect/disconnect.

#### M9 — CSP still permits inline script and style execution

**Evidence:** the enforced policy contains `'unsafe-inline'` for `script-src` and `style-src`. A stricter script policy is report-only and `/api/csp-report` is present.

**Impact:** the CSP limits origins but provides weaker protection against injection than a nonce/hash policy.

**Fix:** inspect real CSP reports, eliminate inline initialisation, move to per-request nonces or hashes, then promote the strict report-only policy. Keep Google/reCAPTCHA origins narrowly enumerated. Rate-limit or sample CSP report ingestion at the platform layer to protect logs/functions.

#### M10 — Platform WAF/rate-limit posture could not be verified through the connected read-only project interface

**Evidence:** application rate limiting exists and reCAPTCHA protects booking/contact, but the connected Vercel project interface did not expose the active firewall configuration. The database limiter deliberately fails open if Supabase is unavailable.

**Impact:** application functions still absorb abusive traffic during limiter-store failures; admin-login, quote lookup, webhooks and report ingestion benefit from independent edge controls.

**Fix:** in Vercel, verify Firewall is enabled; enable the managed Vercel/OWASP ruleset in log/challenge mode first; add route-specific limits for `/api/quote`, `/api/contact`, `/api/quote/*`, `/admin/login`, webhook and CSP-report endpoints; configure Attack Mode procedure; protect preview aliases; review firewall events weekly. Avoid blocking legitimate Stripe/Resend callbacks—use signature verification and provider-aware rules.

#### M11 — reCAPTCHA verification needs resilience and context checks

**Evidence:** `lib/recaptcha.ts` performs an unbounded external fetch and accepts `success === true` without checking expected hostname. Public endpoints depend on this call.

**Impact:** Google latency can hold a serverless invocation; a token accepted for an unintended hostname/site-key context may pass.

**Fix:** add an abort timeout, explicit error handling, expected hostname verification (`anadyon.gr` and an intentional preview allowlist), structured metrics and a safe degraded-service policy. Keep the durable rate limit and Vercel edge limit as independent layers.

### Low / improvement opportunities

#### L1 — Browser coverage is Chromium-only

The new regression suite is valuable but the workflow explicitly omits Firefox and WebKit. Run a smaller critical-flow matrix in Chromium, WebKit and Firefox; add real-device checks for iOS Safari and Samsung Internet before major releases. Keep the full width matrix in Chromium to control runtime.

#### L2 — One public Vercel alias remains directly accessible

`anadyon-eight.vercel.app` returned the production site directly, while other preview aliases are protected. Canonical tags mitigate indexing duplication, but redirecting or protecting obsolete aliases reduces brand confusion and attack surface.

#### L3 — Lint warnings identify loading-pattern debt

Lint has no errors but reports 21 warnings, mainly state updates in effects and missing hook dependencies across admin pages/forms. These correlate with client-only fetch-and-render cycles. Address them while implementing M1 so stale responses and duplicate fetches do not remain hidden.

#### L4 — Speed Insights is consent-dependent

Vercel Speed Insights is correctly present but loads only after “Accept all.” This is privacy-conservative, but performance data represents consenting visitors only. Keep that sampling limitation in mind; supplement it with synthetic checks that do not collect user data.

## Performance diagnosis and optimisation plan

### Observed timings

Warm response timings from this European connection were approximately:

- `/`: 0.10 s
- `/cars`: 0.09–0.10 s
- `/motorbikes`: 0.29 s
- `/bikes`: 0.40 s
- `/contact`: 0.14 s
- `/quote`: 0.08–0.17 s after warm-up
- `/api/admin/rates`: 0.11–0.18 s after warm-up; one cold observation was 1.70 s

Static pages showed Vercel cache hits. A Google PageSpeed API run could not be obtained because the public API quota was exhausted, so this report does not invent lab Core Web Vitals numbers. Use the Vercel Speed Insights dashboard after enough consenting traffic has accumulated.

### Highest-value performance changes

1. **Admin auth fast path (M1):** replace repeated remote identity/factor calls with verified claims, and aggregate page data server-side. This is the likeliest cause of slow-feeling admin screens.
2. **Atomic booking + outbox (H1/M2):** one database call for business persistence and no external email wait in the customer request.
3. **Split the daily job (H3):** independent bounded jobs, parallel reads, retries and per-step telemetry.
4. **Use a data-fetching cache for interactive admin pages:** shared request keys, stale-while-revalidate, deduplication, cancellation and optimistic mutations.
5. **Measure route stages:** structured timing for proxy auth, database, external providers and render; add a request/correlation ID. Alert on p95 and error rate, not only individual log messages.
6. **Preserve current public-page strategy:** static generation/ISR, server-loaded rate card and image optimisation are working. Do not move pricing back to a client-only initial fetch.
7. **Bundle review:** large JavaScript chunks exist in the build; use Next bundle analysis to confirm `googleapis`, Stripe, Twilio and Anthropic remain server-only and are not pulled into public client bundles. Lazy-load reCAPTCHA and modal-only code where practical.
8. **Real-user budgets:** target p75 LCP ≤2.5 s, INP ≤200 ms, CLS ≤0.1; API p95 under 500 ms for warm requests; booking commit under 1 s excluding CAPTCHA; alert on any cron failure or webhook 5xx.

## Security posture by layer

| Layer | Current posture | Next action |
|---|---|---|
| Public pricing | Server recomputation; rates/extras intentionally public | Keep; add transactional booking/idempotency |
| Admin authentication | Roles in server-only metadata; roleless fail-closed; TOTP enforced | `getClaims` fast path; disable signup; leaked-password protection |
| Database | RLS and privileged-function revokes are effective | Remove residual grants; reconcile migrations; mandatory drift gate |
| Webhooks/payments | Raw-body signature checks are correct | Idempotent Stripe event processing and checked DB writes |
| Email/Gmail | Resend secret now correct; Gmail read-only scope | Durable outbox; token encryption; stronger OAuth state |
| Storage | No public bucket/data exposure because bucket is absent | Create reproducibly with strict limits and scanning |
| Browser headers | Strong baseline, CSP reporting present | Remove `unsafe-inline`; review CSP reports |
| Abuse protection | DB rate limits + reCAPTCHA | Confirm WAF; route-level edge limits; CAPTCHA timeout/hostname |
| CI/supply chain | Tests/build strong; zero current npm audit findings | Protect branch; Dependabot/CodeQL; pin Actions; enforce schema gate |
| Recovery/operations | Daily health concepts exist | Split timed-out job; verify backups/PITR; restore drill; runbooks |

## Immediate checklist

### Next 24–48 hours

- [ ] Implement H1 atomic booking RPC, idempotency key and checked error handling.
- [ ] Until deployed, reconcile each new quote with its website reservation and office/customer notification.
- [ ] Create and test the private document bucket through a migration, with limits and API validation.
- [ ] Split or restructure the morning briefing before the next reliable operating window; add a failure alert outside the same job.
- [ ] Protect GitHub `main` and require the CI check before production deployment.
- [ ] Enable Dependabot alerts/security updates and CodeQL.
- [ ] Enable Supabase leaked-password protection and verify public signup is disabled.
- [ ] Revoke residual anonymous/authenticated table privileges and add a regression assertion.

### Within one week

- [ ] Implement `getClaims`/AAL fast path and consolidate admin data loads.
- [ ] Add durable notification outbox/retries and Stripe webhook idempotency.
- [ ] Reconcile migration history and make schema/storage/grant drift checks mandatory.
- [ ] Verify Vercel Firewall/WAF and add route-specific limits.
- [ ] Encrypt Gmail refresh tokens and replace global OAuth state.
- [ ] Review CSP reports and plan nonce/hash enforcement.
- [ ] Add WebKit and Firefox critical-flow CI plus iOS Safari/Samsung Internet device checks.
- [ ] Verify automated database backups/PITR for the current Supabase plan and perform a restore drill into an isolated project.
- [ ] Create incident runbooks for booking failure, database outage, compromised admin, email outage, payment webhook backlog and rollback.

### Ongoing

- [ ] Weekly: runtime errors, failed webhooks/outbox, firewall events, dependency alerts and booking reconciliation exceptions.
- [ ] Monthly: access review, admin/MFA review, restore test evidence, stale secrets/integrations, least-privilege grants and browser smoke matrix.
- [ ] Quarterly: rotate high-value secrets where supported; review third-party scopes; tabletop an incident and recovery exercise.

## Autonomy while you are away

The most effective instruction is to define the boundary explicitly: for example, “Continue autonomously with all read-only production checks and local code/test work; do not deploy, change production data/configuration, send real customer messages, incur cost, or merge/push without my confirmation.” This lets the agent proceed through safe diagnostics and local verification without repeatedly pausing.

In the Codex app, grant network and the required workspace/filesystem access for the session when prompted. Session/workspace-scoped permission is more convenient than one-command approval. Managed safety gates still require confirmation for destructive, externally visible, costly or scope-expanding actions; a prompt cannot disable those safeguards. For unattended implementation, use a separate branch/preview environment, test-mail redirection and sandbox payment credentials, then reserve production promotion for your review.

## Limitations

- This was a deep application/configuration review, not a destructive penetration test. No denial-of-service, credential attack, malware upload or real payment/customer-message test was performed.
- The connected Vercel interface exposed deployments/logs/project metadata but not the active firewall configuration or private environment-variable values.
- Supabase plan/backup/PITR configuration was not exposed, so recovery readiness must be verified in the dashboard and with a restore drill.
- Static axe checks do not replace manual keyboard/screen-reader testing.
- Local Playwright could not launch because macOS denied Chromium’s sandbox service. The same current-revision suite passed in GitHub CI, and the live site was inspected with the in-app browser.

