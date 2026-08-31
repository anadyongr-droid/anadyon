# Gate 0 — what is actually waiting on counsel and on the accountant

**Written 30 August 2026.** Two briefs, meant to be forwarded as they stand.

Gate 0 is the one item blocking phase 2's charging half, and it has been open
since the audits were written. Nothing on this page is an engineering question.
Sources are cited so anyone can check the wording against the document that
raised it.

**Only §B4 is genuinely new.** Everything else has been recorded since 18–27
August; this page gathers it into one place, because it was spread across an
audit, three blueprint sections and a handover, which is a good way for a
blocker to sit still.

---

## Part A — for the accountant

Two questions, both small, both blocking live AADE filing. The code is written
and has never been sent anywhere.

### A1. Document type — **ANSWERED 30 August: services only.** ✅

Tasos: *"It should be only services, we don't sell any goods."*

Verified against the code: the invoice module emits **`2.1`** where a VAT number
is present and **`11.2`** otherwise, and nothing else. `11.1` survives only in
comments and test names describing the defect that was fixed — `grep` over
`app/` and `lib/` confirms it is not reachable.

**Open sub-question, and it is not about rentals.** Tasos raised the one case
where Anadyon *does* sell goods: disposing of a fleet vehicle, which he expects
needs **τιμολόγιο παγίων** (a fixed-asset invoice) and asked to have
double-checked.

Two things to say plainly:

1. **It is out of scope for anything built.** There is no vehicle-sale path in
   the system at all — the invoice module takes a reservation and files for a
   rental. Selling a vehicle is done outside this software today, so nothing
   here can file the wrong type for it.
2. **The myDATA type it needs has not been verified, and this document will not
   guess it.** `aade.gr` is unreachable from the build environment, so the
   published type list could not be consulted. The plausible reading is that a
   fixed-asset disposal is a sales invoice whose *fixed-asset* nature is carried
   by the income classification rather than by a distinct invoice type — but
   that is reasoning, not a citation, and it is exactly the kind of claim this
   project's rules say to label unverified.

**For the accountant, therefore:** if fleet disposals are ever to be filed
through this system, which myDATA invoice type and income classification apply?
Not urgent — no code depends on the answer.

### A2. The client list — **not what the question assumed, and there is a larger gap behind it**

Tasos asked *"which client is on the nonIssueInvoice list?"* — a fair reading of
how it was written, and the brief was wrong to imply a list. Corrected:

**`nonIssueInvoice` is a boolean on each entry, not a list of clients.** It sits
inside the `<client>` block of the Ψηφιακό Πελατολόγιο declaration and is
hardcoded `true` for every rental. Read literally it asserts *"no invoice was
issued for this rental"*.

**And the declaration is filed once, at the start.** `movementPurpose` is
hardcoded `1`, and `grep` finds no second filing anywhere in the codebase.

That changes the question, and probably makes the flag the smaller half of it:

- At the moment of filing, no invoice exists yet, so `true` may be **correct at
  that instant**.
- Nothing ever revisits it. Once the rental ends and the invoice module files an
  invoice, the declaration still says none was issued, and **no closing entry is
  ever sent**.

**So the two questions for the accountant are:**

1. **Is a closing or completion declaration required at the end of a rental?**
   Nothing files one. If one is required, this is a live compliance gap on every
   rental, not a flag to flip.
2. **If so, should `nonIssueInvoice` then be `false`**, and does the closing
   entry need to carry the invoice's MARK?

*Source: `app/api/admin/aade/submit/route.ts` lines 78–88.*

### A3. Retention of the accounting record — **ANSWERED 30 August.** ✅

Tasos: **five years, covering all three — invoice, agreement and payment
record.**

That matches what `lib/i18n/content/legal.ts` already publishes, so the public
promise and the accounting position agree and no versioned change to the privacy
policy is needed on this point.

It does **not** extend to identity images or damage evidence, which are a
separate clock and a legal question — see B3. Keeping those apart is the
distinction §4.2e exists to protect.

**What this unblocks:** the retention class for accounting records can be built
now. The purge job still needs B3 before it can run, because a purge that knows
one class and not the others cannot safely delete anything.

---

## Part B — for Greek/EU counsel

The 18 August pre-launch audit graded **area 5, content and legal, as a
blocker** — the only area so graded. It has not been re-graded since.

### B1. The age and eligibility contradiction

`app/terms/page.tsx` and the booking form's shared modal both say *"Minimum
driver's age is 21 years"* with no vehicle qualification. `app/faq/FaqClient.tsx`
says cars require above 21 while motorbikes and bicycles require 18. Separately,
*"above 21"* means 22+, which is not what *"minimum 21"* means.

**What is needed:** one approved age matrix by vehicle class, licence class,
years the licence has been held, and any surcharge — in *"at least"* language.
Every page, the form validation and the emails will then be generated from that
one policy rather than restated.

**Why it is a blocker:** a customer can accept terms that contradict the
eligibility shown elsewhere on the same site. That is rejected rentals,
disputes, chargebacks and unfair-commercial-practice exposure.

*Source: audit 2026-08-18, finding on age terms.*

### B2. The privacy notice understates what the system actually does

The published notice names Google Analytics and reCAPTCHA and covers everything
else with a generic paragraph. The system in fact processes or transmits
personal data through: **Supabase, Vercel, Resend, Gmail/Google APIs, Telegram,
Twilio, Stripe, Wise, Anthropic, Apify and AADE.**

