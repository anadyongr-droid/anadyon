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

## 5. Pricing is calculated in one place

All price calculation happens client-side in the booking form. The API formats
and emails the values it is given and never recalculates them, so there is no
second implementation to drift out of step with the first.

## 6. Customer data is not exposed by default

Tables are never granted to the anonymous role. Row-level security filters
rows, not columns, so a readable table is a readable table — the protection has
to be that the anonymous key cannot reach it at all.

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
Damage Waiver is the live example. It is sold at €12 a day against no
own-damage cover on any vehicle inspected, across two insurers — so it is
Anadyon's own promise, not an insurance product. That may be a perfectly good
commercial decision. It is not one that may be made silently, priced by
accident, or described to a customer as insurance.

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

## 11. Every working day ends with the documentation updated

*Added 2 September 2026, by Tasos: at the end of each day, each agent updates
the project documentation with all actions taken and plans made or discussed
during the day.*

Work that exists only in a chat log is work the next agent cannot use. Two
agents swap roles on this project and the handover is the document, not the
conversation — so a day that ends with the code pushed and nothing written down
has produced half of what it looked like it produced.

**The close-of-day pass, in order.** Do these before the session ends, not as an
afterthought when context is nearly gone.

1. **Update the living documents first.** The day's findings go into the
   document that owns the subject — the blueprint for decisions, the audit
   files for review results, the subject document for everything else — and the
   status section at the top of `docs/README.md` is brought level with reality.
   This is where the value is. Per §9, one document per subject that stays
   current beats a series of dated snapshots.
2. **Then append the day's entry to [`docs/WORKLOG.md`](docs/WORKLOG.md).** One
   dated section: what was done, what was decided, what was discussed but not
   decided, and what is left open. It records the day and points at the
   documents changed; it does not restate them.
3. **Commit both with the work**, so the record and the change carry the same
   date and the same reasoning.

**What must appear, because it is what goes missing.**

- **Plans discussed but not built.** An idea raised and set aside is a decision,
  and an undocumented one gets re-proposed and re-argued weeks later. Record
  what was considered and why it was not done.
- **Things that turned out to be already done.** The most expensive failure on
  this project is re-deriving settled facts (§9). When a day establishes that
  something was already handled, that belongs in the settled list, not just in
  the day's entry.
- **What was left broken or unverified.** A skipped hosted check is recorded as
  not run, never as passed (§8). A known-failing branch, a stale certificate, an
  unanswered question to a third party — all of it, by name.
- **What needs a person.** Anything on the short list in `AGENTS.md` that came
  up during the day, with the exact steps or paste-ready text.

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
