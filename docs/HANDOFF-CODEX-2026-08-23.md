# Anadyon handoff — Codex work after the Claude H1 handover

Status date: **2026-08-23** (original), addendum added same day by Claude Code
after PR #25 and PR #26  
Prepared for: the next engineer or coding agent, including Claude Code  
Repository: `anadyongr-droid/anadyon`  
Production: `https://anadyon.gr`

## 1. Purpose and scope

This document records the work completed after Claude handed the project to
Codex in `docs/HANDOFF-H1.md` on 20 August 2026. It covers the implementation
and release sequence from PR #2 through PR #26, the database changes applied
manually during that period, production verification, important business rules,
and the work that remains open. Section 2 and the addendum in section 16 record
what changed after the original 23 August write-up.

It is a consolidation document. The specialised handoffs remain authoritative
for their individual areas:

- `docs/HANDOFF-H1.md` — atomic and idempotent website booking creation.
- `docs/HANDOFF-PRICING.md` — billable-day and seasonal-boundary pricing.
- `docs/HANDOFF-CUSTOMER-FIELD-PARITY.md` — website/customer/reservation field parity.
- `docs/HANDOFF-UNIFIED-CUSTOMER-FIELDS.md` — shared customer fields, date inputs and flight number.
- `docs/HANDOFF-EMAIL-DELIVERY.md` — quote-confirmation email delivery audit, BCC and Resend webhook correlation.
- `docs/NBG-PAYMENTS-INTEGRATION.md` — NBG Pay/Key2Pay design and deployment gate.
- `docs/RESTORE.md` — encrypted backup restore procedure and its untested areas.

## 2. Current source, deployment and pull-request state

**Superseded by the addendum in section 16.** The bullets immediately below were
true as originally written, before PR #25 and PR #26. They are kept for the
historical record of what Claude found on picking the project back up; do not
treat them as current.

Verified on 23 August 2026 (original, morning):

- GitHub `origin/main`: `fb24b584e21ac620c457157b42cd0e7e39162b1f`.
- Latest main commit: merge of PR #24, **Implement request → quote → paid booking lifecycle**.
- GitHub recorded a successful Production deployment for that exact commit at
  2026-08-23 10:21 UTC.
- Latest main CI run passed.
- Latest CodeQL workflow completed successfully as a workflow, but **five open
  CodeQL alerts remain**. A successful analysis run does not mean the findings
  are resolved; see section 10.
- The live `/quote` page was read after deployment and contains the new
  “acknowledgment email” wording, corroborating that the latest public-copy
  release is live.
- PR #16, **Add gated NBG hosted deposit payments**, is the only open pull
  request. It is intentionally a draft and must not be merged yet.
- PR #1, **Fix disappearing price box and itemize extras per line**, is closed
  without merge. Its relevant changes were superseded by later releases and it
  must remain closed.

The local folder `work/anadyon` is an old detached checkout with unrelated
untracked duplicate files. Several other historical worktrees also remain.
The next engineer should start from a fresh worktree based on `origin/main`, not
continue in an arbitrary old checkout.

## 3. State received from Claude

Claude's H1 handoff established the following starting point:

- migrations 021, 022 and 023 had been manually applied and checked;
- privileged database functions had been restricted to `service_role`;
- the intended `create_web_booking` function existed but was unusable;
- `jsonb_populate_record(...); insert ... select *` wrote explicit NULLs into
  omitted columns, preventing defaults such as IDs and timestamps from firing;
- the public route still used separate quote, reservation and promo operations;
- retries were not safely idempotent;
- pricing/promo settlement had competing sources of truth;
- the required implementation was documented, but the H1 route change had not
  been written or deployed.

Codex continued from that recorded state rather than restarting the audit.

## 4. Release ledger

All pull requests in this table were merged to `main` and deployed unless the
status explicitly says otherwise.

