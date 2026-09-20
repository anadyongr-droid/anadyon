# What defines the Anadyon website and rental system

Principles the build is held to. They exist so a future change can be judged
against something stated, rather than against whoever happens to be reviewing.
Referenced by the audit report.

---

## 1. Photo quality is balanced against download speed, not sacrificed to it

The fleet is the product, and a soft or muddy vehicle photograph costs a booking
that a fast page never wins back. Source images are kept at a resolution that
still looks right on a retina screen; the saving comes from delivering them
well — AVIF first, correctly sized per breakpoint — rather than from degrading
the originals.

**In practice:** sources at ~1600px, encoded at quality 82. Every `<Image>`
declares the width it actually occupies, so a 288px card is never sent a
1600px file. Measured: 56KB AVIF against 141KB JPEG for the same photograph.

## 2. The website is user-friendly and transparent

Prices include what the customer will pay. No fee appears at the desk that was
absent from the quote. Extras are itemised, the deposit is shown as a figure
rather than a percentage to work out, and the terms are linked from the point
of decision rather than buried.

## 3. Dark mode is a supported theme, not an accident

Both themes are designed. Fixed-brand surfaces — the orange navigation band,
the white call-to-action buttons, the cookie overlay — stay deliberately
constant across themes; everything else adapts.

## 4. The public site and the rental system collect the same data

**Whatever the customer is asked for, the rental system can hold and staff can
enter — and the reverse.** A field collected on a quote that the reservation
cannot store is a dead end: the data is gathered, shown to the customer, and
then silently dropped at conversion.

Parity is about *what* is collected, not *how strictly*:

- The **public form is a gate.** It refuses an incomplete booking, because
  there is nobody to chase the missing detail afterwards.
- The **rental system is a workbench.** Staff take bookings by phone, mid-
  conversation, with a customer reading out a passport. It holds the same
  fields but allows the non-essential ones to be completed later — and names
  what is still missing rather than letting the gap go unnoticed.

The two also *behave* alike where the customer would notice: the same calendar,
the same half-hour time options, the same field labels. A reservation staff
enter should be one the customer could have made themselves.

**Minimum to save a reservation:** vehicle, dates, times, first name, surname,
email, phone, and a total that is not zero by accident.
**Deferrable:** date of birth, nationality, flight number.

## 5. One pricing implementation, run on both sides — and the server's answer wins

`lib/pricing.ts` is the only place prices are computed. The booking form calls
it so the customer sees a figure as they choose; the quote API calls **the same
functions again**, against rates read from the database, and **the server's
result is what is stored and emailed**. The client's numbers are received and
discarded — the deposit it sends is bound to `_clientDeposit` and never used.

One implementation, two callers. That is what stops the two drifting: not
calculating in a single *place at runtime*, but having a single *module* neither
side can bypass.

**The server's recalculation is a security control, not duplication.** It is
what stops a crafted request naming an expensive model alongside a cheap price,
and `lib/quoteTamperResistance.test.ts` exists to hold it there. Anyone reading
this section as licence to delete it because "pricing happens on the client"
would be removing the check, not the redundancy.

<!-- price-exempt: describes where pricing is computed, quotes no rate -->
*Rewritten 20 September 2026. This section previously said "All price
calculation happens client-side in the booking form. The API formats and emails
the values it is given and never recalculates them." That has not been true
since server-side verification was added: `app/api/quote/route.ts` computes
`serverVehicleSubtotal`, `serverTotal`, `serverDeposit` and `serverBalanceDue`
independently from the database, and `docs/HANDOFF-H1.md` §7 already recorded
that "the server's pricing always wins". The old wording survived because
nothing loaded it — it began binding on every agent only when CLAUDE.md started
importing this file, hours before this correction. Left visible because the
stale version actively invited an agent to delete a security control in the name
of following a principle.*

## 6. Customer data is not exposed by default

No table containing customer or operational data is granted to the anonymous
role. Row-level security filters rows, not columns, so a readable table is a
readable table — the protection has to be that the anonymous key cannot reach it
at all.

