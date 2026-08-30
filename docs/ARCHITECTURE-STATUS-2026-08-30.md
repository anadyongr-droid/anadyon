# Architecture status — 30 August 2026

**Written for outside review.** It assumes no knowledge of the project and is
meant to be read cold, in one sitting, by someone who will disagree with parts
of it.

**Repository state:** `main` at `3927b10`. 775 unit tests passing across 79 test
files, `tsc --noEmit` clean, `eslint app lib proxy.ts` clean, production build
compiles. 19 remote branches besides `main`, all carrying unmerged work.

**What is being asked of the reviewer** is in §8. Everything before it is
context, and §7 is the part most likely to be wrong.

---

## 1. The system in one paragraph

Anadyon rents vehicles on Zakynthos: 29 of them, one operator, seasonal
business, mostly foreign customers. The software is a Next.js 16 application on
Vercel with Supabase — hosted Postgres plus its auth service and its
PostgREST-style Data API — as the only datastore. There is no separate backend;
the Next.js route handlers *are* the server. The public site takes booking
enquiries and payments; an admin area runs the business. Two AI agents build it,
swapping between an architect chair and an implementer chair, with the owner
(Tasos) deciding which chair each is in.

## 2. The shape of the thing

```
  public site ──┐
                ├─→ Next.js route handlers ──→ Supabase (Postgres + Auth + Storage)
  admin area ───┘         │
                          ├─→ Stripe        (deposits)
                          ├─→ Resend        (transactional mail)
                          ├─→ Gmail API     (inbox sync, classification)
                          ├─→ AADE / myDATA (Greek statutory e-invoicing)
                          ├─→ Telegram      (the morning briefing)
                          └─→ Twilio        (SMS, limited use)
```

Three architectural facts do more work than anything else in this document:

**Authorisation lives in one middleware file.** `proxy.ts` resolves a role from
the Supabase session's `app_metadata.role` and admits or refuses. It matches
**by prefix**, which means every route beneath an admitted prefix is admitted:
staff reaching `/api/admin/vehicles` reach everything under it. Routes that must
be narrower check at the point of use, reading the `x-anadyon-role` header that
`proxy.ts` strips from client input before setting. This is a deliberate design
with a sharp edge, and §7.2 is about the edge.

**`auth.uid()` returns NULL for everything the application does.** Every write
goes through the service-role key, under which Supabase's "who is calling"
helper is empty. So database functions cannot know who invoked them; the
application asserts an identity and the database records the assertion. This is
recorded as an open question in `docs/OPEN-QUESTION-RPC-STAFF-IDENTITY.md` and
it currently blocks the largest remaining phase of work. See §5.1.

**There is one database.** `docs/HANDOFF-H1.md` §6, verbatim: *"There is no
staging database. A real booking creates real rows."* This is the subject of
§6, and it is the newest item on this list.

## 3. What is built and working

Not a feature list — the parts that carry weight.

- **Quoting and pricing.** Seasonal rate bands, category-based, with promo codes
  and discount rules. The server's price always wins; the client's arithmetic is
  display only. Competitor rate scraping feeds a market screen.
- **Booking and payment.** Quote → conversion → deposit via Stripe. Card numbers
  are never stored. An NBG (Greek bank) payment path exists behind a gate, in an
  unmerged pull request.
- **Reservation lifecycle and the availability allocator.** The allocator is
  SQL, not TypeScript, and this is load-bearing: it is the thing that actually
  refuses to hand out a vehicle. It consults `status`, KTEO expiry, insurance
  expiry, and open rows in `vehicle_blocks`. Anything that needs to stop a
  rental must reach this function; a check that lives only in the UI renders a
  warning while the website keeps taking bookings.
- **Fleet records.** Vehicles, statutory expiries, damages with severity and
  repair cost, blocks with a reason and a human release.
- **Email.** Outbound through Resend with an audit trail; inbound synced from
  Gmail, classified, and chased by a watchdog when nothing answers for four
  hours.
- **AADE / myDATA.** Greek statutory e-invoicing. Both the invoice and
  client-list filings are written. See §5.3 for the state of "written".
- **The morning briefing.** A Telegram message at 05:00, on the single cron the
  Vercel Hobby plan allows. It is currently the operator's main window into
  whether anything is wrong.

## 4. What shipped in the last three days

