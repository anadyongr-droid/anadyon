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
   liability judgement rather than an operational fact. **Bar immediately and
   let an administrator lift it** was Tasos's choice between two options put to
   him, not an agent's design call.
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

The interim position, visible in migration 038 — written this weekend,
applied to production by Tasos and verified — is that identity is
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

### 5.6 Build versus buy the counter — decided, reviewed, and the one place the two agents disagreed

Recorded here because a reviewer should not spend time re-deriving an argument
that has already been had. `docs/RENTAL-SYSTEM-BLUEPRINT.md` §1.8 carries all
three rounds in full; this is the shape of them.

**The decision (architect, 26 August):** build the counter in Anadyon; do not
replace or dual-enter. The reasoning that carried it was not cost — it was that
a bought counter which cannot exchange reservation IDs, vehicle allocation,
status and evidence is not the same product as one that can, so the $129/month
subscription was never the relevant number; the API tier is $399. Reopening is
gated on five conditions demonstrated in a trial rather than claimed.

**The review (Claude, same day):** the decision stands, with three amendments
and one correction accepted. The substantive disagreement was **amendment 1 —
the third option is missing.** The decision was framed as build-everything
against replace-everything, and §1.5 already recorded a middle class: capture-
only tools that hold no reservation, no allocation and no status, and write
photographs and a reference back. The decision's central objection — two sources
of truth "at the point where a mistake releases a vehicle or loses evidence" —
is materially weaker against a tool that owns no operational state. The review
asked for that option to be dismissed with a reason or recorded as open.

**The adjudication (architect, same day):** *"right to raise capture sourcing
and wrong to leave it open."* `AGENTS.md` asks the architect for a section that
can be built from without asking questions, and "either dismiss it or record it
as open" is the opposite of that. It resolved rather than deferred: Anadyon
remains the system of record and always ingests its own durable copy of the
original evidence, never depending on an expiring vendor URL; a capture provider
may later act as an **input adapter** only; and one bounded evaluation — two
business days, Record360 only, inside Gate 0 — must produce pricing, DPA and
retention terms, media export terms, API access terms, and proof that cars,
scooters and bicycles can carry different inspection templates. If any is
unavailable, native capture proceeds.

It also corrected two things in the review's own reasoning, and both corrections
were right. "A file and an ID" understated the adapter: it still needs vehicle
mapping, task creation, outbound reservation context, webhook authentication and
replay handling, lifecycle and status mapping, media retrieval and retention,
template version mapping, and GDPR export and deletion. And the three vendors
named in §1.5 are not interchangeable — ProovStation and Self-Inspection sell
AI-assisted damage analysis, which §8 declines, so only Record360 fits the
adapter shape.

**What is still open — and one thing that changed on 30 August.**

- **The Record360 evaluation has not been run, and it is being decoupled from
  Gate 0.** Outside review made a distinction the adjudication missed: nothing
  audit area 5 produces changes *what you ask Record360* — pricing, DPA, export
  terms, API access, template variety. Area 5 changes what you do with the
  answers. Coupling the two was therefore an unforced delay, and an expensive
  one, because every week of counter code adds sunk cost to a decision this
  document already calls "looks settled". **Run it now, in parallel with Gate 0,
  not behind it.**
- **Neither side is costed.** The adjudication declined a speculative figure and
  required Gate 0 to produce a work breakdown and a three-year
  native-build-against-capture-vendor total. That deferral is defensible; what
  is not is leaving it unowned. **A reopening gate with no number behind it
  never trips.** The estimate needs a named owner and a date, and has neither.

**Why this is worth a reviewer's attention.** The process worked — a decision
was reviewed, the review found a real gap, and the adjudication resolved it
rather than parking it. But the resolution's whole weight now rests on a
two-day evaluation nobody has done, behind a gate nobody has opened, with no
cost estimate on either side. That is a decision that *looks* settled.

### 5.7 The partner channel — the one competitive gap, deliberately deferred

`docs/RENTAL-SYSTEM-BLUEPRINT.md` §7.1. Hotel and travel-agency accounts booking
on a guest's behalf is the single capability the local competition has and this
system does not. It was promoted out of the deferred list and made **phase 4** —
behind Gate 0, the vehicle and driver gating, phase 2 and the signed agreement —
on the reasoning that more bookings into an incomplete counter increase
operational risk rather than revenue.

