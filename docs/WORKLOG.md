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

## 4 October 2026 — Claude (implementer)

**Last verified:** 4 October 2026, Claude.

**The day the nightly check was used for the first time, and found four defects
in itself.** Detail in
[`worklog/2026-10-04-claude.md`](worklog/2026-10-04-claude.md); the mechanism and
the three runs are in section 17 of
[`STAGING-AND-OBSERVABILITY-RUNBOOK.md`](STAGING-AND-OBSERVABILITY-RUNBOOK.md);
every item is on [`OPEN-ITEMS.md`](OPEN-ITEMS.md) as W42–W47.

- **W43 answered.** The 00:10 cron does fire — five and a half hours late, at
  05:40:42 UTC. A heartbeat must therefore look for *a* run in a day, never for a
  run at a time, and the lag is itself why a heartbeat is needed. Still to build.
- **W44, the serious one.** Migration 047's expected-change marker absorbed all
  of W42's unrelated `quotes` drift, because `explainWith` matched children by
  prefix and by substring. A declaration about **grants** was explaining twelve
  **column** differences, by a migration that has not been applied. Fixed in
  PR #206 and confirmed by a third run — `high (14)`, `normal (10)`,
  `explained (2)`, the counts predicted before it was triggered.
- **W45 and W46**, both found by writing down *which* two rows the fixed marker
  still absorbed. The grantee allow-list in the fingerprint SQL did not include
  `anadyon_audit`, so migration 047's six grants were invisible on both sides —
  the marker in force was declaring a change the check could not see, and once
  047 is applied a revoke would disarm `pgaudit` silently. And a grant difference
  is reported against the table, so the marker absorbed `service_role` rows it
  does not cause. Both fixed, both watched failing first.
- **W47 opened**, the gap that survives all of it: the fingerprint reads no
  settings, so `pgaudit` being switched **off** stays invisible. Cannot be built
  until 047 is applied, because PGlite has no such setting either.

**The reusable finding, and it is not any of the fixes.** This mechanism was
designed with Codex, reviewed by Fable twice, and carried 29 tests before its
first real run. Four defects, found by running it three times and reading the
output carefully. Three readers and a test suite did not substitute for using it
once.

**Documents brought level with reality:** section 17 of the runbook — the
“never yet run against production” paragraph and “why the `pgaudit` migration is
still unwritten” were both stale and are replaced by what happened.

### Codex's second review: six findings, all upheld, one corrected upward

Relayed by Tasos with authorisation to fix and test. Detail in the worklog; the
mechanism is in runbook section 17 and every item is W48 on
[`OPEN-ITEMS.md`](OPEN-ITEMS.md).

- **A grant made by a role we are not a member of was invisible.** Reported as
  "PUBLIC grants are invisible"; the real rule is that both candidate
  `information_schema` views are scoped to the connected role, so the suggested
  replacement would not have fixed it — and the check connects as `postgres`,
  which on Supabase is not a superuser. A dashboard grant by `supabase_admin`
  would not have appeared. Grants now come from the table's ACL.
- **An object present on both sides was never compared.** An existing function
  flipped to `security definer` produced no finding at all. Views, functions,
  indexes and triggers now carry definitions.
- **No marker was validated on the night** — the digest, the expiry and `applied`
  bound CI and nothing else, so an applied marker could absorb somebody else's
  change forever.
- **Markers named objects, not kinds** — W44 and W46's root. `expected_kinds` is
  now required.
- **An `authenticated` grant was reported as `normal`.** Now `critical`.
- **The alert fired only on the comparison's failure**, so the check went silent
  in exactly the circumstances where it had stopped checking. E21's defect in a
  second place.

Plus two operational ones: the installer replaced the machine's whole managed
policy instead of merging it, and `OPERATOR-SETUP.md` had the two checkouts the
wrong way round — pointing, in the file whose commands get pasted without
reading, at deleting the only live checkout on the Mac.

### W42 answered, and the answer was in a migration header all along

