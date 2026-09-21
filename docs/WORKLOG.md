# Worklog

One dated entry per working day, newest first, per
[`DEFINING-STATEMENTS.md` §11](../DEFINING-STATEMENTS.md).

**What this file is for.** Recording the day: what was done, what was decided,
what was discussed and set aside, and what was left open. It points at the
documents that hold the detail — it does not restate them. The living documents
are updated first; this is the index to the day, not a replacement for them.

**What it is not.** Not a changelog (git has one), not a place to move content
out of the blueprint or the subject documents, and not a substitute for updating
them. An entry that carries findings no document owns has been written in the
wrong place.

---

## 21 September 2026 — Claude, implementer

**Last verified:** 21 September 2026, Claude.

Detail in [`worklog/2026-09-21-claude.md`](worklog/2026-09-21-claude.md).

**Yesterday's guard earned itself overnight.** Seven Dependabot pull requests
arrived and three split the CodeQL pin exactly as #83 did.
`lib/actionPinParity.test.ts` failed on all three and named the mismatched
lines, so CI refused them with nobody looking. Replaced by **#155**.

**A verification trap, recorded so it is not hit twice.** `v4.38.1` is an
annotated tag: an exact-ref query returns the tag object, not the commit, and
the difference looks exactly like a bad pin until the tag is peeled with `^{}`.
Dependabot's SHA was right. Peel before concluding.

**#148 merged** (four minor/patch bumps). **#151 declined** — `@types/node` ^26
again. **#149** and **#150** left open and blocked upstream: the coverage
reporter peer-requires an exact vitest 5.0.1, and eslint 10 removed
`context.getFilename()`, which `eslint-config-next`'s bundled
`eslint-plugin-react` still calls.

**#156 stops two of these being offered at all** — action updates grouped into
one pull request, `@types/node` majors ignored with the reasoning in the file.
The test stays: configuration can be changed by anyone, the test is what fails.

**Not fixed, and needing Tasos:** **E16**, the off-site backup, now two
consecutive failures on a malformed rotated credential; **F2**, the motorbike
insurance expiry; **E6**, the Plesk certificate at ~22 days.

---

## 20 September 2026 — Claude, implementer

**Last verified:** 20 September 2026, Claude.

Full detail in [`worklog/2026-09-20-claude.md`](worklog/2026-09-20-claude.md)
and [`worklog/2026-09-20-codex.md`](worklog/2026-09-20-codex.md). This entry
points at what moved; it does not restate it.