That is a defensible ordering and it is also the one that costs the most if it
is wrong, because it is the only item on the list that creates demand rather
than describing it. §7.1a adds a bounded build-or-buy gate on it (GoCars), which
has not been run either.

### 5.8 What is waiting on a person, not on code

**This list, not any engineering item, is the project's actual constraint.**
Every entry is cheap and none is technical, and between them they gate the
highest-value work in the document — §5.1 above all. Engineering has been
flowing around the blockage rather than through it, which is what makes a list
of merged pull requests look like progress while the thing that unlocks phase 2
stays untouched.

Listed because four of the open items above are not engineering problems and a
reviewer should not propose engineering for them:

- **The RPC diagnostics** in `docs/OPEN-QUESTION-RPC-STAFF-IDENTITY.md` §10.
  Runnable, never run. They gate §5.1, which gates phase 2.
- **AADE sandbox credentials** — `AADE_USER_ID`, `AADE_SUBSCRIPTION_KEY`,
  `COMPANY_VAT_NUMBER`, `COMPANY_BRANCH`, with `AADE_PRODUCTION` left unset. No
  filing has been sent anywhere without them.
- **The DCL XSD**, downloadable from `aade.gr`, which is blocked from the build
  container. Without it the client-list XML cannot be checked the way the
  invoice XML was.
- **Two accountant questions** — whether `11.2` (ΑΠΥ, services) is the right
  receipt type for a rental, and whether the declaration's hardcoded
  `nonIssueInvoice=true` is consistent with also filing an invoice.

### 5.9 The migration chain did not replay — found, decided, fixed in one line

The §3.1 preflight in `docs/HANDOVER-TEST-ENVIRONMENT.md` was run on 30 August
and stopped at 16 of 37: migration 017 assumes a legacy `customers.name` column
that `001_baseline.sql` never creates. The cause is that 001 uses `CREATE TABLE
IF NOT EXISTS` on tables the hand-made `supabase/schema.sql` had already made,
so in production the baseline was a no-op and the legacy column survived — which
is also why `010_close_schema_drift.sql` exists.

Decided (blueprint §10): make 017 self-sufficient with one
`ADD COLUMN IF NOT EXISTS`, rather than amending the baseline to manufacture a
history or making 017 conditional and letting staging diverge. Verified: all 37
then replay to the same final state production holds, and `customers.name` is
the only column of its class across the five shared tables.

**The part that outlives the fix:** `scripts/check-schema-drift.mjs` compares in
one direction only — columns the migrations declare that the database lacks.
This defect was the opposite, and no check in the repository would ever have
found it. So the staging exit criterion is not "the replay is green" but "the
replayed schema matches production, compared both ways", which has not been done.

**First real run against production, 30 August: it found a bug in itself.** The
reverse direction reported `reservations.quote_id` as undeclared, when
`20260821175132_link_web_booking_customers.sql` declares it plainly. The
parser's table-name pattern was a bare `(\w+)`, which matches neither half of
`public.reservations` — it saw `public`, looked for `ADD COLUMN` next, found
`.reservations`, and gave up silently. Migrations adopted schema-qualified names
when the timestamped convention started, so this was never one missed column:
**five whole tables were invisible to the drift check**, including
`vehicle_blocks`, which the availability allocator depends on, and
`vehicle_change_requests` from migration 038. The forward direction — the half
that has existed for weeks — was reporting success for tables it had never
looked at, which is precisely what `.github/workflows/ci.yml` warns about in its
own schema-drift step. Fixed — and fixing it let the check see `vehicle_blocks` for the first time,
which immediately produced three more false findings from two further gaps: only
the first `ADD COLUMN` in a multi-clause `ALTER TABLE` was read, and `RENAME
COLUMN` was not read at all, so the parser still believed in `ends_on` and had
never heard of `expected_return`. Nothing was wrong with the database or the
code in any of it.

Ten tests now cover the parser, each watched failing against the version before
it. The lesson is about the tool rather than the schema: **a checker that cries
wolf is on its way to being switched off**, so a false finding in it is as
serious as a missed one.