`001_baseline.sql` **was never run against production**; production's `quotes`
was built by hand. `supabase/schema.sql` creates no `quotes` table, the root
`supabase-migration.sql` only `ALTER`s one, and
`010_close_schema_drift.sql` has said so since 15 August: *"The baseline declares
columns the live database never received."* Why 010 did not finish the job is
mechanical and is the reusable part — `ADD COLUMN IF NOT EXISTS` converges on
presence and never on shape, so every type, `not null` and index difference
survived it invisibly. Third occurrence in this project. Written up in
[`MIGRATION-REPLAY-RESULT-2026-08-30.md`](MIGRATION-REPLAY-RESULT-2026-08-30.md),
which already owned the subject — §9 for the third time this week.

The undeclared `Service role only` policy on `quotes` exists nowhere in
`supabase/` and carries Supabase's dashboard naming: **made through the
dashboard, outside every control this project has.** It blocks rather than
exposes, so it is not an incident. It is proof that what the fingerprint was
built to detect does happen.

**Waiting on Tasos:** migration 047 and its paste copy (W31); the marker in force
expires **17 October**, after which its six grant rows report `high`. Installing
the corrected Codex hooks and network deny, which Codex confirms are still absent
from the live machine and now puts ahead of everything else (E27). Reinstalling
the root-owned gate, which is one change behind `main` (W50).

---

## 3 October 2026 — Claude (implementer), with Codex and Fable as reviewers

**Last verified:** 4 October 2026 (00:20 UTC), Claude.

**The day in one line:** agent oversight was built, reviewed twice, and had its
labels corrected downward each time — and the post-event half ran against
production for the first time and found real drift.

**No Codex worklog for today**, and that is accounted for rather than missing:
Codex's contribution arrived as two review passes relayed by Tasos rather than
as work in a worktree. Both are recorded — the first in
[`agent-controls/RECONCILIATION-2026-10-03.md`](agent-controls/RECONCILIATION-2026-10-03.md),
the second in §8 of
[`agent-controls/CONSOLIDATED-2026-10-03.md`](agent-controls/CONSOLIDATED-2026-10-03.md).
Fable's round-two opinion is recorded in the same place and in the open items it
reshaped.

### What was built

- **The nightly production fingerprint** — runbook section 17. Production's
  structure compared against the migrations *replayed*, declared changes absorbed
  by `supabase/expected-changes/` markers, row counts compared night to night.
  The first control here that can see a change made in a logged-in dashboard.
- **The `PreToolUse` gate, repaired.** Six findings from Codex, four of which
  meant a control was inert while its test was green. It is now labelled an
  **advisory identifier guard** rather than a firewall, everywhere.
- **The root-owned install** — `scripts/install-managed-gate.sh` — and the
  operator checklist, [`agent-controls/OPERATOR-SETUP.md`](agent-controls/OPERATOR-SETUP.md).
- **The staging email boundary**, which was the one hole that was live rather
  than theoretical. Staging could have emailed real customers.
- **Migration 047**, pgaudit by object rather than by role. Written, replay-
  tested, marked, and **parked at Tasos's request**.

### What Tasos did, and only he could

**E28** — no production dashboard session in the agent's browser, the top item
on the list and the only one that removes the path rather than watching it.
**W34's local half** — the gate installed root-owned, then proven firing in a
real session on the Mac. **E32** — staging's mail configuration read, and
production confirmed healthy from Resend's delivery log.

### What the first production run found

No `critical` row — the first confirmation of §6 **against the live database**.
Thirteen noise rows, since suppressed. Thirteen real ones: production's `quotes`
table is looser than `001_baseline.sql` in twelve places, an index from that file
is missing, and a policy exists that no migration declares. **W42**, with the
hypothesis labelled: the baseline describes production rather than having created
it. It also **removed** work — production already holds the grants migration 046
adds, confirmed in runbook section 14.

### What was decided and written down

- **Documentation on agent oversight is frozen** until the blocking items have
  run and fired, at Fable's recommendation. Findings still enter the open items
  list and the agent worklogs, which is §11 and not a document.
- **W34 has a ceiling**: endpoint-managed settings do not reach a cloud session,
  and the official remedy needs a paid plan. The desktop app is not one surface.
- **E21's open question is settled as "cannot"** — one GitHub identity means a
  required review has nobody to come from.
- **The dedicated agent firewall stays declined**, and **W38** — production
  migrations applied by CI on merge — is documented as a proposal only, because
  §13 covers who may take an operational action.

