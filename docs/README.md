# Documentation

Start here. Everything below is committed, so it survives a lost folder, a new
machine or a six-month gap.

## Read this before anything else

| Document | Why |
|---|---|
| [`OPEN-ITEMS.md`](OPEN-ITEMS.md) | **Obligatory at the start of every day** (`DEFINING-STATEMENTS.md` §12) — everything outstanding, with an owner on each item and a dated section to check against the calendar |
| The status section below | Where the project actually is today |
| [`WORKLOG.md`](WORKLOG.md) | The most recent day's entry |

## Where things stand — 2 September 2026

**Last verified:** 2 September 2026, Claude.

**Read this section before opening anything else, and before researching
anything.** It exists because an agent spent a working session re-deriving
facts that were already settled in this repository — re-running a competitor
benchmark that was already committed, and repeating a stale audit finding about
the driver-age rule four times after `lib/rentalPolicy.ts` had already fixed it.
That is the failure `DEFINING-STATEMENTS.md` §9 warns about, and it is expensive
in a way that is invisible until someone checks.

If you change the state of any line below, edit this table in the same commit.
A status section that is only updated when someone remembers is worse than none,
because it is believed.

### Settled — do not re-investigate

| Question | Answer | Where |
|---|---|---|
| How does an RPC know which staff member is calling? | **Closed.** Option A adopted 31 Aug; the diagnostic ran, confirmed the behaviour, and was removed. The production grant gate is cleared. | `OPEN-QUESTION-RPC-STAFF-IDENTITY.md` §13 |
| Do the terms, the booking modal and the FAQ disagree on driver age? | **No — fixed.** `lib/rentalPolicy.ts` single-sources all three. The August audit finding B1 is closed; it still reads as open in the audit file. | `lib/rentalPolicy.ts` |
| Is document upload verified against staging? | **Yes**, 31 Aug. | `STAGING-AND-OBSERVABILITY-RUNBOOK.md` |
| What do competitors charge, and what are the legal age floors? | **Researched 1 Sept, committed.** Greek law sets motorbike minimums by licence category (AM 16, A1 18, A2 20, A 24), so our blanket 21 sits *above* the legal floor. Do not re-run this search. | `DRIVER-AGE-MARKET.md` |
| Why does `df` say the sandbox disk is full when little is used? | Fixed per-session allowance, not a broken machine. Never delete `/opt/pw-browsers`. | `SANDBOX-DISK.md` (PR #98) |
| Do the insurance policies restrict driver age? | **No — none of the three certificates carries an age or licence-tenure condition.** Our 21 is a commercial choice. But the certificates defer exclusions to terms booklets not yet supplied, so this is "not on the certificate", not "does not exist". | `INSURANCE-COVER-AND-RESTRICTIONS.md` §2 |
| Does the system already track KTEO and insurance expiry, and stop-sell on them? | **Yes — built and tested.** Migration 011 columns, admin modal inputs, 30-day warnings in `lib/fleetStatus.ts`, and a hard bar in the availability route measured against the pick-up date. It is **inert until the dates are entered**, because an unrecorded date reads as `unknown` and `unknown` does not bar. Open item F1. | `lib/fleetStatus.ts` |
| Is the Full Damage Waiver backed by insurance? | **No.** No collision own-damage cover on any of the three vehicles, across two insurers. FDW at €12/day is self-insured. | `INSURANCE-COVER-AND-RESTRICTIONS.md` §4.1 |

### Phase 2, the counter — the live workstream

Build order is `RENTAL-SYSTEM-BLUEPRINT.md` §7. Migrations are numbered; the
number in brackets is the migration, and **applied** means Tasos has run it
against production.

| Piece | Migration | State |
|---|---|---|
| `rental_handovers` table | 040 | **Applied** |
| Check-out finalisation | 041 | **Applied** |
| Check-in finalisation | 042 | Merged (#93). **Not applied** |
| Correction and voiding, plus the five HTTP routes | 043 | Open in **PR #95** |
| Insurance surcharge for under-23 drivers | 044 | **In progress** — see below |
| Photo upload saga | — | Not started. Last piece of phase 2 |

**The gateways are granted to nobody.** `finalise_check_out`,
`finalise_check_in`, `correct_handover` and `void_handover` all exist with no
EXECUTE grant, because they were written while the identity question was open.
That question is now closed, so a one-line follow-up migration can grant them.
Until it does, the counter routes cannot work against production.

### Insurance surcharge — in progress, 2 September

Requested by Tasos: a daily insurance surcharge of **€5 for every driver under
23**. Decisions taken while building, so they are not re-litigated:

- **Age is derivable.** Date of birth is collected and required on the booking
  form, and `app/api/quote/route.ts` already computes exact age on the pick-up
  date. No change to the `21–25` / `26–65` / `66+` bands is needed, and no
  schema migration for them.
- **The €5 lives in `extras_config`**, so it is editable from the Rates screen
  rather than compiled in. But it is **derived from age, never selectable** —
  putting it in `ExtrasSelection` would let a crafted request set it to zero.
- **It must land in the browser's price display and the server's calculation in
  the same commit.** The two are computed independently and a mismatch emails
  the office a "possible price manipulation" warning; server-side only would
  fire that alarm on every under-23 booking.
- **No date of birth means no surcharge.** Charging a fee we cannot justify from
  a stated fact is worse than missing one; the counter checks the licence.
- **The published wording names the age band but not the euro figure**, because
  the figure is operator-editable and a number hardcoded into the terms page
  would go stale silently. The exact amount appears as a priced line on the
  quote and in the confirmation email before the customer pays.

The existing `discount_rules` `age_surcharge` mechanism **cannot do this and has
a bug**: it charges per rental rather than per day, it parses the band's *lower*
bound (`"21–25".split("–")[0]` → 21) so a threshold of 22 would also charge a
24-year-old, and the public quote route never calls it — it is admin-only.
Recorded here rather than fixed, because fixing it was not what was asked.

### Open pull requests

| PR | What | Waiting on |
|---|---|---|
| **#95** | Phase 2 correction and voiding, plus the HTTP surface | Review/merge |
| **#96** | Dependabot production group, 11 updates | CI. Needed a Stripe `apiVersion` fix, pushed |
| **#98** | Sandbox disk runbook | Review/merge |
| **#99** | Driver age market research | Review/merge |
| #83, #78–#81 | GitHub Actions and CodeQL majors | Take one at a time |
| #85, #86, #87 | `@types/node` 26, googleapis 176, TypeScript 7 | TypeScript 7 last — it is the one likely to break |
| #16, #31, #58, #71 | Stale, three of them drafts, oldest from 22 August | A decision to finish or close them |

`codex/incident-admin-middleware-timeout` has never been merged and has no PR.

### Waiting on a human

Per `AGENTS.md`, agents decide everything else themselves. These genuinely
cannot be done from here — the full list with steps is in
`ACTIONS-FOR-TASOS-2026-08-30.md`.

- Applying migrations 042 and 044 (and 043 once #95 merges)
- The Sentry project, and a staging reset from main
- **The insurer's answers** — `DRIVER-AGE-MARKET.md` §5 is five questions to the
  broker, and they decide whether any age limit can actually move. The surcharge
  being built does not depend on them; lowering the age limits does.
- Counsel and the accountant — `GATE-0-QUESTIONS.md`

## Read first

| Document | Answers |
|---|---|
| [`../DEFINING-STATEMENTS.md`](../DEFINING-STATEMENTS.md) | What the product is for, which trade-offs are already settled, and **§9 — read what is already written before researching it again** |
| [`RENTAL-SYSTEM-BLUEPRINT.md`](RENTAL-SYSTEM-BLUEPRINT.md) | How we compare to the systems a Greek operator would buy, what to build next, and what we deliberately will not build |
| [`audits/`](audits/) | Whether what we built is sound — full reviews scored against ten fixed areas |

The blueprint asks *are we building the right thing?* An audit asks *is what we
built sound?* Keep them apart; they go stale at different rates.

## Reference

| Document | Covers |
|---|---|
| [`NBG-PAYMENTS-INTEGRATION.md`](NBG-PAYMENTS-INTEGRATION.md) | National Bank of Greece hosted checkout, currently gated |
| [`PREVIEW-RECAPTCHA-TEST-KEYS.md`](PREVIEW-RECAPTCHA-TEST-KEYS.md) | Why Preview uses Google's reCAPTCHA test pair, and the build-time guard that keeps it out of production |
| [`INCIDENT-ADMIN-MIDDLEWARE-TIMEOUT.md`](INCIDENT-ADMIN-MIDDLEWARE-TIMEOUT.md) | The admin lockout that self-resolved with no cause established |
| [`HANDOVER-ADMIN-FROZEN-PANES.md`](HANDOVER-ADMIN-FROZEN-PANES.md) | **Open defect** — table headers and first column will not freeze on iPad; three attempts and what disproved each |
| [`OPEN-QUESTION-RPC-STAFF-IDENTITY.md`](OPEN-QUESTION-RPC-STAFF-IDENTITY.md) | **Answered, 31 August 2026 — kept for its reasoning, not as an open item.** How a database function identifies the staff member calling it, why the service role made `auth.uid()` NULL, and the Option A gateway adopted instead. §13 is the decision; read it before §§1–12. Written to be read cold by an outside reviewer |
| [`ARCHITECTURE-STATUS-2026-08-30.md`](ARCHITECTURE-STATUS-2026-08-30.md) | **Current status of the whole architecture, written to be read cold by an outside reviewer** — what is built, what is open and blocked on what, the decisions most likely to be wrong, and what a review is being asked to comment on |
| [`HANDOVER-TEST-ENVIRONMENT.md`](HANDOVER-TEST-ENVIRONMENT.md) | **Build brief** — error tracking, the end-to-end suite in CI, and a staging Supabase project. Written for an implementer to work from without asking questions |
| [`ACTIONS-FOR-TASOS-2026-08-30.md`](ACTIONS-FOR-TASOS-2026-08-30.md) | **Open actions that need a human** — a Vercel dashboard, a SQL editor, a vendor email or a logged-in browser. Ordered by urgency |
| [`GATE-0-QUESTIONS.md`](GATE-0-QUESTIONS.md) | **The blocker, as two forwardable briefs** — what is waiting on the accountant and on Greek/EU counsel, with the source of each question |
| [`INSURANCE-COVER-AND-RESTRICTIONS.md`](INSURANCE-COVER-AND-RESTRICTIONS.md) | **What the fleet is actually insured for**, read from the three policy certificates — and what it is not: no collision own-damage cover behind the Full Damage Waiver, no theft, no glass, no assistance on 50cc. `DEFINING-STATEMENTS.md` §10 makes this the reference that published wording and product decisions follow |
| [`DRIVER-AGE-MARKET.md`](DRIVER-AGE-MARKET.md) | Competitor age limits, the Greek licence-category minimums the law already sets, and what a young-driver surcharge looks like in this market |
| [`OPEN-ITEMS.md`](OPEN-ITEMS.md) | **The live list of everything outstanding**, each item with a named owner. Read at the start of every day per `DEFINING-STATEMENTS.md` §12; curated daily by Claude, added to by any agent at any time |
| [`WORKLOG.md`](WORKLOG.md) | **What happened each day**, consolidated by Claude from the per-agent summaries in [`worklog/`](worklog/). Actions, decisions, things discussed and set aside, and what was left open. Per `DEFINING-STATEMENTS.md` §11 |
| [`RESTORE.md`](RESTORE.md) | Recovery procedure |
| [`ENGINEERING-SAFETY-NET.md`](ENGINEERING-SAFETY-NET.md) | Local verification, dependency automation, optional coverage and the controls that still require human or hosted evidence |
| [`STAGING-AND-OBSERVABILITY-RUNBOOK.md`](STAGING-AND-OBSERVABILITY-RUNBOOK.md) | How to create, reset and verify isolated staging, wire Preview and CI, and validate privacy-safe Sentry |

## Handovers

`HANDOFF-*.md` are point-in-time records of a specific piece of work — pricing,
email delivery, customer fields, promo and seats. They are history, not current
instruction. When a handover's content becomes a standing rule, move it into
`DEFINING-STATEMENTS.md` or the blueprint; do not leave it to be rediscovered.

## Conventions that bite

**Freshness.** Every document here carries a `Last verified:` line — a date and
who checked it. `DEFINING-STATEMENTS.md` §11 requires it to be refreshed as part
of the close-of-day pass for any subject the day touched. It is adopted from the
practice in *Software Engineering at Google* ch. 10 of giving documentation
owners and expiry dates, and it exists because a stale index line in this file
described a closed question as open and blocking for two days, and cost a
session's work. An old date is not a failure; an absent one means nobody knows.

**Migrations.** Every migration is numbered and has a byte-identical copy under
`supabase/migrations/paste/` for the Supabase SQL Editor. Edit the migration and
the paste copy drifts — this reached production once. `lib/migrationPasteParity.test.ts`
now enforces the pair. Migrations are never applied automatically; they are
handed over to be run.

**Verification.** A new regression test is only trusted once it has been run
against the *unfixed* code and seen to fail. Security tooling that runs only in
CI — CodeQL especially — is read from the pushed commit's check result, never
inferred from a green local suite.

**Measurement.** Methods that have produced confident false readings on this
project are listed in [`audits/README.md`](audits/README.md). Read them before
running a sweep; two of them have each cost a wrong finding more than once.

**Staging resets.** Hosted staging is disposable and contains synthetic data
only. `npm run staging:reset` is its only supported schema reset: it verifies
the target three ways, replays migrations, reseeds, and checks grants/schema.
Never fix staging by hand, never copy a production dump, and never apply a
migration from an automated agent. The exact operator procedure is in the
[staging runbook](STAGING-AND-OBSERVABILITY-RUNBOOK.md).
