# Documentation

Start here. Everything below is committed, so it survives a lost folder, a new
machine or a six-month gap.

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
| [`OPEN-QUESTION-RPC-STAFF-IDENTITY.md`](OPEN-QUESTION-RPC-STAFF-IDENTITY.md) | **Open question, blocking blueprint §4.2** — every RPC call uses the service role, so `auth.uid()` is NULL and the specified staff-identity gateway cannot work. Written to be read cold by an outside reviewer |
| [`ARCHITECTURE-STATUS-2026-08-30.md`](ARCHITECTURE-STATUS-2026-08-30.md) | **Current status of the whole architecture, written to be read cold by an outside reviewer** — what is built, what is open and blocked on what, the decisions most likely to be wrong, and what a review is being asked to comment on |
| [`HANDOVER-TEST-ENVIRONMENT.md`](HANDOVER-TEST-ENVIRONMENT.md) | **Build brief** — error tracking, the end-to-end suite in CI, and a staging Supabase project. Written for an implementer to work from without asking questions |
| [`ACTIONS-FOR-TASOS-2026-08-30.md`](ACTIONS-FOR-TASOS-2026-08-30.md) | **Open actions that need a human** — a Vercel dashboard, a SQL editor, a vendor email or a logged-in browser. Ordered by urgency |
| [`GATE-0-QUESTIONS.md`](GATE-0-QUESTIONS.md) | **The blocker, as two forwardable briefs** — what is waiting on the accountant and on Greek/EU counsel, with the source of each question |
| [`RESTORE.md`](RESTORE.md) | Recovery procedure |
| [`ENGINEERING-SAFETY-NET.md`](ENGINEERING-SAFETY-NET.md) | Local verification, dependency automation, optional coverage and the controls that still require human or hosted evidence |
| [`STAGING-AND-OBSERVABILITY-RUNBOOK.md`](STAGING-AND-OBSERVABILITY-RUNBOOK.md) | How to create, reset and verify isolated staging, wire Preview and CI, and validate privacy-safe Sentry |

## Handovers

`HANDOFF-*.md` are point-in-time records of a specific piece of work — pricing,
email delivery, customer fields, promo and seats. They are history, not current
instruction. When a handover's content becomes a standing rule, move it into
`DEFINING-STATEMENTS.md` or the blueprint; do not leave it to be rediscovered.

## Conventions that bite

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
