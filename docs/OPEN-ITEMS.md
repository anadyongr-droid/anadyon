# Open items

**Last verified:** 2 September 2026, Claude.

**Read this first, every day.** [`DEFINING-STATEMENTS.md` §12](../DEFINING-STATEMENTS.md)
makes it obligatory for every agent, before picking up a task.

Everything known to be outstanding lives here until it is done or deliberately
dropped — and dropping one is recorded with a reason, not deleted. Claude
curates it daily as part of §11.2, but **any agent may add an item the moment it
is noticed**. An item remembered at the close of day is an item that may not be.

Every item has an **owner**. `Agent` means any agent may take it. `Tasos` means
it needs a person, and the item says exactly what is needed.

---

## 📋 Fleet records — the system is built and waiting for this data

| # | Item | Owner |
|---|---|---|
| F1 | **Record insurance contracts, KTEO and kilometrage in the system for every active vehicle.** Insurer, policy number, insurance expiry, KTEO expiry and odometer, for all 29 vehicles. | **Tasos** |

**Nothing has to be built first — and that is the point.** Migration 011 already
added `insurance_provider`, `insurance_policy_no`, `insurance_expiry`,
`kteo_expiry` and `odometer_km` to `vehicles`; the admin vehicle modal already
has an input for each; `lib/fleetStatus.ts` already warns 30 days ahead; and
`/api/admin/vehicles/availability` already refuses to rent a vehicle whose KTEO
or insurance has lapsed — measured against the **pick-up date**, so a booking
taken in March for August is judged on August. `fleetStatus.ts` is explicit that
an expired KTEO voids insurance cover and is an absolute bar, not a warning.

**But it is all inert until the dates are entered.** `rentalBar` bars only on
severity `expired`, and a date that has never been recorded is severity
`unknown` — which does not bar. So a vehicle with no insurance date on file
rents today with **no statutory check at all**. Entering the data is what
switches on protection that already exists and is already tested.

Verified against the code 2 September 2026, not assumed.

## 🚧 Blocking — work cannot proceed correctly until these are answered

| # | Item | Owner |
|---|---|---|
| B1 | **Are renters covered as unnamed drivers?** All three certificates have named-driver slots with only the owner filled in. Both bikes are on rental use classes so almost certainly yes — but if not, no rental is covered at all. One written confirmation from the broker closes it. | Tasos |
| B2 | **The terms booklets have not been supplied** — Euroins *Βιβλίο Όρων Ασφάλισης* and the Intersalonica Γενικοί/Ειδικοί/Προαιρετικών Καλύψεων. Every conclusion about *exclusions* — age, licence tenure, anything — is unverified until these are read. | Tasos |
| B3 | **Is there any own-damage cover on the fleet not yet shown?** If not, Full Damage Waiver at €12/day is confirmed self-insured and needs a product decision. | Tasos |
| B4 | **Gate 0 — counsel and the accountant.** See [`GATE-0-QUESTIONS.md`](GATE-0-QUESTIONS.md). Two forwardable briefs, already written. | Tasos |

---

## 🗄 Migrations written and awaiting application

Per `AGENTS.md`, agents never apply migrations. Each has a byte-identical copy
under `supabase/migrations/paste/`.