**Two tables are deliberately readable and hold nothing private:** `rates` and
`extras_config`, granted `select` to `anon` in migration 023. The public booking
form cannot price a rental without them and neither carries a customer record.
Everything else is revoked — `vehicles`, `vehicle_costs` and `vehicle_damages`
in migration 012, the public functions in 014, the residue in 019.

**A policy `to anon` is not a grant.** `001_baseline.sql` creates several, on
`quotes`, `reservations`, `promo_codes` and others. They are inert where the
grant was revoked: a policy decides which rows a role may see *if* it can reach
the table at all. Read one as an exposure and you will go looking for a breach
that is not there; read the absence of one as safety and you will miss a table
that was granted and never policed. **The grant is the boundary; the policy is
the filter.**

*Narrowed 20 September 2026. This section said tables are "never" granted to the
anonymous role, which the code has deliberately contradicted since migration 023
for the two pricing tables. An absolute a codebase knowingly breaks is worse
than a precise rule: an agent correcting the code toward it would revoke the
grants and break public booking.*

## 7. Build for the owned fleet; at a crossroads, take the option that keeps brokerage open

Anadyon owns every vehicle it rents, and the system is built for that. Nothing
is designed speculatively for a brokerage model that does not exist.

But where two designs are equally good for the fleet as it stands, take the one
that would survive partner vehicles. That costs nothing today and avoids a
rebuild if the business shifts.

**Concretely, at a crossroads:**

- **Sellable category over physical unit.** A customer buys "Economy Manual" and
  is *allocated* a specific car. Where logic can key on the category, prefer it
  — a partner sells categories, never registration plates.
- **Availability behind a boundary.** Own-fleet availability is *computed* from
  our reservations; partner availability would be *asserted* by someone else.
  Keep the question "is this free?" answerable through one place rather than
  inlined wherever it is asked.
- **Money as revenue and cost, not "what we charged".** As a broker the revenue
  is commission, not the rental price. Margin arithmetic that assumes the two
  are the same would silently report a partner rental as pure profit.
- **Neutral names.** `supplier` costs nothing over hardcoding Anadyon. Ownership
  assumptions baked into a column name are the expensive kind to unpick.

**What this does not license:** building commissions, partner portals,
allocation models or settlement now. The abstraction, not the feature.

**Why now:** the fleet economics being built are the instrument for deciding
whether owning vehicles is worth continuing. Run a season, read contribution per
vehicle, then choose — rather than deciding the strategy before the data exists.

## 8. Claims about the system are verified, not assumed

Schema questions are answered against the live database, DNS against live
resolvers, vendor behaviour against vendor documentation, performance against
measurement. Anything that cannot be checked is labelled unverified rather than
filled in.

## 9. Read what is already written before researching it again

The project's own documents are the starting point for any question they
already answer. Before benchmarking a competitor, proposing an architecture,
scoring a review area or planning a build order, read `docs/README.md` and
follow it to the document that covers the subject. Then **extend that document**
rather than producing a parallel one.

This is not a filing preference. On 25 August 2026 a full competitor benchmark
and build order were researched and written from scratch while
`docs/RENTAL-SYSTEM-BLUEPRINT.md` — eleven systems, a phased build order, and a
list of deliberate exclusions with their reasoning — sat committed in the repo,
unread. The new work was thinner than the document it duplicated: it missed
stop-sells, licence verification, utilisation reporting and the task-manager
view, and it proposed a build order that contradicted the one already agreed.
The search that missed it looked for `*audit*` and `*principle*` and never for a
blueprint.

Three consequences follow:

- **Search for the subject, not the filename.** Grep the docs directory for the
  vendor, the capability, the table name. A document that answers your question
  will rarely be named after it.
- **A decision already recorded stays recorded until it is argued down.** The
  deliberate exclusions in the blueprint — OTA distribution, telematics, AI
  damage detection, stored card numbers — are settled positions with stated
  reasoning. Reopening one requires engaging with that reasoning, not
  rediscovering the topic.