**And the claim that `customers.name` is the only column of its class was
a one-off, not a check** — which is exactly why this was worth building. It was established by comparing the five
shared tables by hand on 30 August. That is evidence, not a guard: it cannot
fail in CI and it will not notice the next one. Making the drift checker
bidirectional and running it against production converts a manual finding into a
repeatable one, and would catch a surviving legacy column before it costs
another round of replay debugging. Hours of work, and it should precede staging
rather than follow it.

### 5.10 One claim from this weekend that has not been observed

#64 asserts that logging **major** damage stops a vehicle being bookable. That
is verified in tests and by reading the allocator, and it has **not** been
watched happen: nobody has logged major damage on a real vehicle and then tried
to book it on the public site. It is the cheapest possible end-to-end check and
it is exactly the kind of thing §6 exists to make routine.

## 6. The new part — environments, and why this discussion happened

This is the section written this weekend, and the one §8 asks about.

### 6.1 The finding

There is no environment between a developer and the business. Concretely:

- **There is no staging database**, and preview deployments appear to carry the
  production credentials. Every instruction of the form "check it on the
  preview" issued during this month's work was therefore an instruction to check
  against live customer data. That is a correction owed to the record.

  **Verified 30 August, and it is what it looked like.** Tasos read the Vercel
  settings: `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` are all enabled for **Production and Preview**.
  So every preview deployment — every pull-request branch, including unreviewed
  and half-finished ones — carries the production service-role key, which
  bypasses row-level security by design, against the live database.

  **Closed the same day** by splitting `SUPABASE_SERVICE_ROLE_KEY` and giving
  Preview a placeholder value — though the closure is confirmed only at the
  settings level. The preview still builds (Vercel reported Ready after the
  change), but that it now serves *no data* is reasoned from migration 019's
  note that everything the site serves goes through the service role, not
  observed: the build container cannot reach `*.vercel.app`. Opening the preview
  URL settles it, and a preview still showing real data would mean the scoping
  did not take. The two `NEXT_PUBLIC_` variables were left as
  they are — neither is a credential in any useful sense, and both are blocked
  by a pre-existing type misconfiguration; see
  `docs/ACTIONS-FOR-TASOS-2026-08-30.md` §2, which also records the residual:
  previews still point at the production project, so a future anon-readable
  table would silently restore read access, with nothing watching for it.

  **A note on rotation, because this document first got it wrong.** The earlier
  version recommended rotating the key afterwards, on the reasoning that scoping
  closes the door without asking whether anyone walked through it. That
  conflates two risks. The real one was *unreviewed code running with the key* —
  a preview deployment runs whatever is on its branch, at a public URL, against
  production data — and scoping fixed exactly that. The other is *disclosure of
  the key*, which rotation addresses; but its plausible routes (Vercel dashboard
  access, build logs, a malicious dependency executing during a build) apply to
  production builds identically, so preview scoping neither widened nor narrows
  them. There is no evidence of any of them, and the key has never been in git
  or in a browser. Rotation is therefore **optional and low priority**, not the
  second half of the fix. See `docs/ACTIONS-FOR-TASOS-2026-08-30.md` §2b.
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

### 6.3 What staging actually buys

*Rewritten 30 August after outside review. The first version led with vendor
sandboxes and was wrong to — see the note at the end.*

**The case is a data-protection one, not a testing one.** The scoping in §6.1 is
confirmed, so this is a finding rather than a risk: every preview deployment — that is, every pull
request branch, including unreviewed and half-finished ones — runs with the
production service-role key against a `customers` table holding passport
numbers, driving licence numbers, dates of birth and addresses. The service role
bypasses row-level security by design. That is unreviewed code with unrestricted
write access to special-category personal data, and it is a standing exposure
rather than an inconvenience. It justifies the two days on its own, and it is
the reason to do it whether or not anything is ever tested there.

Second, and genuinely useful but secondary:

1. **A place the e2e suite can run unattended** — item 2, which has no other
   home.
2. **A place to look at an admin screen while logged in.** No admin screen
   changed this weekend has been seen by anyone.