### Insurance

**ΙΟΖ 4176 and ΙΟΕ 2356 were renewed** on 3 October, one day before they lapsed.
**Both new expiry dates are unverified** and no table was moved to a guessed one:
the Gmail connector returns attachment metadata and never the bytes. F1 item 0 is
the one line needed. The nearest known expiry is now ΙΡΜ 6966 on 8 October.

### Record-keeping, which had its own failure

[`OPEN-ITEMS.md`](OPEN-ITEMS.md) was carrying **six duplicated identifiers** —
today's additions collided with an existing block, and *both* `E21` rows were the
same subject with only one of them verified. Renumbered to E27–E32 and W33–W42,
the pair merged, and `tests/openItemsIntegrity.test.ts` now fails on a repeated
identifier or a row with no owner.

### Left open

**W31** (047 parked), **W42**, **W29**, **W37**, **W41**, **E29** (predicted
negative and now moot), the restore drill, and W34's cloud half. Five pull
requests merged: #201 through #205.

---

## 2 October 2026 — Claude (implementer) and Codex (implementer)

**Last verified:** 2 October 2026, Claude.

**Agent summaries:** [`2026-10-02-claude.md`](worklog/2026-10-02-claude.md),
[`2026-10-01-codex.md`](worklog/2026-10-01-codex.md) — Codex's 2 October entry is
theirs to write.

**The §5.3 audit's W-series is finished.** W19–W24, W26 and W27 are closed; W25's
throw is fixed and only its delivery record remains, which needs a migration.

- **W26 closed** — the AADE filing backlog is surfaced, aged and ranked by
  statutory exposure. Blueprint **§5.3a**. It found a state the audit had missed:
  `dcl_status = 'submitting'` is **unrecoverable**, because
  `claim_dcl_submission` refuses to re-claim it, so those reservations answer 409
  for ever and nothing showed them. Resubmission is deliberately not built — a
  filing abandoned on W27's timeout may have been accepted by AADE, so retrying
  can file a duplicate declaration. That rule is Tasos's under §13.
- **Codex merged #185** — AADE DCL response verification plus the published
  `SendClient` schema, Sentry's environment label and error-only integrations, and
  a proxy error boundary. Runbook and blueprint carry the dated detail. It
  unblocked W26 without my touching it.
- **Four dependency pull requests taken on** after Tasos asked. The one that
  mattered: **`next` 16.3.6 is a security release** (GHSA-vcvr-r3jv-pc5j, RCE in
  `next/og` `ImageResponse`) — and checking rather than assuming showed the
  vulnerable entry point is **not reachable** in this codebase, which neither uses
  `next/og` nor `ImageResponse`.

**Two documents were wrong and the error was the same shape both times.**
`docs/README.md` listed #150 as an open pull request four days after it closed,
and four green dependency pull requests were on no list at all. Both found by
reading the live state instead of carrying the table forward — the §9 failure
mode, caught this time by looking.

**And a trap in our own procedure, now recorded on E11.** Counting CI checks with
`get_status` reads "Vercel only" on every pull request here regardless of Actions,
because it returns legacy commit statuses and Vercel is the only thing posting
one. That is E11's signature for a lost trigger, so an agent using it would
diagnose one every time and push commits to recover from nothing. `get_check_runs`
is the call that returns Actions results.

**All five merges landed:** #185, #192, #171 and #193. #169 closed itself; #188 and #177 needed closing by hand, because they are transitive bumps and dependabot tracks the lockfile rather than `package.json`. Every pull request still open is blocked upstream — TypeScript 7's missing programmatic API, ESLint 10's removal of `context.getFilename()`, and a vitest major. **Three lessons worth keeping from the dependency pass:** dependabot cannot merge a lockfile pull request once another change touches the same regions, and regenerating with npm is the fix rather than waiting; a plain `npm install` resolves *further* than authorised within caret ranges, so the lockfile diff must be read; and a dependabot title describes the version while `npm audit` describes the risk — two bumps that looked routine were security fixes, and a third advisory had no pull request at all.