- **New findings are merged in, with the date and what changed.** One document
  per subject that stays current beats a series of dated snapshots that each
  restate the last. Where a genuinely new finding arrives, say what it adds and
  where it sits relative to what was already there.

The test: if the same question is asked in six months, the answer should be
found by reading, not by researching again.

## 10. What we publish and what we build follow the insurance contracts

*Added 2 September 2026, by Tasos, on reading the fleet's policies: the project
is to be driven, in both its text content and its functionality, by what the
actual insurance contracts say.*

The policies are the ground truth about what Anadyon can promise. Not the rate
card, not the competition, not what a rental site is expected to say. If a page,
a term, an email or a product implies cover that the contracts do not provide,
the page is wrong — the contract is not negotiable and the customer's
expectation was created by us.

`docs/INSURANCE-COVER-AND-RESTRICTIONS.md` is that reference, read from the
certificates themselves. It is the document to check against, and to extend when
a policy changes.

**Three rules follow.**

**Publish only what is covered.** Before writing or changing any customer-facing
statement about damage, theft, breakdown, assistance, injury or liability, check
it against that document. Where cover is absent, the wording says so plainly
rather than going quiet: a customer who discovers at the roadside that a 50cc
has no assistance, or after a fall that the damage waiver they bought was ours
to honour and not an insurer's, has been misled by omission.

**A product with no policy behind it must be labelled as what it is.** The Full
Damage Waiver is the live example. It is sold at €5.00 a day against no
own-damage cover on any vehicle inspected, across two insurers — so it is
Anadyon's own promise, not an insurance product. That may be a perfectly good
commercial decision. It is not one that may be made silently, priced by
accident, or described to a customer as insurance.

<!-- price-exempt: states the superseded €12 figure in order to correct it -->
*Price corrected 20 September 2026. The paragraph above said **€12 a day** from
2 September until today. That figure came from `supabase/seeds/staging.sql`,
whose first line reads "Synthetic staging fixtures only"; the real rate is
€5.00, verified on the live Admin → Rates screen. Five documents under `docs/`
were corrected on 19 September and this one was missed — both the manual search
and `lib/publishedPriceParity.test.ts` looked in `docs/`, and this file sits at
the repository root. The test now scans the root documents too. The error ran in
the direction that flattered us: it made the waiver look like a product carrying
2.4× more premium against the same uninsured risk than it does.*

**Cover has dates, so the system needs to know them.** These policies run one to
three months with no automatic renewal, and lapse without notice if the premium
is late. A fleet where cover expiry is tracked on paper will eventually rent an
uninsured vehicle. Expiry belongs in the vehicle record, beside the MOT and the
service interval, with the same stop-sell behaviour.

**What this does not license.** It is a rule about not over-promising, not a
mandate to reprint the policy schedules on the website. Customers need to know
what they are and are not covered for, in plain language, at the moment it
matters to them — not a translated certificate.

And the same standard as §8 applies to the contracts themselves: a certificate
says what is covered; the terms booklet says what is excluded. Where only the
certificate has been read, conclusions about exclusions are labelled unverified
rather than assumed favourable.

## 11. Every working day ends with a written summary from each agent

*Added 2 September 2026, by Tasos: at the end of each day, each agent makes a
summary of all actions taken and discussed during the day. Based on those
summaries Claude updates the overall project documentation and the open items
log. Obligatory for all agents.*

Work that exists only in a chat log is work the next agent cannot use. Two
agents swap roles on this project and the handover is the document, not the
conversation — so a day that ends with the code pushed and nothing written down
has produced half of what it looked like it produced.

**This is not optional and not conditional on the day going well.** A day that
produced nothing still produced the knowledge that an approach does not work,
and that is worth more written down than rediscovered.

### 11.1 Every agent: write your own summary

Before the session ends — not in the last exchange, when context is nearly
gone — write **`docs/worklog/YYYY-MM-DD-<agent>.md`**. Claude writes
`2026-09-02-claude.md`; Codex writes `2026-09-02-codex.md`.