**What is *not* an argument for staging, though the first draft of this section
said it was:** the vendor sandboxes. Exercising AADE needs credentials and any
non-production place to point them — not a staging database. One caveat found
while checking this: the XML is built **inline inside**
`app/api/admin/invoices/submit/route.ts` and `app/api/admin/aade/submit/route.ts`,
not in a module, so there is nothing for a script to import yet. Extracting the
builder is a small refactor and worth doing anyway — `lib/aadeXml.test.ts`
currently has to read route source to assert on it — after which a script can
file fixture data against the sandbox with no database at all. Stripe test mode
is the same. The DCL schema needs one human download. None of
that should wait on a staging project, and treating it as the headline reason
delayed work that could start the day the credentials arrive. That was a
confusion in this document, not a change of position.

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
reasoning that produced it, and each is close to a one-line reversal.

**Some of these are Tasos's calls, not an agent's.** "Hard bar on open major
damage" and "bar at once, an administrator lifts it" were his instructions,
chosen from options put to him; that only `major` bars — and therefore that
`moderate` changes no outcome — is the implementer's reading of them, and is the
part in question below. Where a judgement is his, a review that disagrees says
so and it goes back to him rather than being reversed.

**7.1 Only `major` damage bars a vehicle.** The reasoning was that treating a
scuffed bumper as a booking-stopper trains everybody to log damage as `minor` to
avoid the consequence. The counter-argument is that `moderate` is doing no work
at all if it never changes an outcome, and a three-level severity where only one
level has effects may as well be a boolean.

**7.2 Staff can see fleet-wide open damage — and the money is held back by a
`select` list.** ~~Offered as a judgement that might be wrong.~~ **Reviewed 30
August and found wrong. It is now a defect to fix, not a judgement to weigh.**

The visibility itself stands: staff hand over the car and need to know it is
damaged. What does not stand is the guard. The realistic failure was never "a
test misses a change" — it is someone refactoring the endpoint to `select("*")`
and updating the now-failing pin in the same commit, because a pinning test is
edited alongside the code it pins. That is the known weakness of the pattern,
and here it is the only thing between a staff session and every repair cost in
the business. Column grants cannot help: everything runs under the service role,
which bypasses them by design.

**The fix is a database view without the financial columns**, queried by the
fleet-wide endpoint, which makes the leak structurally impossible instead of
conventionally discouraged — and retires the worst of the §7.6 tests with it.
One caveat, honestly held: this project currently contains **no views at all**,
so it is a new pattern here. Reads through the Data API under the service role
should be unaffected, but that is reasoning, not a test. If it proves awkward, a
second route handler with its own narrow query is the same fix, less elegant.
An hour settles which.

**7.3 Administrator self-edits do not enter the four-eyes queue.** With exactly
one administrator, requiring a second pair of eyes on their own change
deadlocks, so the answer is *no* and stays *no*. **The naming was the confused
part, and that is now settled:** this is a staff-supervision control, not a
data-quality one, and the documents should say so rather than saying "four
eyes", which promises something it does not deliver.

**7.4 Identity in database functions is application-asserted.** §5.1. The
interim position is documented in the migration itself, which is better than
being silent, but it is a comment where a control should be.

**7.5 Observability before staging.** §6.2. A reviewer who weights "stop writing
to production from previews" above "be able to diagnose the next outage" would
order these differently, and the argument for that is not weak.

**7.6 Source-reading tests.** Several tests in `lib/` assert against the *text*
of route handlers — that a `select` names certain columns, that a `Promise.all`
contains a certain fetch. They tripped on their own comments three times before
the comment-stripping was made robust.

**Reviewed 30 August; the answer is a qualified keep.** They are good
*tripwires* — cheap, and they catch a class of drift nothing else looks at. They
are not controls, and the rule that follows is now standing: **a source-reading
test may never be the sole guard on something security-shaped.** §7.2 was
exactly that, which is why it is being replaced rather than defended.

## 8. What the reviewer was asked to comment on

*Answered 30 August. The review and what changed because of it are in §10; the
questions are kept below because the answers only make sense against them.*

1. **The ordering in §6.2.** Error tracking, then staging, then e2e in CI. Is
   the incident-based argument for putting observability first sound, or is it
   an artefact of that incident being recent?
2. **Whether §6.3's case for staging is strong enough** to spend half a day to
   two days on, given §6.5 admits it would have caught neither of this month's
   real bugs. Is the vendor-sandbox argument enough on its own?