**One check was lost today and it is not an agent's to restore:** the Codex review bot did not review #192 or #193, reporting that the repository needs an environment configured. On #190 it found three real defects, one worse than it described. That is a ChatGPT-side setting for Tasos.

**Still open:** W25's SMS delivery record (needs a migration, Tasos applies it),
and **F1, which is two days out** — two cars expire 4 October, ~~nine~~ **eight**
motorbikes 11 October, and no expiry is in the database, so `rentalBar` bars
nothing.

*Figure corrected 3 October, Claude: this entry said nine motorbikes, written
before §1a was recounted against its own table later the same day. It is eight.
The entry is otherwise left as written — §11 makes it a record of what was
believed on 2 October, and the owning document holds the corrected knowledge. The
countdown is also now stale by a day and is re-dated in `OPEN-ITEMS.md` rather
than here, for the same reason.*

---

## 1 October 2026 — Claude (implementer) and Codex (implementer)

**Last verified:** 1 October 2026, Claude.

**Agent summaries:** [`2026-10-01-claude.md`](worklog/2026-10-01-claude.md),
[`2026-10-01-codex.md`](worklog/2026-10-01-codex.md).

Six of yesterday's open items closed. The §5.3 audit that opened W23–W27 was the
most productive thing on the list, which is the argument for having written it.

