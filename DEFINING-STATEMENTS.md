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
