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

## 2 September 2026 — Claude, implementer

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

### Findings that change the product

From the insurance reading, in descending cost:

- **No collision own-damage cover on any vehicle, across two insurers.** Full
  Damage Waiver at €12/day is entirely self-insured. §4.1 of the insurance
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