- **W20, W21, W22 closed** (#182, #186). Abandoned-run recovery, the repricing
  control on the Market screen, and the motorbike survey — which took four
  passes because the first three checked homepages for a currency symbol and
  concluded nobody publishes bike prices. **Rent Scooter Car Zante publishes a
  full tariff behind a nav menu**, and `lib/rentScooterZanteRates.ts` now reads
  it. Blueprint **§1.6a**.
- **W25's unhandled rejection fixed** (#184). The SMS route no longer awaits
  Twilio bare: bounded at 8s, a failure answers 502 saying the customer has not
  received it. **The delivery record is still missing** and needs a migration —
  W25 stays open for that half.
- **W23 and W24 closed** (#189), the two findings that needed no migration. A
  failed load no longer renders "No reservations found.", and every unreconciled
  deposit is now aged and ranked. Establishing that W24 needed *no* migration was
  the work: `deposit_paid_at` has existed since migration 010 and no admin screen
  referenced it — the same shape as the competitor feeds, a measurement with no
  surface.
- **W27 closed**, and the helper is the smaller half. Eleven unbounded
  server-side calls bounded through `lib/boundedFetch.ts`; the deliverable is
  `lib/boundedFetch.test.ts`, which walks the source and fails naming any future
  unbounded caller. §5.3 *stated* the rule and four files honoured it because
  nothing checked — see blueprint **§5.3a**.
- **Codex: AADE false success** (#185, open). A DCL submission reported
  `submitted` with a null reference, because the handler read HTTP status only
  and searched for `mark` where v1.1 returns `newClientDclID`. A statutory
  filing that silently did not happen. Staging acceptance also progressed —
  sandbox Stripe payment, redirected mail, and a Sentry project created;
  **event acceptance is pending, not verified.** Runbook sections dated 1 October.

**Two things were asserted by this project's own documents and turned out to be
false.** The §5.3 audit listed Resend as having no timeout; `lib/mailer.ts` has
bounded every send for weeks. And three survey passes concluded no local
competitor publishes motorbike prices; one does, in a table. Both were corrected
by reading the source and the page rather than by anyone noticing — which is the
§8 point, and the reason an audit's own list is not evidence.

**Still open and worth carrying forward:** **W26** alone of the W-series, and it
waits on #185 — Codex is fixing whether an AADE failure can be *detected*, and
the backlog view belongs on top of that. W27 added a distinction for it: a filing
that times out is *ambiguous*, not failed, and resubmitting one that may already
be lodged is worse than filing it late. That rule changes what staff must do, so
it is Tasos's under §13. **F1 remains the urgent one:** two cars expire 4 October,
nine motorbikes 11 October, and no expiry is in the database, so `rentalBar` bars
nothing.

---

## 30 September 2026 — Claude, implementer

**Last verified:** 30 September 2026, Claude.

**Agent summary:** [`2026-09-30-claude.md`](worklog/2026-09-30-claude.md).

Two closures, and both came from reading rather than building.

- **F2 closed by the §12 calendar check.** The dated item said the motorbikes
  expired 11 September with no record of renewal, and its own text still read
  *"Today is 20 September"*. Checking it against the calendar meant searching
  the broker's mailbox, where the answer had been sitting since 29 September:
  every current expiry, nine motorbikes running to 11 October. Recorded in
  `INSURANCE-COVER-AND-RESTRICTIONS.md` §1a as the broker's assertion, not as a
  certificate — it carries dates but no policy numbers, insurers or terms, so B2
  and B5 still need the PDFs.
- **W19 closed — the §5.3 dependency table audited row by row.** Blueprint
  **§5.3a**, and the table now carries a verdict per row. Five built, two partly,
  two not at all. **W23–W27** opened for the gaps; nothing was fixed inside the
  audit.

**The audit's own finding is the interesting one.** Competitor-feeds was
diagnosed on 28 September as "a rule in a table nobody re-reads". That was true
and incomplete: the table had never been read against the code at all, so nine
other rows carried the same risk silently for five weeks. One of them —
`app/api/admin/sms/route.ts` — awaits Twilio with no try/catch, so a failure is
an unhandled rejection, while the row it is asked to copy sits directly above it
in the same table. The verdict now lives in the table with an item number beside
each gap, because a principle checked once in a worklog is a principle that
scrolls away.

**And a recommendation reversed before it was acted on.** Tasos authorised the
Apify spend for a motorbike scraper; working out how to use it established that
the target it was for — Riderly — can only be scraped by presenting as a
browser, which `lib/competitorRates.ts` and `lib/podilatadikoRates.ts` both
reject in writing. Famozo needs no browser and no spend. Blueprint §1.6a.

---

## 29 September 2026 (afternoon) — Claude, implementer

**Last verified:** 29 September 2026, Claude.

**Agent summary:** [`2026-09-29-claude.md`](worklog/2026-09-29-claude.md), second
section. **Merged:** #181. **Open at close:** #182.

Three open items closed and one narrowed. What they had in common is worth
naming: each was a case where the system's behaviour was defensible in isolation
and wrong once you looked at what the operator actually did with it.

- **W21 — the repricing tool is finished.** The engine merged in the morning
  with nothing on screen able to reach it; `RepricingPanel.tsx` is the control.
  It proposes and cannot save: no `fetch` of any kind, enforced by a test.
  **Merging it approved no price** — §13 is unaffected by any of this.
- **W20 — an abandoned Apify run is now collected rather than restarted.** Both
  importers ingest in the polling `GET`, so a closed tab stranded a finished run
  and the next press paid for another. That is why Faros and CarRentals sat at
  16 August while EzCar refreshed.
- **The scooters were tasks 19–27 of 27**, so every pass left early collected
  cars and no bikes. This, not the null-`car_group` bug fixed in #178, is why
  there was nothing to map. Both were real; only one had been found.
- **W22 — surveyed, not built.** Almost nobody on Zakynthos publishes motorbike
  prices over plain HTTP. The two candidates that carry them need a browser, and
  this sandbox cannot render either page, so writing a parser would have meant
  guessing at markup. Blueprint **§1.6a** records the evidence and what unblocks
  each; **`docs/OPEN-ITEMS.md` W22** carries the remaining step.

### A defect introduced and removed the same day

The import log added that morning recorded a completed CarRentals import after
**each** of its nine searches — the partial-batch overstatement its own header
forbids. Found while fixing W20, in code written hours earlier. The interesting
part is that it passed review and a full test run: the two tests covering it
scanned the source for a `recordImportCompleted` next to an ingest, which was
true nine times over. A rule stated in a doc comment is not enforced by a test
that agrees with it loosely.

---

## 28–29 September 2026 — Claude and Codex, implementers

**Last verified:** 29 September 2026, Claude.

Two days taken together, because the work ran across midnight and the second
day's merge carried the first day's commits.

**Agent summaries:** [`2026-09-28-claude.md`](worklog/2026-09-28-claude.md),
[`2026-09-29-claude.md`](worklog/2026-09-29-claude.md),
[`2026-09-28-codex.md`](worklog/2026-09-28-codex.md).

**Merged:** #172, #173, #175, #178 (Claude); #174, #176 (Codex).

### The theme of both days: measurements that existed and were never shown

Four separate faults turned out to be the same shape — the system knew something
and no surface asked it.

- `competitor_rates.scraped_at` had recorded every import since migration 004.
  Nothing displayed it, so a comparison against August observations read exactly
  like one against this morning's. Blueprint **§5.3 had required this since
  27 August**; it was built a month later, and only because Tasos asked. **W19**
  now audits that whole table, since Wise, SMS, AADE, Storage and Supabase data
  carry rules of the same shape that nobody has checked for an implementation.
- Motorbike rates had been collected for weeks and **could never be mapped**: the
  mapping screen shows a null `car_group` as `"?"` and the save sent that back as
  `.eq("car_group", "?")`, which never matches NULL. Zero rows updated, reported
  as *"Saved — 0 observations classified"*, silent.
- Two routes read `competitor_rates` unbounded, and PostgREST caps that at 1,000
  rows **silently** — so averages, diff percentages and price ranges were computed
  over an arbitrary slice with nothing to show rows were missing.
- `lib/gmail.ts` walked the MIME tree for text only, so every insurance
  certificate the business holds was invisible to the system meant to track
  cover expiry.

### Insurance: two more insurers, found by reading the broker's mailbox

`INSURANCE-COVER-AND-RESTRICTIONS.md` **§1a**. The fleet uses **four** insurers,
not two: **ERGO** and **Triglav** (underwritten by Zavarovalnica Triglav's Greek
branch, **administered by Apeiron** — a claim goes to Apeiron, not the
underwriter) join Intersalonica and Euroins. Eight 2026 policies read from the
broker's own PDFs, one of which corroborates the hand-supplied certificate
exactly. Terms are **one month**, not the three §1 recorded. `lib/insurancePolicy.ts`
parses all four layouts.

### Decisions

- **Jev (TypeSafe AI) declined** — blueprint §10, with three conditions for
  revisiting. The blocking reason is data protection, not engineering.
- **Time anchor stated** — blueprint **§4.4a**. The code had been consistent since
  August and nothing had written it down, so the answer could only be
  reconstructed from call sites.

### Corrections worth keeping

Six, recorded in the agent summaries rather than repeated here. Two have a reusable
lesson: **search the correspondent, not the vocabulary** (a search for
*ασφάλιση* missed every broker email, all of which say **ΑΣΦΑΛΕΙΑ**), and a
**mutation test that applies no mutation reports a clean pass** — the same
vacuous-success shape as a regression test whose anchor has moved.

### Open, and dated

**ΙΟΖ 4176's insurance expires 4 October.** The date is now verified from two
independent sources and is still not in the vehicle record, so `fleetStatus`
scores it `unknown` and will not bar a rental. **F1** remains the highest-value
thing Tasos can do.

---

## 23 September 2026 — Claude, implementer

**Last verified:** 23 September 2026, Claude.

Detail in [`worklog/2026-09-23-claude.md`](worklog/2026-09-23-claude.md) and
section 14 of
[`STAGING-AND-OBSERVABILITY-RUNBOOK.md`](STAGING-AND-OBSERVABILITY-RUNBOOK.md).

**Supabase removes the automatic Data API grant on 30 October.** Verified
against Supabase's own documentation rather than the forwarded email. The
email's "nothing changes for your existing tables" is true and is also the
trap: the exposure is every database built by *replaying* the migrations — the
staging reset, `supabase db reset`, a new project, a preview branch — and this
project reaches the database only as `service_role`, because §6 revokes the
other two roles on purpose.

**Nine tables created after migration 023 never got an explicit grant** —
`vehicle_blocks`, `vehicle_change_requests` and the seven handover tables,
which is the whole of check-out and check-in. Three later tables were granted
correctly, so the convention existed and was applied unevenly.

**Neither existing check would have caught it:** `check-grants.mjs` asserts the
*deny* side only, and `check:migration-replay` stubs the Supabase roles.

Migration **046** written and handed over as **M5**, dated for 30 October.
`lib/serviceRoleGrants.test.ts` now fails naming any table created without a
grant. Convention recorded in `AGENTS.md`.

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