3. **§7, all of it.** These are the decisions with the least review behind them.
4. **§5.6 — build versus buy the counter.** The one topic where the two agents
   disagreed. The exchange is in `docs/RENTAL-SYSTEM-BLUEPRINT.md` §1.8 in full.
   Was the adjudication's resolution — capture vendors admitted as input
   adapters only, behind one bounded Gate 0 evaluation — the right answer to the
   review's amendment, or did it settle the question more firmly than an
   unperformed evaluation and an absent cost estimate can support?
5. **§5.1 — the identity question.** It has been open since 28 August and blocks
   the largest remaining phase. `docs/OPEN-QUESTION-RPC-STAFF-IDENTITY.md` is
   written to be read cold and is the place to start.
6. **Anything in §3 that looks like it is load-bearing without being defended.**
   The prefix-matching authorisation in `proxy.ts` is the candidate: it is a
   deliberate design with an edge that has to be remembered at every new route
   beneath an admitted prefix, and "has to be remembered" is how this project
   has produced defects before.

## 9. Where to read further

| Question | Document |
|---|---|
| The whole architecture, in depth | `docs/RENTAL-SYSTEM-BLUEPRINT.md` (2,623 lines; §7 is the build order, §10 the revision history) |
| How to build the three environment items | `docs/HANDOVER-TEST-ENVIRONMENT.md` |
| The unresolved outage | `docs/INCIDENT-ADMIN-MIDDLEWARE-TIMEOUT.md` |
| The identity question blocking phase 2 | `docs/OPEN-QUESTION-RPC-STAFF-IDENTITY.md` |
| The open UI defect and three disproved theories | `docs/HANDOVER-ADMIN-FROZEN-PANES.md` |
| Standing security rules | `docs/HANDOFF-H1.md` §7 |
| The ten audit areas and what each did not cover | `docs/audits/` |
| How the two agents work and why the rules exist | `AGENTS.md` |

## 10. Outside review — 30 August 2026, and what changed

An outside reviewer (Fable) answered §8 from this document alone, reading none of
the further-reading files. The verdict on direction was yes, with the strongest
reason being that enforcement keeps landing at the one point that can actually
refuse — the SQL allocator, server-side pricing, the locked approval transaction
in #65 — rather than each feature inventing its own enforcement point.

**Five things changed as a result. Two of them were errors in this document.**

1. **§6.3 was confused, and is rewritten.** It led with vendor sandboxes as the
   case for staging. Vendor sandboxes are not a case for staging: AADE and
   Stripe need credentials and any non-production place to point them, which a
   local script provides. Leading with them delayed work that needs no database
   and buried the real argument — that preview deployments appear to run
   unreviewed code with the production service-role key against special-category
   personal data. That is now the argument.
2. **§6.1's central claim is marked as inferred.** Nobody has actually opened
   Vercel's environment-variable settings. It is a one-click check and it is
   load-bearing for how urgent the staging work is.
3. **§7.2 moved from "possibly wrong" to "wrong".** A source-reading test cannot
   guard the repair ledger, because the realistic failure is a refactor that
   updates the pin in the same commit. A view without the financial columns
   replaces it.
4. **§7.6 gained a standing rule** — source-reading tests are tripwires, never
   the sole guard on something security-shaped.
5. **§5.6's Record360 evaluation is decoupled from Gate 0**, on the observation
   that nothing area 5 produces changes what you ask the vendor; it changes what
   you do with the answers. And the cost estimate needs an owner and a date,
   because a reopening gate with no number never trips.

**Ordering was upheld, with a better argument than this document gave.** Error
tracking first is not a recency artefact: two hours against half a day to two
days wins on cost asymmetry alone, and it is the only item that pays off the
week it is built. Delete the outage from the record and the order is unchanged.

**§7.1, 7.3, 7.4 and 7.5 were left as decided**, with §7.3's naming corrected.

**Not adopted as stated:** the recommendation to scope production secrets to
Production in Vercel today and let previews go dark. The security property is
right and should happen immediately, but `lib/supabase.ts` builds its clients at
module scope, so *unset* variables fail the preview **build**, not just its data
access — as `.github/workflows/ci.yml` already documents. Preview-scoped
**placeholder** values give the identical security property with a preview that
still builds. Same action, one refinement.