**One file per agent per day, never a shared file.** Two agents work in separate
worktrees on separate branches, so both appending to one document would collide
every single day and the merge would be the first thing each morning. Separate
files never conflict, and consolidation is a deliberate step rather than an
accident of merge order.

Cover, at minimum:

- **What was done**, with the branches and PRs it landed on.
- **What was decided**, and the reasoning — not just the outcome.
- **What was discussed and not decided**, or considered and rejected. An idea
  raised and set aside is a decision, and an undocumented one gets re-proposed
  and re-argued weeks later.
- **What was found to be already done.** The most expensive failure on this
  project is re-deriving settled facts (§9). Say so explicitly so it reaches the
  settled list.
- **What is left broken, unverified or open.** A skipped hosted check is
  recorded as not run, never as passed (§8). Name the failing branch, the stale
  certificate, the unanswered question.
- **What needs a person**, with the exact steps or paste-ready text.

Also update the document that owns each subject you touched, and refresh its
`Last verified:` line. The summary records the day; the subject document holds
the knowledge, and per §9 that is where the value is.

### 11.2 Claude: consolidate, daily

Claude reads every agent summary for the day and, from them:

1. **Brings the living documents level with reality** — the blueprint for
   decisions, the audit files for review results, the subject document for
   everything else, and the status section at the top of `docs/README.md`.
2. **Writes the day's consolidated entry in [`docs/WORKLOG.md`](docs/WORKLOG.md)**,
   one dated section covering all agents. It points at what changed; it does not
   restate it.
3. **Updates [`docs/OPEN-ITEMS.md`](docs/OPEN-ITEMS.md)** — §12 — closing what
   was closed, adding what was opened, and re-dating what is still open.
4. **Commits all of it with the work**, so the record and the change carry the
   same date and the same reasoning.

Consolidation is a specific job with a named owner because a rota for it means
nobody does it. If Claude did not work that day, the agent summaries still
stand on their own and the consolidation happens on Claude's next day.

**The test is the same as §9's.** If the next agent — or the same agent in six
months with no memory of today — reads the worklog entry and the documents it
points at, they should be able to continue without asking a question that was
already answered. If they would have to reconstruct the day from a chat
transcript, the close-of-day pass did not happen.

### Why this shape, and not a daily log

The order above — living documents first, dated entry second — is deliberate,
and it follows what the industry has converged on rather than a preference.

**Documentation quality is measurable and it predicts delivery performance.**
DORA's 2021 *State of DevOps* report assessed internal documentation across
eight attributes including clarity, findability and reliability. Teams with
high-quality documentation were **2.4× more likely** to show better software
delivery and operational performance, **3.8× more likely** to implement
security practices, and **2.5× more likely** to use the cloud fully — and only
about **25%** of respondents had documentation that qualified. DORA's framing is
that documentation quality drives the implementation of every technical practice
they studied.

**The established practices are organised by subject and decision, not by
date.** Architecture Decision Records (Michael Nygard, November 2011; moved to
*Adopt* on the ThoughtWorks Technology Radar around 2018) are numbered and
immutable — a changed decision gets a new record that supersedes the old, never
an edit. GitLab's handbook-first rule is to **document the solution first, then
announce it**, so the written artifact is primary and the dated message points
at it. *Software Engineering at Google* chapter 10 keeps documentation under
source control, peer-reviewed, with named owners and freshness dates. Keep a
Changelog exists to stop the opposite habit, and says so: *"Don't let your
friends dump git logs into changelogs."*

Where the industry does keep dated records, they are **event-driven, not
calendar-driven** — changelogs fire on a release, postmortems on an incident.
Neither fires because a day ended.

So `WORKLOG.md` is the dated announcement, not the source of truth. An entry
that carries a finding no document owns has been written in the wrong place, and
a day whose findings reached only the worklog has failed §9 while appearing to
satisfy §11.