| PR | Release | Result | Database |
|---|---|---|---|
| [#2](https://github.com/anadyongr-droid/anadyon/pull/2) | Atomic website booking | One transaction, stable idempotency, database-owned promo settlement and totals, no duplicate email on replay | Migration 024 manually applied and verified |
| [#3](https://github.com/anadyongr-droid/anadyon/pull/3) | Seasonal-boundary pricing | Correct charge for every billable 24-hour period across seasons; timezone-safe rental days | None |
| [#4](https://github.com/anadyongr-droid/anadyon/pull/4) | Vehicle-card switching | Selecting another card updates the open booking form and recalculates without losing progress | None |
| [#5](https://github.com/anadyongr-droid/anadyon/pull/5) | Reservation DOB | Website DOB copied to the operational reservation | None |
| [#6](https://github.com/anadyongr-droid/anadyon/pull/6) | Canonical-host/security hardening | Old public Vercel alias redirected; CodeQL added; website-field parity regression added | None |
| [#7](https://github.com/anadyongr-droid/anadyon/pull/7) | Firefox CI | Chromium and Firefox now run on each PR/main change; WebKit remains on demand | None |
| [#8](https://github.com/anadyongr-droid/anadyon/pull/8) | Today/Quotes administration | Today shows only vehicles in maintenance; safe deletion of unconverted quotes | None |
| [#9](https://github.com/anadyongr-droid/anadyon/pull/9) | Quote/customer linkage | Website quotes create/link customers; quote/reservation/customer relationships and conversion status added | 025a, 025b and 026 manually applied |
| [#10](https://github.com/anadyongr-droid/anadyon/pull/10) | Canonical locations | Website and admin use Zakynthos Airport, Zakynthos Port and Anadyon Office | None |
| [#11](https://github.com/anadyongr-droid/anadyon/pull/11) | Quote/reservation/calendar sync | Website quote creates a Pending reservation; every reservation appears in Calendar, including unallocated ones | None |
| [#12](https://github.com/anadyongr-droid/anadyon/pull/12) | Eligible vehicle assignment | Same category or upgrade only, matching transmission, safe availability/turnaround allocation | 027a, 027b and corrected 027c manually applied |
| [#13](https://github.com/anadyongr-droid/anadyon/pull/13) | Customer field parity | First/surname and DOB parity; blank document dates display blank; existing incomplete links backfilled safely | 028 manually applied |
| [#14](https://github.com/anadyongr-droid/anadyon/pull/14) | Unified fields and mobile details | Shared date component, optional flight number, controlled field synchronisation and historical snapshots | 029 and 030 manually applied |
| [#15](https://github.com/anadyongr-droid/anadyon/pull/15) | Production handoff record | Records PR #14 deployment and database verification | None |
| [#16](https://github.com/anadyongr-droid/anadyon/pull/16) | NBG Pay hosted checkout | **OPEN DRAFT; not deployed; migration 031 not applied** | Must remain unapplied until the full bank gate passes |
| [#17](https://github.com/anadyongr-droid/anadyon/pull/17) | Native DOB/flight row | Initial compact side-by-side DOB and flight-number layout | None |
| [#18](https://github.com/anadyongr-droid/anadyon/pull/18) | DOB wheel | Replaced impractical Android calendar navigation with fast Day/Month/Year wheels | None |
| [#19](https://github.com/anadyongr-droid/anadyon/pull/19) | FAQ tax wording | Approved English tax wording; visible FAQ and structured data share the source | None |
| [#20](https://github.com/anadyongr-droid/anadyon/pull/20) | Privacy analytics wording | Removed specific Speed Insights paragraph and generalised the provider disclosure in EN/GR | None |
| [#21](https://github.com/anadyongr-droid/anadyon/pull/21) | Quoted-price wording | “No hidden fees — the quoted price is what you pay” and Greek equivalent | None |
| [#22](https://github.com/anadyongr-droid/anadyon/pull/22) | Booking/admin polish | Dialog behaviour, content, DOB-driven age, extras pricing, payment-link clarity and Stripe reference | None |
| [#23](https://github.com/anadyongr-droid/anadyon/pull/23) | Live-copy and Market corrections | Correct translation key; rates editable directly beside competitor rates | None |
| [#24](https://github.com/anadyongr-droid/anadyon/pull/24) | Payment-gated booking lifecycle | Request acknowledgment → quote confirmation → booking confirmed only after verified payment | None |
| [#26](https://github.com/anadyongr-droid/anadyon/pull/26) | Quote-confirmation email delivery audit | BCC to `customerservice@anadyon.gr`, reply-to routed to the same address, per-send audit row created before contacting Resend, Resend webhooks correlated by delivery ID with dedup/out-of-order protection, delivery history shown on the reservation form | Migration 032 (`20260823130603_booking_email_delivery_audit.sql`) applied to production before merge, per the PR's own deployment gate; confirmed by Tasos |
| [#25](https://github.com/anadyongr-droid/anadyon/pull/25) | CodeQL alert triage (Claude Code) | All five open CodeQL alerts resolved: `js/polynomial-redos` in the admin users route (linear-time email-shape check replacing a regex vulnerable on inputs like `"!.!.!.!.!"`), `js/double-escaping` ×2 (`&amp;` now decoded last, not first, in `lib/gmail.ts` and `lib/podilatadikoRates.ts`), `js/bad-tag-filter` ×2 (script/style closing-tag regexes in `lib/gmail.ts` and `scripts/check-translation.mjs` now consume any characters up to `>`, not just exact `</script>`). First push only tolerated whitespace before `>` and CodeQL still failed on `</script\t\n bar>`; a second push fixed it properly. CodeQL check is green — "No new alerts in code changed by this pull request." Open, not yet merged as of this addendum. | None |

From the Claude H1 handoff baseline (`5cca6ec`) to `main` as of PR #26
(`c3e5fc5`), the repository changed 116 files, with approximately 8,208
additions and 773 deletions across 54 commits.

## 5. Booking, pricing and persistence work

### 5.1 Atomic and idempotent website booking

Migration 024 and `/api/quote` now implement the public write as one database
transaction. The database:

- inserts only supplied JSON columns so normal defaults fire;
- serialises simultaneous retries of the same request;
- redeems a promo and owns the final discount and money fields;
- inserts Quote, Customer link and Pending Reservation together;
- returns the stored reference, total, deposit and balance;
- rolls the complete operation back if any required write fails.

The route uses a stable content-derived idempotency key. An identical retry
returns the original reference and does not create extra records or send a
second acknowledgment email. The migration test executes both the numbered
migration and the exact SQL-editor paste copy in disposable PostgreSQL.

Production verification recorded in `docs/HANDOFF-H1.md`:

- the first controlled request created exactly one quote and reservation with
  matching totals;
- direct replay within a transaction returned the same reference and
  `idempotent_replay: true`;
- that transaction was rolled back and left no test rows;
- `MAIL_REDIRECT_TO` was removed from Production and retained in Preview only.

### 5.2 Rental-day and seasonal pricing

The confirmed charging rule is:

- a rental day is each commenced 24-hour period;
- any time beyond an exact 24-hour multiple creates another billable day;
- one duration tier applies to the whole rental;
- each billable day's rate is taken from the season in which that billable day
  starts.

The key regression is Car B, 25 August 2026 at 09:00 to 1 September 2026 at
09:01: eight billable days, seven August days plus one September day, total
**€374.20**. Public quoting and the admin reservation editor use the same shared
segmented calculation, and the exact subtotal is retained even though a
weighted average daily rate is displayed.

Rental-day arithmetic is independent of server/browser timezone and includes
Greek daylight-saving transition tests.

### 5.3 Vehicle selection and allocation

- Choosing Get Quote on a different vehicle card updates the already-open form
  and recalculates the price while retaining the customer's dates and progress.
- Quote conversion and editing enforce the original requested category and
  transmission server-side; this is not merely a dropdown restriction.
- Assignment can use the requested category or a higher category at no extra
  cost, but never a downgrade without prior customer consent.
- Manual and automatic transmissions cannot be substituted for each other.
- Only active vehicles without booking or turnaround conflicts are eligible.
- If no safe vehicle exists, the reservation remains Pending and unallocated
  instead of making an unsafe assignment.

## 6. Quote, reservation, calendar and customer architecture

The current model is intentionally linked but not a single mutable row:

- **Customer** owns current reusable identity/contact data and staff-verified
  document information.
- **Quote** preserves what the customer requested and the quoted commercial
  snapshot.
- **Reservation** owns the operational rental, assigned vehicle, status,
  payment state and historical rental snapshot.
- **Calendar** is a presentation of Reservations, including a Pending vehicle
  allocation area for unallocated reservations.

Every website quote creates an equivalent Pending reservation atomically and a
linked customer record. A reservation without a linked quote is treated as an
office/walk-in booking. Customer/quote/reservation status indicators show
whether a website request is awaiting a decision or has become a rental.

Current pending/confirmed/active bookings synchronise approved mutable identity
and contact fields across their linked records. Returned, cancelled, no-show
and voided rentals remain historical snapshots and are intentionally excluded
from ongoing synchronisation.

Flight number belongs to the trip, so it synchronises only inside its linked
Quote/Reservation pair. Passport and driving-licence details remain
Customer-owned and are intentionally not requested by the public website.

The synchronisation triggers do **not** change prices, dates, vehicles, extras,
statuses, deposits or payment values. Staff-verified customer values must not
be silently overwritten by a later website request.

The field-parity and unified-field migrations recorded these production checks:

- incomplete linked reservation identity/DOB records were reduced to zero;
- incomplete linked customer DOB records covered by the migration were reduced
  to zero;
- document expiry fields were neither inferred nor set to the current date;
- public/authenticated roles were not granted direct access to the internal
  trigger functions;
- current linked records had zero identity mismatches after the backfill.

## 7. Public and admin user-experience work

- Mobile DOB and Flight Number controls occupy equal-width cells.
- DOB uses a compact Day/Month/Year wheel rather than an Android calendar that
  requires paging backwards many years.
- The year wheel begins near the middle of the selected driver-age band.
- DOB automatically recalculates Driver Age against the rental pickup date.
  Driver Age remains in step 1 as requested; no form-layout move was made.
- Google reCAPTCHA scales on 320px screens so it no longer causes horizontal
  overflow.
- Terms and other full dialogs lock the underlying page, contain focus and
  close with Escape.
- Greek navigation was compacted at tablet widths to prevent the sights label
  wrapping without changing the English desktop layout.
- The Today dashboard now shows only vehicles explicitly in maintenance.
- Quotes have a safe Delete action only where deletion cannot orphan a
  converted reservation.
- Market supports editing Anadyon's own rates in place while competitor rates
  remain visible; differences recalculate during editing.
- Reservation extras are itemised, and changing extras recalculates total,
  deposit and balance.
- Stripe and Wise links are visually distinct, separately labelled and
  independently copyable.
- Stripe uses the public website reference for the customer's display while
  preserving the reservation UUID for secure reconciliation.

## 8. Customer communication and payment lifecycle

PR #24 implements the approved three-stage lifecycle:

1. Public request: **Reservation request acknowledgment — [Reference]**.
2. Staff availability/price approval: **Quote confirmation**, including a
   required deposit deadline in Zakynthos time and explicit wording that the
   booking is not yet confirmed.
3. After verified payment: **Booking confirmed — [Reference]**.

A reservation cannot be set to Confirmed through ordinary editing unless the
record shows either the exact 30% deposit or the full rental price as paid.
Stripe settlement passes through one idempotent reconciliation path. Browser
success redirects cannot mark a reservation paid. Cancelled, voided or no-show
bookings cannot be revived by a late payment link.

Wise and manual payments require staff verification. Paying the full amount
sets the remaining balance to zero; paying only the deposit preserves the
balance due at pickup.

The customer-facing website, My Rental, Terms, FAQ, booking form, SMS wording
and admin labels were aligned to this lifecycle in English and Greek. Stripe
success/cancellation returns now use public pages instead of redirecting a
customer into the protected admin area.

Booking email delivery is no longer allowed to make an already-stored booking
look like a failed request. Initial messages are dispatched after the HTTP
response, failed mail is written to `alert_outbox`, the office is alerted, and
the daily job retries queued mail. Formal booking-confirmation mail also uses
an idempotent claim so payment retries do not send duplicates.

**Addendum (PR #26, see section 16 and `docs/HANDOFF-EMAIL-DELIVERY.md`):** the
**Send quote confirmation** action is now auditable rather than trusting a
successful API call as proof of delivery. Every send records an audit row
before contacting Resend, BCCs `customerservice@anadyon.gr`, routes replies to
the same address, and correlates Resend webhook events (sent/delivered/
delayed/bounced/complained/failed/suppressed) back to that row by delivery ID,
with dedup and protection against an out-of-order event regressing a later
status. The reservation form shows this delivery history. Both new tables are
`service_role`-only with RLS enabled; `anon`/`authenticated` have no access.

## 9. Database migration ledger and safety rule

The following production state is recorded in the release handoffs:

| Migration | State |
|---|---|
| 021 reservation document bucket | Applied before Codex takeover |
| 022 atomic booking base | Applied before Codex takeover |
| 023 least-privilege grants | Applied before Codex takeover |
| 024 booking defaults/idempotency/settlement | Applied and controlled verification completed |
| 025a/025b customer/quote links and booking function | Applied manually |
| 026 existing quote/customer backfill | Applied manually |
| 027a/027b/027c eligible vehicle assignment/backfill | Applied manually; corrected 027c succeeded after the first alias error |
| 028 customer field parity | Applied and verified |
| 029 current customer-booking field sync | Applied and verified |
| 030 current-record backfill | Applied and verified |
| 031 NBG payment-attempt ledger | **Not applied; exists only in draft PR #16** |
| 032 booking email delivery audit | Applied to production before PR #26 merged, per its own deployment gate; confirmed by Tasos |

Do not reapply 021–030 merely because their files are present. Do not apply 031
until the NBG sandbox and deployment gate in PR #16 have passed. Migration 032
is applied; do not reapply it either.

These migrations were applied through reviewed SQL-editor paste files rather
than an automated migration runner. That means the repository files describe
the intended live state, but Supabase's formal migration-history table may not
be authoritative. A future migration should therefore be verified against the
live schema before execution. Do not blindly replay the baseline or all files.

When a new migration is required:

1. create a numbered migration in `supabase/migrations/`;
2. create the reviewed SQL-editor copy in `supabase/migrations/paste/`;
3. wrap it in `begin`/`commit` and finish with an unmistakable
   `REACHED THE END` result;
4. add a disposable PostgreSQL behaviour test where practical;
5. never apply it automatically from a coding-agent session;
6. have Tasos apply it manually only after review and before merging code that
   depends on it.

Historical test quote/reservation cleanup before 20 August was performed as a
manual production-data operation during the release work. It is not represented
by a migration and must not be repeated from memory. Query exact targets and
take a backup before any future cleanup.

## 10. Open work and known risks

### 10.1 Immediate: triage five open CodeQL alerts — resolved and merged

**Update (addendum, section 16): fixed and merged in [PR #25](https://github.com/anadyongr-droid/anadyon/pull/25)
(`0bdbfb6`), deployed to production and confirmed live.** The original finding
stands as the historical record below.

GitHub reported five open alerts, all labelled High by CodeQL:

1. `js/polynomial-redos` — `app/api/admin/users/route.ts:106`.
2. `js/double-escaping` — `lib/gmail.ts:110–121`.
3. `js/bad-tag-filter` — `lib/gmail.ts:111–112`.
4. `js/double-escaping` — `lib/podilatadikoRates.ts:39–45`.
5. `js/bad-tag-filter` — `scripts/check-translation.mjs:78–79`.

Some may be low-exploitability parser/tooling cases, but they have not been
triaged or closed. Do not describe CodeQL as “green” merely because the workflow
ran successfully. Fix or document/dismiss each alert with specific reasoning in
a separate reviewed PR.

Note for whoever reviews PR #25: the first fix attempt for the two
`js/bad-tag-filter` findings only added whitespace tolerance
(`<\/\s*script\s*>`), and CodeQL's own re-analysis still failed it, with the
counter-example `</script\t\n bar>` — non-whitespace content before `>` that a
`\s*` pattern doesn't cover. The corrected version consumes any characters up
to `>` (`<\/\s*script\b[^>]*>`). This is worth remembering as a general lesson:
a regex-based HTML tag filter needs `[^>]*`, not `\s*`, unless there is a
specific reason to be stricter.

### 10.2 NBG Pay and Key2Pay

PR #16 is implemented behind `NBG_PAY_ENABLED=true`, has green CI/CodeQL and a
successful Vercel Preview, but remains intentionally unmergeable until:

- NBG supplies sandbox merchant credentials and the official merchant pack;
- PAYMENT_LINK/PURCHASE, EUR and 3-D Secure are confirmed for the merchant;
- Preview-only variables are configured with the test environment;
- migration 031 is manually applied and its completion marker is seen;
- approved, declined, cancelled, challenged, abandoned and expired scenarios
  are tested;
- wrong order, amount, currency or status can never confirm a booking;
- manual reconciliation, controlled production payment/refund and settlement
  reconciliation pass;
- Stripe remains available during an observation period.

Key2Pay is currently treated as an NBG-operated staff portal because no
supported public Key2Pay API specification has been supplied.

PR #16 was created before subsequent main releases. Rebase it onto the current
`main`, resolve ReservationModal/payment-lifecycle interactions carefully, and
rerun the complete current suite before any sandbox test.

### 10.3 Recovery and backup gaps

- Nightly encrypted database backups to private Cloudflare R2 are succeeding;
  the latest checked run on 22 August completed successfully.
- The job verifies that each archive decrypts and can be listed.
- A full restore has **never been completed** into an isolated Postgres or
  Supabase project. `docs/RESTORE.md` must be exercised before recovery can be
  called proven.
- The backup does not include objects from the private
  `reservation-documents` Storage bucket or Supabase project/Auth settings.
  Add a separate secure object-backup and configuration-recovery process.
- Ensure `BACKUP_PASSPHRASE` is stored outside GitHub as well as in Actions;
  losing the GitHub account and the only passphrase together would make every
  archive unusable.

### 10.4 Security and governance still to finish

- `main` is now protected, requires the `build` status, dismisses stale reviews,
  resolves conversations, enforces admins, and blocks force pushes/deletion.
  However, the required human approval count is currently **zero**. Raise it to
  one when a second trusted reviewer is operationally available.
- Dependabot security updates and secret scanning/push protection are enabled.
  Non-provider secret patterns and validity checks remain disabled.
- Workflow files use pinned action SHAs, but the repository setting does not
  enforce SHA pinning and still permits all actions. Consider enforcing trusted
  actions and SHA pinning at repository/organisation level.
- Gmail refresh tokens remain stored as plaintext JSON in `system_settings`.
  Encrypt them with a key held outside Supabase and design key rotation.
- Admin middleware still performs user/role plus MFA assurance and factor reads
  on protected requests. The MFA reads were parallelised, but the broader
  claims-based fast path remains unfinished and may contribute to admin latency.
- Supabase leaked-password protection and the intended public-signup setting
  should be confirmed in the dashboard.
- The enforced CSP still contains `unsafe-inline` for scripts and styles. Use
  CSP reports to complete a nonce/hash migration before tightening it.
- Vercel Firewall/WAF configuration and route-specific edge limits were not
  conclusively verified from source. Confirm them in Vercel without breaking
  Stripe, Resend or future NBG callbacks.
- Chromium and Firefox run on every change. WebKit/Safari remains on demand;
  retain real-device checks for iOS Safari and Samsung Internet around booking
  releases.
- ESLint still reports roughly 21 pre-existing advisory warnings, mainly React
  hook/loading-pattern debt.
- The H1 Vercel Preview once had reCAPTCHA hostname/propagation trouble even
  after its domain was added. Production was unaffected. Re-test a new Preview
  before relying on CAPTCHA-protected end-to-end booking tests there.
- `MAIL_REDIRECT_TO` is recorded as Preview-only. Keep it out of Production and
  verify its controlled address before any Preview test that sends mail.

### 10.5 Operational/process debt

- Manual SQL deployment plus an incomplete formal migration history remains a
  source of drift risk. Establish one documented authoritative database-release
  process without replaying historical migrations against production.
- CI's schema drift check only becomes a real live check when the scoped
  Supabase credentials are configured. Otherwise it emits a warning and exits
  successfully. Never treat an explicitly skipped schema check as evidence that
  production matches the repository.
- Continue monitoring the daily briefing and mail-sync time budgets. The cron
  and durable retry mechanisms were improved, but external providers can still
  make the combined operational job slow.
- Quote/customer conversion status is useful for segmentation, but it is not
  marketing consent. Do not start campaigns to quote-only contacts until a
  lawful consent/unsubscribe and suppression workflow is implemented.

## 11. Verification completed across the releases

Test totals increased as coverage was added. The most recent full verification
for PR #24 recorded:

- 253 unit and regression tests passed;
- TypeScript passed;
- optimised production build passed with 90 routes;
- translation check passed on 14/14 Greek pages with no hardcoded translated
  component strings;
- static accessibility check passed on 28/28 pages with no detected violations;
- SEO suite passed 60/60;
- Playwright passed 48 Chromium/Firefox tests;
- four rate-dependent browser checks were skipped only because the isolated
  local build used placeholder database credentials;
- ESLint had zero errors and 21 pre-existing advisory warnings;
- the PR, merge-to-main CI and Vercel production deployment succeeded.

Earlier releases also added PostgreSQL execution tests for migrations, full-year
pricing matrices across all vehicle pricing groups, daylight-saving checks,
mobile widths down to 320px, field-parity regressions, vehicle eligibility and
calendar tests, email/payment idempotency tests, and English/Greek content tests.

## 12. Non-negotiable engineering rules

- **Do only what was asked. Do not assume, do not guess, when the instruction
  is clear.** A change nobody requested is not a bonus — it is unreviewed work
  in a reviewed release, and it costs the requester the trust that what they
  asked for is what they got. If something else looks worth doing, say so and
  wait. Treat "optionally", "maybe" and "perhaps" in a brief as an invitation
  to discuss, never as authorisation: on 2026-08-23 a request to stop internal
  alerts replying to the customer also shipped a "Compose email to customer"
  button that had been mentioned as optional and was never approved. The
  requested part was right; the rest had to be removed.
- Work on a feature branch and reviewed PR. Never develop directly on `main`.
- **A migration and its `paste/` copy must be re-synced after every edit, and
  the pair compared before the PR is opened.** Migration 033 was copied and
  then edited further; the copy was never refreshed, so the SQL run against
  production was an earlier version than the repository showed — costing a
  blank "Customer email" column on every website booking and an unretryable
  email guard, while the PR claimed the two were byte-identical. The parity
  test in `lib/migrationPasteParity.test.ts` now compares every pair; do not
  weaken it to make a change pass.
- Vercel deploys from GitHub `main`; do not leave a CLI-only production deploy
  that the next GitHub deployment can overwrite.
- Never commit `.env.local`, credentials, exported production data or customer
  PII.
- Never apply a Supabase migration automatically. Prepare numbered and paste
  files, test them, and leave the production step to the authorised operator.
- Never trust a browser-supplied rental price, discount, deposit, balance,
  status or payment result. Server/database calculations and verified provider
  events are authoritative.
- Never grant internal tables or privileged functions to `anon`,
  `authenticated` or `PUBLIC` without a narrowly reviewed requirement.
- Never store card number, CVC or 3-D Secure authentication data. Store only
  provider references and permitted reconciliation metadata.
- Never infer missing passport/licence dates or replace blanks with today's
  date.
- Do not downgrade a requested vehicle category without explicit customer
  consent, and never substitute transmission type.
- Do not overwrite completed-rental snapshots through customer-master edits.
- An email failure after a committed booking must be queued/alerted, not turned
  into an apparent booking failure that invites duplicate submission.
- Probe database RPCs with their real required arguments. Calling a required-
  argument function with `{}` can misleadingly look as if the function does not
  exist.
- Before reporting a security-tooling fix (CodeQL, Dependabot, secret
  scanning, or similar) as done, check that tool's actual result on the pushed
  commit — its dashboard or `gh api repos/<repo>/code-scanning/alerts` /
  `gh pr checks` — not just that the local build, lint and test suite pass.
  None of those exercise CodeQL's semantic analysis; it only runs as a GitHub
  Actions check on push, so a locally-plausible fix can still leave the
  original alert open. This happened on [PR #25](https://github.com/anadyongr-droid/anadyon/pull/25):
  a first-pass fix to the `js/bad-tag-filter` alerts (adding `\s*` whitespace
  tolerance to a closing-tag regex) passed every local check, was pushed and
  reported as resolved, and CodeQL's own re-analysis still failed it — the
  regex didn't cover non-whitespace filler like `</script\t\n bar>`, which
  CodeQL's counter-example used. A second, independent coding-agent session
  reviewing the same PR caught it by checking the actual CodeQL check result;
  the first session had not. See section 16.2 for the full account.

## 13. Recommended next sequence

**Steps 1–2 below are complete; kept for the historical record. See section 16
for current state.**

1. ~~Create a fresh branch from `origin/main` at or after `fb24b58`.~~ Done —
   see [PR #25](https://github.com/anadyongr-droid/anadyon/pull/25), merged.
2. ~~Triage and resolve the five open CodeQL alerts in one focused PR; rerun
   the full build and browser suite.~~ Done — all five resolved and merged;
   see section 16.2 for how the fix was actually verified.
3. Perform the isolated database restore drill and document actual results and
   timing. Do not restore over production.
4. Add a secure backup plan for reservation-document Storage objects and record
   external Supabase/Auth configuration needed for disaster recovery.
5. Review the remaining security dashboard settings: required approval count,
   action allow-list/SHA enforcement, Supabase leaked-password/signup settings,
   Vercel WAF/rate limits and secret-scanning options.
6. Design and implement Gmail token encryption with rotation and recovery.
7. Measure admin navigation before changing authentication; then implement the
   claims-based fast path only with fail-closed tests.
8. Continue CSP report collection and plan a nonce/hash release.
9. Resume NBG PR #16 only after merchant onboarding and sandbox credentials.
   Rebase onto current main first; do not apply migration 031 prematurely.
10. After every material release, run the customer booking flow, payment-state
    transition, admin edit, Calendar sync, mobile layout and English/Greek
    smoke checks, then inspect runtime and provider logs.

## 14. Clean resume procedure for the next coding agent

Use a fresh checkout/worktree. Before editing:

```bash
git fetch origin --prune
git worktree add ../anadyon-next -b codex/<focused-task> origin/main
cd ../anadyon-next
git status --short --branch
git log --oneline -10
```

Then read this document and only the specialised handoff relevant to the task.
Run at least:

```bash
npm ci
npm test
npx tsc --noEmit
npm run lint
npm run build
npm run check:translation
npm run check:a11y
npm run test:seo
npm run test:browser
git diff --check
```

For schema-dependent work, additionally review the live-schema gate and run the
authorised check without printing or copying secrets. Do not claim a skipped
schema check passed. For payment work, use sandbox credentials and controlled
mail redirection only; never send real test messages to customers.

## 15. One-paragraph handback summary

Codex completed the H1 atomic-booking implementation received from Claude,
fixed seasonal and partial-day pricing, unified vehicle selection/allocation,
linked Quote/Reservation/Calendar/Customer records, corrected customer-field
and date handling, improved mobile booking and admin workflows, expanded
cross-browser/security CI, aligned bilingual legal/content wording, and
implemented the payment-gated request → quote → confirmed-booking lifecycle.
Those releases are on `main` and the latest production deployment is successful.
The NBG integration remains a deliberately gated draft; its migration is not
applied. The next priority is not more feature work: it is resolving the five
open CodeQL alerts, proving database recovery including Storage, and completing
the remaining governance, Gmail-token, CSP, WAF and migration-process hardening.

## 16. Addendum — 23 August 2026, after PR #25 and PR #26

Added by Claude Code the same day, after picking this document up as a fresh
handoff. Two coding-agent sessions worked the repository in parallel from this
point: Claude on the CodeQL alert triage this document called out as the
immediate priority (section 10.1), and another Codex session on the
email-delivery-audit release. Both are recorded here so the next reader does
not have to reconstruct the interleaving from GitHub alone.

### 16.1 PR #26 — quote-confirmation email delivery audit — merged and live

Merged to `main` at commit `c3e5fc5` (2026-08-23 14:06 UTC), CI and CodeQL both
green on that merge. Migration 032
(`supabase/migrations/20260823130603_booking_email_delivery_audit.sql`, paste
copy `supabase/migrations/paste/032_booking_email_delivery_audit_paste.sql`)
was applied to production before the merge, per the PR's own deployment gate,
and confirmed applied by Tasos. See section 8 above and
`docs/HANDOFF-EMAIL-DELIVERY.md` for the full feature description and its
own post-merge verification checklist (Resend webhook event subscriptions,
one controlled real send, delivery-status progression to "Delivered to
recipient's mail server").

A separate Codex session verified the production deployment directly:
deployment Ready on the correct merge commit, live site returns 200, the new
admin endpoint correctly rejects unauthenticated access, no runtime errors or
fatal logs found. It deliberately did not send a real test email, to avoid
contacting an unintended customer — that controlled send is still open, see
section 16.4.

### 16.2 PR #25 — the five CodeQL alerts this document flagged as urgent

Opened by Claude Code from a fresh worktree at the original `fb24b58`, per the
clean-resume procedure in section 14. Fixed all five alerts named in section
10.1: the polynomial-redos email check (new `lib/email.ts`, linear-time),
both double-escaping bugs (`&amp;` now decoded last), and both bad-tag-filter
regexes (script/style closing tags).

The first push on this PR only added whitespace tolerance to the closing-tag
regexes (`<\/\s*script\s*>`). A parallel Codex session reviewed the PR and
caught that CodeQL's re-analysis still failed it, with the precise
counter-example `</script\t\n bar>` — non-whitespace content before the `>`
that a `\s*`-only pattern does not cover. Claude verified this independently
against GitHub's CodeQL API (not just trusting the report) before fixing it,
then corrected both regexes to consume any characters up to `>`
(`<\/\s*script\b[^>]*>`), added a regression test for the exact adversarial
string CodeQL had used, and repushed. CodeQL now reports "No new alerts in
code changed by this pull request" and every check on the PR is green.

**Update: PR #25 was merged the same day**, after Tasos confirmed all checks
were green and asked for it to be deployed. Before merging, `main` was merged
into the PR branch (bringing in PR #26 and the first version of this
addendum, then in PR #27) and the full suite was rerun against that combined
state — 271 unit tests passed, `tsc` clean — before pushing and confirming
CodeQL was still green on the updated branch. Merge commit `0bdbfb6`; the
subsequent production deployment succeeded and `anadyon.gr` was confirmed
returning 200 on that commit. It was never merged into or based on PR #26's
branch before that final combine step — the two releases stayed fully
separate through review, so neither could accidentally deploy the other's
unreviewed work.

Earlier full unit/build verification for PR #25 (run against the pre-PR-#26
baseline, before the final merge): 263 unit tests pass (one Postgres-migration
test timed out under full-suite load, reproduced as isolated-run flakiness
unrelated to this change — passes alone), `tsc` clean, lint 0 errors / 21
pre-existing warnings, build 90 routes, translation 14/14, a11y 28/28, SEO
60/60, Playwright 48 passed / 4 skipped (rate-dependent, no live DB in the
local environment).

The whitespace-only-fix gap described above is now a standing rule — see the
new bullet in section 12 about checking a security tool's actual remote
result, not just local checks, before reporting a fix as done.

### 16.3 Pull request state as of this addendum

| PR | State | Notes |
|---|---|---|
| [#16](https://github.com/anadyongr-droid/anadyon/pull/16) | Draft, unmerged | NBG hosted checkout — unchanged, still gated per section 10.2 |
| [#25](https://github.com/anadyongr-droid/anadyon/pull/25) | **Merged** (`0bdbfb6`) | CodeQL alert triage — deployed to production, confirmed live |
| [#27](https://github.com/anadyongr-droid/anadyon/pull/27) | **Merged** (`330e814`) | This document's original tracking + addendum |

### 16.4 What's actually left after this addendum

- Complete the PR #26 post-merge operational checklist: confirm the production
  Resend webhook subscribes to all seven event types, then send one controlled
  quote confirmation to a monitored inbox and confirm both the customer and
  `customerservice@anadyon.gr` receive it, replies route correctly, and the
  reservation's delivery status progresses from "Accepted"/"Sent by email
  provider" to "Delivered to recipient's mail server" after refresh.
- Everything else in section 10 (recovery/backup drill, governance, Gmail-token
  encryption, CSP, NBG) is unchanged and still open.