The database holds identity and contact data, date of birth, address, driving
licence and passport details, emergency contacts, payment references,
communications, vehicle damage records and documents.

**What is needed:** review of a provider-specific data map, then a rewritten
notice stating the controller's full legal and trading name and company
identifiers; purposes and the Article 6 basis per data category; recipients and
processors; international transfers and their safeguards; retention by category;
data sources; the **automated AI classification of inbound customer email**,
which is currently undisclosed; statutory versus contractual necessity; rights
and the complaint route. DPAs or SCCs and data-region settings confirmed with
every processor above.

*Source: audit 2026-08-18, privacy finding.*

### B3. Retention — and one distinction that decides a schema

**Two periods are already published**, so this is validation rather than a blank
sheet: five years from the rental date for booking and contract data, twelve
months for contact requests that never became bookings. If counsel concludes
different periods are correct, that is a **versioned change to a public
document, applied to data collected under the version it replaces** — a larger
act than an internal decision, and it should be recognised as one.

**Genuinely open, because the policy does not name them:** identity images,
damage evidence, and marketing consent.

**And the question that changes what gets built:**

> A photograph of a passport is not the transaction record. The obligation is to
> have verified identity and to hold the contract. Does that license storing the
> *image* for the same period?

Under GDPR retention is purpose-driven, not time-driven — *"the tax code says
five years for the invoice"* is not a basis for holding a passport scan for five
years.

**So, concretely: does storing identity images have a lawful basis at all, or is
it sufficient to record that a licence was checked, its number and its expiry?**

If the answer is the second, phase 2 stores materially less and the system is
simpler and safer. This is the single highest-leverage question on this page.

*Source: blueprint §4.2b, §4.2e.*

### B4. Charge authority — what blocks the rest of phase 2

**This is the only item here that blocks work now in progress.**

Phase 2's counter records what staff observe: odometer, fuel in eighths,
cleanliness, photographs, damage observations. Migration 040 builds all of that.

It deliberately does **not** build `reservation_adjustments` — the table that
turns an observation into money — because what may be charged is a legal
question rather than an engineering one.

**What is needed, per charge type — fuel, mileage, damage, cleaning:**

1. **May it be charged at all**, and on what contractual basis?
2. **How must it be calculated and evidenced** for the charge to stand if
   disputed?
3. **What must the customer have been told, and when** — at booking, at
   check-out, or at check-in?
4. **Does the deposit or pre-authorisation cover it**, and what notice is owed
   before drawing on it?

Until this returns, check-in can record that a vehicle came back three eighths
down on fuel and cannot raise a charge for it.

*Source: blueprint §4.2, §7.2; migration 040.*

### B5. The rental terms are too thin for a vehicle-rental business

The audit lists what the current terms omit or under-specify:

deposit and payment timing · security deposit and card pre-authorisation · fuel
policy · excess amounts per cover · exclusions and negligence · geographic, road
and ferry restrictions · additional drivers · late return and extension ·
breakdown and accident procedure · traffic fines and admin fees · cleaning,
smoking and pets · vehicle substitution · no-show · refund timing · governing
court, ADR and consumer complaint route · condition and handover evidence ·
**e-bike and bicycle liability**.

The cancellation wording also contradicts itself: it says cancellation is *free*
while stating a deposit is due on confirmation, without explaining how that
deposit is treated.

**What is needed:** legal and insurance review, then a single **versioned**
rental policy. The system will record the exact version a customer accepted and
preserve that version and timestamp against the quote and reservation.

**Note the overlap with B4:** fuel policy, excess and condition/handover
evidence appear on both lists. Answering B4 first gives most of what B5 needs
for those clauses.

*Source: audit 2026-08-18, finding M-04.*

### B6. Cookie consent

Withdrawal must be as easy as acceptance and is currently not; the storage,
provider and duration table is inaccurate; reCAPTCHA's legal basis and data
transfer are undocumented. No non-essential request or storage may occur before
consent.

Lower urgency than B1–B5 and included so the area-5 list is complete.

*Source: audit 2026-08-18, cookie finding.*

---

## What changes here when the answers arrive

| Answer | What it unblocks |
|---|---|
| **B4** | `reservation_adjustments`, and with it phase 2's charging half |
| **B3** | the retention class on every table holding personal data, the purge job, and the Article 17 erasure path — none of which exist |
| **B1** | one age policy generated into the pages, the form and the emails |
| **B2** | the rewritten privacy notice |
| **B5** | the versioned agreement, which is phase 3 |
| ~~**A1**~~ | **answered** — services only, and the code already does that |
| **A2** | live AADE filing, and possibly a compliance gap: the client list is opened and never closed |
| ~~**A3**~~ | **answered** — five years, all three record types |

**A note on sequencing, since it is easy to lose:** B4 is the only one holding up
code being written this week. B3 is the one that most changes *what gets built*.
B1 and B2 are live compliance exposure on a site already taking bookings, and
have been since 18 August.

**And A2 moved up while being answered.** What began as a question about a
boolean turned into: the Digital Client List is opened at the start of every
rental and never closed. If a closing declaration is required, that is a live
statutory gap on every rental to date — which would put it alongside B1 and B2
rather than at the bottom of Part A.