**One consequence we adopt from Google: staleness must announce itself.** A
document nobody has confirmed is still true is a document that will eventually
mislead — `docs/README.md` described the staff-identity question as open and
blocking for two days after it was closed, and that stale line alone cost a
session's work. So every document under `docs/` carries a **`Last verified:`
line with a date and the person or agent who checked it**, and confirming that a
document is still correct is part of the close-of-day pass for any subject the
day touched. Re-confirming costs a minute; the alternative has now cost days
twice.

## 12. Every working day starts by reading the open items log

*Added 2 September 2026, by Tasos: each agent needs to read the open items log
at the beginning of each day. Obligatory for all agents.*

[`docs/OPEN-ITEMS.md`](docs/OPEN-ITEMS.md) is the list of everything known to be
outstanding: unfinished work, unanswered questions, unapplied migrations,
expiring contracts, known defects, and anything waiting on a person. It is the
first thing an agent reads, before picking up a task and before deciding what
the day is for.

**Why this is a rule and not a habit.** §11 makes each day's work legible. §12
is what makes the accumulation legible. Without it, an open item survives only
as long as someone remembers it: two agents alternate, sessions end, context is
lost, and an item raised on a Tuesday quietly stops existing by Friday. The
worklog does not solve this — an item opened three weeks ago is buried three
weeks deep, and nobody reads backwards to find it.

**It is a live list, not an archive.** An item exists on it until it is done or
deliberately dropped, and dropping one is itself recorded with a reason. Claude
curates it daily as part of §11.2, but **any agent may add to it at any time**:
an item noticed mid-afternoon goes on the list when it is noticed, not at the
close of day when it may be forgotten.

**Every item carries an owner.** Agent or Tasos, named explicitly. An item with
no owner is how something sits untouched for a month while each party assumes
the other has it. Where the owner is Tasos, the item states exactly what is
needed — the steps, the paste-ready text, the question to forward — because per
`AGENTS.md` the things that come back to him are the things an agent physically
cannot do, and handing him a decision he did not need to make wastes his time.

**Items with dates are checked against the calendar.** Insurance expiring,
certificates lapsing, a policy renewal — these do not announce themselves. A
dated item that has passed is escalated, not silently carried forward.

**The test.** An agent who reads only `OPEN-ITEMS.md` and the status section of
`docs/README.md` should be able to start work knowing what matters today and
what is waiting on whom. If something important is not on that list, the list is
wrong and fixing it is the first task.

## 13. Changes to the operating model or customer relationship require Tasos's explicit approval

*Added 20 September 2026, by Tasos, after customer-facing insurance wording was
prepared for merge without first being discussed with him.*

An agent may investigate a problem, document the evidence, identify risk, and
draft a proposed solution. It may not merge or deploy a change that alters how
Anadyon operates or what it tells, promises, charges, requires, permits, or
withholds from a customer until **Tasos has explicitly approved that specific
change**.

This includes, without limitation:

- prices, deposits, fees, discounts, refunds and payment deadlines;
- insurance, waivers, exclusions, liability and roadside-assistance wording;
- age, licence, eligibility, cancellation and booking rules;
- customer emails, contractual wording, disclosures and service promises;
- the steps staff or customers must follow, and changes to who may take an
  operational action; and
- new products, removed products, sales channels or material changes to the
  booking, handover, payment or support model.

General authority to continue working, merge green pull requests, deploy, fix
bugs, or maintain the system **does not count as approval** for one of these
changes. Approval must identify the proposal closely enough that there is no
reasonable doubt what customer or operational effect Tasos accepted. Silence,
an open item, an audit finding, policy evidence, or agreement that a problem
exists is not approval of a particular remedy or wording.

Agents may still make changes that preserve the agreed model — for example a
security fix, build repair, formatting correction, regression test, or faithful
implementation of wording already approved — provided the change does not
quietly alter customer outcomes or staff authority. If there is doubt, the
change stays in a draft or unmerged branch and is presented to Tasos with its
before/after effect.

**The test:** could a customer receive different terms, price, cover,
expectation, communication or treatment, or could staff be required or allowed
to operate differently? If yes, obtain Tasos's explicit approval before merge
or deployment.