**Governance.** `CLAUDE.md` now imports `DEFINING-STATEMENTS.md` as well as
`AGENTS.md`, so both bind every agent every session rather than only when
someone thought to open them (#124). `lib/governanceWiring.test.ts` holds that
wiring: both imports present, no principle silently dropped or renumbered,
every `§N` cited in `AGENTS.md` actually existing, and §13 present by number and
by substance.

**Three principles were factually wrong and are corrected** (#125) — §5 on where
pricing is computed, §6 on anonymous grants, §10 on the Full Damage Waiver's
price. The FDW figure had read €12 since 2 September, taken from
`supabase/seeds/staging.sql`, whose own first line says "Synthetic staging
fixtures only"; the live rate is **€5.00**. `lib/publishedPriceParity.test.ts`
now scans the repository root as well as `docs/`, which is why the error
survived the 19 September sweep. **The code was never wrong** — the documents
had drifted away from it, and §5's stale wording actively invited an agent to
delete a server-side security control.

**Dependency queue, worked one at a time** (#130–#133). Six of seven resolved;
**four were wrong as offered.** Dependabot enumerates dependencies, it does not
understand them: it split a CodeQL pin that must move as one, offered
`@types/node` ^26 against a Node 24 runtime, and named three node20 actions
while a fourth had no PR at all. `lib/actionPinParity.test.ts` now fails on a
split pin. **#87 (TypeScript 7) stays open and is blocked upstream** — `tsc`
passes; `typescript-eslint` refuses to load. Recorded on `OPEN-ITEMS.md` R2.

**The queue's own load then exposed a durable bug in the end-to-end rig**
(#135). The staging suite failed with 429 against a diff of one workflow file:
the limiter is database-backed on purpose, but the test's IP counter restarts
every run, so the buckets accumulate. The replay case spends two requests on
one address where every other case spends one, so it alone breaks after five
runs in the window — and the queue put six through. The remedy was already in
the file, written for one address and never extended.

**Three new open items.** **E11** — a cancelled staging E2E check is grey, not
red, so a pull request whose E2E never ran does not read as failing; seen on
#131. **E12** — which Node major Vercel runs has not been confirmed since
19 August, and only Tasos can read it. **R7** — with branch protection strict
and two agents merging, a stale branch is reported as `405 Required status
check "build" is expected`, which reads as a missing check; the real signal is
`mergeable_state: behind`.

**Codex merged #134 the same afternoon**, making the staging schema-parity
check understand the pending 042–045 migrations — item 2 of the runbook §13
plan, and the one that turns a check guaranteed to fail back into a useful one.

**Also closed today:** the admin frozen-panes defect (W5), on evidence rather
than a fix — the existing implementation passed all 32 checks including a
deliberately broken control. The inbound-link work shipped 46 redirects for 86
legacy URLs that were 404ing.

---

## 19 and 9 September 2026 — consolidation owed and now written

**Last verified:** 20 September 2026, Claude.

**This file held one entry, from 2 September, until today.** §11.2 makes the
consolidated daily entry Claude's job, and it was not done on 9 or 19
September even though the agent summaries were written. Recording the gap
rather than quietly filling it, because the pattern matters more than the two
missing entries: the per-agent summaries under `worklog/` were kept faithfully
throughout, so nothing was lost — but anyone reading this file for the shape of
the month would have concluded that nothing happened after 2 September.

The days themselves are in
[`worklog/2026-09-09-claude.md`](worklog/2026-09-09-claude.md),
[`worklog/2026-09-19-claude.md`](worklog/2026-09-19-claude.md) and
[`worklog/2026-09-19-codex.md`](worklog/2026-09-19-codex.md). The living
documents they feed — the blueprint, the audits, `OPEN-ITEMS.md` and the
status section of `README.md` — were kept current on those days, which is the
part §11.2 says matters most.

**The lesson is the one §11 already states:** do the close-of-day pass while
there is still context to do it with. Both missed days were long ones that ran
to the end of their budget.

---

## 2 September 2026 — Claude, implementer

**Last verified:** 2 September 2026, Claude.


### Done

- **Under-23 insurance surcharge, built and pushed.** €5/day for every driver
  below 23 on the pick-up date, requested by Tasos. Branch
  `claude/insurance-surcharge`; verification green at 960 tests across 91 files.
  Migration **044** written with its byte-identical paste copy and **not
  applied** — it is Tasos's to run.
- **Read all three fleet insurance certificates** — Euroins on the i20,
  Intersalonica on the KYMCO 125 and the 50cc — and wrote
  [`INSURANCE-COVER-AND-RESTRICTIONS.md`](INSURANCE-COVER-AND-RESTRICTIONS.md).
- **Added `DEFINING-STATEMENTS.md` §10**, at Tasos's instruction that the
  project follow the actual insurance contracts in both content and
  functionality.
- **Added `DEFINING-STATEMENTS.md` §11** — this file's reason for existing.
- **Put a dated status section at the top of `docs/README.md`**, listing what is
  settled and must not be re-investigated. Written after a session was spent
  re-deriving facts already committed to this repository.
- **Fixed `lib/stripe.ts`**, which was blocking every local verification.

### Decided

- **The surcharge is derived from date of birth, never selectable.** Putting it
  in `ExtrasSelection` would have let a crafted request set the quantity to
  zero, because every field of that type arrives from the browser. A test reads
  the interface and fails if the key ever appears there.
- **It lands in browser, server and admin modal together.** The first two price
  independently and a mismatch emails the office a manipulation warning, so a
  server-only change would have raised a fraud alarm on every under-23 booking.
- **No date of birth means no surcharge.** Charging a fee that cannot be
  justified from a stated fact is worse than missing one; the counter verifies
  age against the licence.
- **Published wording names the ages but not the euro figure**, because the
  figure is operator-editable from the Rates screen and a number typed into the
  terms page would go stale silently.

### Discussed, not built

- **The existing `discount_rules` `age_surcharge` mechanism was rejected** for
  this, and it has a bug: it charges per rental rather than per day, it parses
  the band's *lower* bound so a threshold of 22 would also charge a 24-year-old,
  and the public quote route never calls it. Recorded rather than fixed —
  fixing it was not what was asked. Still open.
- **Lowering the motorbike age to the licence categories the law already sets**
  (AM 16, A1 18, A2 20) — recommended in
  [`DRIVER-AGE-MARKET.md`](DRIVER-AGE-MARKET.md) §7, not acted on. The
  certificates do not block it; the terms booklets decide.

### Researched

- **What top software houses actually do about written records**, at Tasos's
  question. Recorded as the "Why this shape" subsection of
  `DEFINING-STATEMENTS.md` §11 with its sources, so it is not researched again.
  Short version: documentation quality is measurable and predicts delivery
  performance (DORA 2021: 2.4×, and only ~25% of teams manage it); the
  established artifacts are organised by **subject and decision, not by date**
  (ADRs, handbook-first, docs-as-code); and where dated records exist they are
  **event-driven** — a release, an incident — never a calendar day.
- **Adopted from Google's practice:** every document under `docs/` carries a
  `Last verified:` line. We had no staleness signal, and a stale line in
  `docs/README.md` cost a session.

### Findings that change the product

From the insurance reading, in descending cost:

- **No collision own-damage cover on any vehicle, across two insurers.** Full
  Damage Waiver at ~~€12/day~~ is entirely self-insured.
  <!-- price-exempt: dated entry; the €12 was read from a staging fixture and is corrected to €5.00 in the 19 September entry --> §4.1 of the insurance
  document.
- **No theft cover, no general fire, no glass**, on any of the three.
- **The 50cc has no roadside assistance** — the car's clause covers motorcycles
  only above 50cc, and neither bike policy lists assistance at all.
- **No age restriction and no licence-tenure rule** on any certificate. Our 21
  is a commercial choice; the surcharge is a commercial charge, **not** a
  pass-through of an insurer loading, and must not be described as one.

### Open, unverified, or needing a person

- **The 50cc (ΗΒΙ 1560) expires 11 September 2026** — nine days out, in season.
- **The 125 certificate supplied (ΖΒΒ 0565) expired 23 September 2025.** Almost
  certainly a stale copy, but it is the only evidence available and does not
  show current cover.
- **Are renters covered as unnamed drivers?** All three certificates have
  named-driver slots with only the owner filled in. Both bikes are on rental use
  classes, so almost certainly yes — but the downside if not is that no rental
  is covered at all. Blocking question for the broker.
- **The terms booklets have not been supplied** for either insurer. Every
  conclusion about *exclusions* is therefore unverified, and labelled so.
- **Migrations 042 and 044 are not applied.** 043 is in PR #95.
- **The four handover gateways are still granted to nobody**, so the counter
  routes cannot work against production. One-line follow-up migration; the
  identity question that blocked it closed on 31 August.
- **`lib/stripe.ts` on `main` does not typecheck on a clean checkout.** Fixed on
  both `claude/insurance-surcharge` and #96; whichever merges first resolves it.
- **Photo upload saga** — the last piece of phase 2. Not started.
- **Dependabot backlog** — #96 then #83, #78–#81 one at a time, then #85, #86,
  and TypeScript 7 (#87) last.

### Pushed

- **#99** — driver age market research, the insurance document, `DEFINING-STATEMENTS`
  §10 and §11, this worklog, and the `docs/README.md` status section.
- **`claude/insurance-surcharge`** — the surcharge, migration 044, the Stripe fix.
  No PR opened; Tasos has not asked for one.