Five merged pull requests (#61–#65), all on `main`. Listed because they are what
the review will be reading against, and because three of them established
patterns worth agreeing or disagreeing with.

1. **#61 — the category mapping is edit-gated.** A dropdown that silently
   rewrote competitor category mapping on change now requires pressing Edit. A
   *failed* save deliberately keeps the editing session open, because the edits
   on screen are the only copy of them.
2. **#62 — nineteen admin buttons named and enlarged.** Icon-only buttons had no
   accessible name and were below the 44px touch target (WCAG 2.5.5). A source
   scanner finds unnamed icon buttons; a second test pins the scanner itself, so
   the first cannot pass vacuously by finding nothing.
3. **#63 — open damage is visible fleet-wide.** `vehicle_damages` had a partial
   index built for exactly this query and nothing had ever run it; the only
   place an open-damage count rendered was inside one vehicle's modal. Money
   stops at the admin-only ledger — the fleet-wide endpoint's `select` list is
   the only thing holding `repair_cost` back from a staff session, so a test
   pins the column list.
4. **#64 — major damage takes a vehicle off the road.** It opens a row in
   `vehicle_blocks` rather than teaching the UI a new warning, for the reason in
   §2: the allocator is what stops a rental. Only `major` bars; `minor` and
   `moderate` are recorded and shown. Releasing a damage block is
   administrator-only, unlike every other block reason, because it is a
   liability judgement rather than an operational fact.
5. **#65 — four eyes on the fleet record.** Staff may write `status`,
   `odometer_km` and `vehicle_notes` directly; everything else becomes a change
   request an administrator approves. Approval and application are one
   transaction under a row lock, and every field's before-value is compared with
   the vehicle *now* — a mismatch refuses the whole request rather than silently
   undoing somebody's later correction.

Also merged: both AADE defect fixes (§5.3), and an instrument for the frozen
panes defect (§5.4).

Test count went 648 → 775.

## 5. What is open, and what each is blocked on

### 5.1 Staff identity in database functions — **blocks phase 2**

`docs/OPEN-QUESTION-RPC-STAFF-IDENTITY.md`. The phase-2 design calls for the
counter's handover to commit through one Postgres function, with a thin gateway
that verifies `auth.uid()` against database-held staff membership. That design
cannot work as written, because the application calls with the service role and
`auth.uid()` is therefore NULL.

The interim position, visible in migration 038, is that identity is
**application-asserted**: a `requested_by` column holds the application's claim
about who acted, with a comment saying it is to be re-derived from the session
once this is answered. That is honest but it is not a control — an application
bug or a compromised route can assert any identity it likes.

The document's §10 lists diagnostics that would settle it. They are runnable and
have not been run. **This is the single highest-value unblock in the project**,
because phase 2 (check-out / check-in) is what unlocks contracts, fuel and
mileage charges, damage evidence and the maintenance feed.

### 5.2 Audit area 5 — content and legal — **is a release gate**

`docs/RENTAL-SYSTEM-BLUEPRINT.md` §7.2. Area 5 held a blocker and is ungraded.
It determines agreement wording, what may be charged for damage/fuel/mileage,
evidence retention, and identity-document handling. The blueprint's position is
that it clears *before* the phase-2 migration is written, on the grounds that
building the columns first turns unreviewed legal assumptions into schema debt.
Area 2 (design) is also ungraded and gates deployment rather than design.

### 5.3 AADE — written, not verified against the sandbox

Four defects were found and fixed this weekend: the invoice type was `11.1`
(retail receipt for *goods*) where a rental needs `11.2` (services) or `2.1` for
B2B; the country was filed as a display name where the schema wants an ISO
3166-1 alpha-2 code, defaulting to `GR` when unresolvable — a wrong statutory
record on nearly every filing, for a business whose customers are mostly
foreign; five mandatory summary elements were missing; and a failed filing could
wedge a claim with no recovery.

The country resolver is built by **inverting the same `Intl.DisplayNames` call
the booking form writes with**, so it cannot drift from the dropdown, and it
returns `null` rather than guessing — callers refuse to file.

What is *not* done: none of it has been exercised against the AADE sandbox,
because there are no sandbox credentials and no environment to hold them. The
client-list XML has never been checked against its real schema, because
`aade.gr` is blocked from the build container. Two questions are with the
accountant: whether `11.2` is right for a rental receipt, and whether the
declaration's hardcoded `nonIssueInvoice=true` is consistent with also filing an
invoice.

### 5.4 The frozen panes defect

`docs/HANDOVER-ADMIN-FROZEN-PANES.md`. An admin table's frozen panes misbehave.
Three theories have been proposed and disproved, and all three are recorded so
they are not retried. It is narrowed, not fixed. The blueprint explicitly
forbids closing it from stylesheet rules or a hand-written reproduction: three
previous fixes were validated against reproductions that could not exhibit the
bug.

### 5.5 Unmerged work

Nineteen remote branches besides `main` carry unmerged work, including
`codex/incident-admin-middleware-timeout`, which has never had a pull request opened. Open pull
requests: #16 (gated NBG payments) and #31 (incident closure).

## 6. The new part — environments, and why this discussion happened

This is the section written this weekend, and the one §8 asks about.

### 6.1 The finding

There is no environment between a developer and the business. Concretely:

- **There is no staging database.** Every Vercel preview deployment reads and
  writes the production Supabase project. Every instruction of the form "check
  it on the preview" issued during this month's work was, in fact, an
  instruction to check it against live customer data. That is a correction owed
  to the record, not a hypothetical.
- **There is no error tracking.** Nothing in `package.json`. The only production
  signals are the 05:00 Telegram briefing and the four-hour email watchdog, and
  both report on *business* state — neither reports that a request threw.
- **The end-to-end suite is not automated.** `tests/e2e/` holds nine files
  covering quote → conversion → lifecycle → guards → operations → security →
  readiness. It is real and it works. It runs by hand, because it writes to the
  production database and therefore cannot run in CI.
- **No admin screen changed this weekend has been seen.** The build container
  has no logged-in Supabase session, so five merged pull requests touching admin
  UI were reviewed as source and tests only.

### 6.2 The decision, and the ordering argument

Three pieces of work, in this priority order. The build brief is
`docs/HANDOVER-TEST-ENVIRONMENT.md`.

**1. Error tracking (~2 hours).** First, and this is the part most likely to
surprise a reviewer expecting staging to lead.

The argument is `docs/INCIDENT-ADMIN-MIDDLEWARE-TIMEOUT.md`. On 23 August the
owner could not reach `/admin` for roughly three hours. The document is careful
— it separates verified measurement from inference and records two disproved
causes so nobody re-derives them — and its status line still reads *"UNRESOLVED.
Cause not established."* Its §6 states precisely what would have settled it: if
certain `[proxy]` log lines appear before the timeout, the stall is in
role resolution; if none appear, it is at `getUser()`. Nobody could read those
lines. The lines were emitted and lost.

So the ordering argument is not "observability is good practice". It is that a
specific outage has already happened, its cause is still unknown, the evidence
that would have identified it was produced and discarded, and two hours of work
means the recurrence is diagnosable. Staging would not have helped with that
incident at all — it was a production-only failure, and the incident document's
own "Do not" list warns against deploying a speculative middleware change while
the cause is unknown.

**2. The e2e suite into CI (~2 hours).** The payoff, and cheap, because the
suite already exists. The only real work is that `tests/e2e/setup.ts` reads
`.env.local` off disk and must fall back to `process.env`, plus a CI job pointed
at staging. It is second by value and third by sequence — it cannot run until
staging exists.

**3. The staging Supabase project (half a day, or 1–2 days).** The keystone. The
estimate splits on one question: do 37 migrations replay cleanly into an empty
database? An hour with PGlite — already a dependency, already used by several
migration tests — answers it before anything is committed to.

### 6.3 What staging actually buys, stated narrowly

The honest case is narrower than the usual one:

1. **Vendor sandboxes.** AADE, Stripe and NBG can be exercised against real
   request/response cycles instead of against a mock of what the documentation
   claims. This is the strongest argument, and §5.3 is the evidence: the AADE
   work is stuck at "written, never sent".
2. **A place the e2e suite can run unattended.**
3. **A place to look at an admin screen while logged in.**

### 6.4 The counter-argument, which is real

Staging's known failure mode is not breakage — it is drift. Somebody fixes
something by hand, nobody writes it down, and later staging passes a change that
production rejects. **A stale staging is worse than none, because it is
believed.** The mitigations in the handover are that a single command resets it
and that nothing is ever fixed by hand — a schema change reaches staging as a
migration or it does not reach staging at all.

Two further constraints that shape the design rather than the decision: seed
data must be **synthetic, never a production dump**, because the customer table
holds passport numbers, licence numbers and dates of birth of real people who
consented to renting a car, not to their documents being copied into a system
with looser access; and Vercel does not run crons on preview deployments, so the
briefing and watchdog are triggered by hand on staging.

### 6.5 The limitation, stated against interest

**Neither of the two real production defects found this month would have been
caught by any of this.** The blueprint's 28 August entry records them: a
turnaround window applied to only one end of a rental, and the Calendar drawing
a booking a day earlier than its stored date. Both were found by reading code.
Both produced plausible output, so an end-to-end suite would have exercised them
and reported success. The entry's own conclusion is the sharp part — the
existing tests *"asserted the predicate as written rather than the behaviour it
was meant to produce."* No environment fixes that.

## 7. The judgements most likely to be wrong

Offered as targets. Each is a real decision taken this weekend, with the
reasoning that produced it, and each is a one-line reversal.

**7.1 Only `major` damage bars a vehicle.** The reasoning was that treating a
scuffed bumper as a booking-stopper trains everybody to log damage as `minor` to
avoid the consequence. The counter-argument is that `moderate` is doing no work
at all if it never changes an outcome, and a three-level severity where only one
level has effects may as well be a boolean.

**7.2 Staff can see fleet-wide open damage, including on vehicles they are not
handling.** Justified because they are the ones handing over the car. The
money is held back by a `select` list, which is a single line standing between a
staff session and every repair cost in the business. A test pins it. A reviewer
may reasonably think a line of test-enforced convention is thin protection for
that, and that the right answer is a separate endpoint or a view.

**7.3 Administrator self-edits do not enter the four-eyes queue.** With exactly
one administrator, requiring a second pair of eyes on their own change
deadlocks. The recommendation was therefore *no*. The counter-argument is that
this makes the control a staff-supervision mechanism rather than a data-quality
one, and it should be described as such rather than as "four eyes".

**7.4 Identity in database functions is application-asserted.** §5.1. The
interim position is documented in the migration itself, which is better than
being silent, but it is a comment where a control should be.

**7.5 Observability before staging.** §6.2. A reviewer who weights "stop writing
to production from previews" above "be able to diagnose the next outage" would
order these differently, and the argument for that is not weak.

**7.6 Source-reading tests.** Several tests in `lib/` assert against the *text*
of route handlers — that a `select` names certain columns, that a `Promise.all`
contains a certain fetch. They catch a class of regression nothing else does
(the fleet-wide `select` becoming `select("*")`), and they tripped on their own
comments three times before the comment-stripping was made robust. Whether this
is a good pattern or a clever one is a fair question.

## 8. What the reviewer is asked to comment on

1. **The ordering in §6.2.** Error tracking, then staging, then e2e in CI. Is
   the incident-based argument for putting observability first sound, or is it
   an artefact of that incident being recent?
2. **Whether §6.3's case for staging is strong enough** to spend half a day to
   two days on, given §6.5 admits it would have caught neither of this month's
   real bugs. Is the vendor-sandbox argument enough on its own?
3. **§7, all of it.** These are the decisions with the least review behind them.
4. **§5.1 — the identity question.** It has been open since 28 August and blocks
   the largest remaining phase. `docs/OPEN-QUESTION-RPC-STAFF-IDENTITY.md` is
   written to be read cold and is the place to start.
5. **Anything in §3 that looks like it is load-bearing without being defended.**
   The prefix-matching authorisation in `proxy.ts` is the candidate: it is a
   deliberate design with an edge that has to be remembered at every new route
   beneath an admitted prefix, and "has to be remembered" is how this project
   has produced defects before.

## 9. Where to read further

| Question | Document |
|---|---|
| The whole architecture, in depth | `docs/RENTAL-SYSTEM-BLUEPRINT.md` (2,472 lines; §7 is the build order, §10 the revision history) |
| How to build the three environment items | `docs/HANDOVER-TEST-ENVIRONMENT.md` |
| The unresolved outage | `docs/INCIDENT-ADMIN-MIDDLEWARE-TIMEOUT.md` |
| The identity question blocking phase 2 | `docs/OPEN-QUESTION-RPC-STAFF-IDENTITY.md` |
| The open UI defect and three disproved theories | `docs/HANDOVER-ADMIN-FROZEN-PANES.md` |
| Standing security rules | `docs/HANDOFF-H1.md` §7 |
| The ten audit areas and what each did not cover | `docs/audits/` |
| How the two agents work and why the rules exist | `AGENTS.md` |
