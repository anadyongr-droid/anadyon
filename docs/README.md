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
| [`RESTORE.md`](RESTORE.md) | Recovery procedure |

## Handovers

`HANDOFF-*.md` are point-in-time records of a specific piece of work — pricing,
email delivery, customer fields, promo and seats. They are history, not current
instruction. When a handover's content becomes a standing rule, move it into
`DEFINING-STATEMENTS.md` or the blueprint; do not leave it to be rediscovered.

## Running the two agents

`scripts/agent-loop.mjs` alternates Claude and Codex between the architect and
implementer roles defined in `../AGENTS.md`.

```
node scripts/agent-loop.mjs --turns 1 "add stop-sells to the fleet screen"
```

Read the branch it leaves, then run the next round on the same branch with the
roles swapped:

```
node scripts/agent-loop.mjs --continue --turns 1
```

One turn at a time keeps a person between every pair of turns. `--continue`
recovers the turn number, the goal and the previous architect from the branch's
own commits, so the alternation carries across rounds instead of handing the
same agent the same chair every time.

It refuses to start on a dirty tree, verifies both CLIs answer before looping,
puts the architect's decision into `RENTAL-SYSTEM-BLUEPRINT.md` rather than a
scratch file, gates every commit on the full suite — `tsc`, lint, tests, build —
and never pushes. Each guard is there because of a specific failure; the header
comment says which.

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