| # | Migration | Status | Owner |
|---|---|---|---|
| M1 | **042** — check-in finalisation | Merged (#93), not applied | Tasos |
| M2 | **043** — handover correction and voiding | In open PR #95 | merge, then Tasos |
| M3 | **044** — insurance surcharge rate row | On `claude/insurance-surcharge`, no PR | Tasos |
| M4 | **Grant the four handover gateways.** `finalise_check_out`, `finalise_check_in`, `correct_handover`, `void_handover` are granted to nobody, so the counter routes cannot work against production. The identity question that blocked this closed on 31 August — it is now a one-line follow-up migration that nobody has written. | not written | Agent |

---

## 🔨 Build work

| # | Item | Owner |
|---|---|---|
| W1 | **Photo upload saga** — the last piece of phase 2. Not started. Blueprint §7. | Agent |
| W2 | **Content correctness against the insurance policies.** The site may currently imply cover that does not exist: theft is uncovered, glass is uncovered, 50cc has no roadside assistance, and FDW has no own-damage policy behind it. `DEFINING-STATEMENTS.md` §10 makes this binding. [`INSURANCE-COVER-AND-RESTRICTIONS.md`](INSURANCE-COVER-AND-RESTRICTIONS.md) §5 items 1–3. | Agent |
| W4 | **`discount_rules` `age_surcharge` is broken.** Charges per rental not per day; parses the band's *lower* bound so a threshold of 22 also charges a 24-year-old; the public quote route never calls it. Found 2 Sep and deliberately not fixed — it was not what was asked. | Agent |
| W5 | **Admin frozen panes** — open UI defect, three theories disproved and recorded. [`HANDOVER-ADMIN-FROZEN-PANES.md`](HANDOVER-ADMIN-FROZEN-PANES.md). | Agent |
| W6 | **Pin the `app/admin/login/page.tsx` lint warning** with a disable comment. The hard navigation is deliberate — it forces the browser to send refreshed cookies to the middleware after MFA — and "fixing" it would break login. | Agent |

---

## 🧭 Decisions not yet taken

| # | Item | Owner |
|---|---|---|
| N1 | **Is FDW a priced self-insurance product, or withdrawn/repriced?** No own-damage cover behind it on any vehicle, across two insurers. Whatever is chosen, its published wording must be exact. Depends on B3. | Tasos |
| N2 | **Motorbike age by licence category** — AM 16, A1 18, A2 20, as Greek law already sets. Largest commercial gain, smallest cost. [`DRIVER-AGE-MARKET.md`](DRIVER-AGE-MARKET.md) §2 and §7. Depends on B2. | Tasos |
| N3 | **Cars at 19 or 20 with a surcharge**, picking up the segment two local operators serve. §3 and §7. Depends on B2. | Tasos |
| N4 | **A minimum licence-holding period.** Nearly every competitor requires one year and none of our certificates does. Adopt one deliberately, or record that we deliberately have none. §6. | Tasos |

---

## 🔁 Repository hygiene

| # | Item | Owner |
|---|---|---|
| R1 | **`lib/stripe.ts` on `main` does not typecheck on a clean checkout.** `package.json` floats `stripe@^22.5.0`; a fresh install resolves 22.6.0, which narrows the `apiVersion` type. Fixed on `claude/insurance-surcharge` and on #96 — whichever merges first resolves it. | Agent |
| R2 | **Dependabot backlog**, in this order: #96 (production group), #83 (CodeQL), #78–#81 (Actions majors, one at a time), #85, #86, and **#87 TypeScript 7 last** — it is the one likely to break. | Agent |
| R3 | **Four stale PRs** — #16 (NBG payments, draft), #31 (incident closure), #58 (agent loop, draft), #71 (Epsilon/AADE, draft). Oldest from 22 August. Finish or close. | Agent |
| R4 | **`codex/incident-admin-middleware-timeout`** has never been merged and has no PR. | Agent |
| R5 | **Open PRs awaiting merge:** #95 (phase 2 correction/voiding + HTTP routes), #98 (sandbox disk), #99 (insurance, principles, worklog). | Agent |
| R6 | **`claude/insurance-surcharge` has no PR.** Pushed and green; not opened because it was not asked for. | Agent |

---

## 🏗 Environment and tooling

| # | Item | Owner |
|---|---|---|
| E1 | **Sentry project** — needs a dashboard. [`STAGING-AND-OBSERVABILITY-RUNBOOK.md`](STAGING-AND-OBSERVABILITY-RUNBOOK.md). | Tasos |
| E2 | **Staging reset from main** via the guarded `npm run staging:reset`. | Tasos |
| E3 | **Remaining §8 browser checks** not yet run. Recorded as not run, never as passed. | Agent |

---

## ✅ Recently closed

Kept briefly so a closed item is not reopened by someone who remembers it as open.

| Item | Closed | How |
|---|---|---|
| RPC staff identity — how does a function know who is calling? | 31 Aug 2026 | Option A adopted, diagnostic run and removed (#94). Production grant gate cleared. |
| Driver-age contradiction between terms, modal and FAQ (audit B1) | before 2 Sep | `lib/rentalPolicy.ts` single-sources all three. The audit file still reads as open. |
| Document upload verified against staging | 31 Aug 2026 | Verified. |
| Young-driver surcharge published but never charged | 2 Sep 2026 | Built at €5/day under 23, `claude/insurance-surcharge`. Migration 044 still to apply — see M3. |
| **Insurance renewals — car, 125 and 50cc** | 2 Sep 2026 | Tasos is handling the renewals directly. The 125 (ΖΒΒ 0565) certificate was the stale copy it looked like: the current policy is **217443636**, 11 Jun → **11 Sep 2026**. Both motorbikes now expire on the same day. Superseded by F1, which is what puts the dates where the system can act on them. |
| **Insurance expiry in the vehicle record, with stop-sell** | already built | Found on 2 Sep to exist already — migration 011 columns, the admin modal inputs, `lib/fleetStatus.ts` 30-day warnings, and a hard bar in the availability route measured against the pick-up date. Was listed as open build work in error. What remains is the data, not the code: F1. |
