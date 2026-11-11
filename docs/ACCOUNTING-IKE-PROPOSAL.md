# Accounting for a Greek Ι.Κ.Ε. — what the system must do, and what it must not try to do

**Status: PROPOSAL. Nothing here is built, merged or deployed.** Written for
independent evaluation by Fable and Codex before any code is written.

**Last verified:** 11 November 2026, Claude.

**AMENDED 11 November 2026, the same day**, after Tasos read the first version: *"adapt it to include a proposal for a basic build on monitoring the basics like expenses, salaries paid, rental income, cash received, cash flow projection, bank accounts and credit card payment systems reconciliation"*. That is **§5B** — written as a second *track*, not an addition to the first, and §5B.0 says why that distinction carries weight. The original request:

**Requested by Tasos, 11 November 2026:** *"find out how we could enhance our
current Anadyon application so that it is able to handle the accounting
requirements of a Greek I.K.E. Limited company"*, as a proposal to share with
Fable and Codex for evaluation.

---

## 0. How to read this, and the one thing to read first

**This is not a greenfield question.** A myDATA invoice module and a Digital
Client List module already exist in this repository, have been audited twice,
and carry two open questions for the accountant. Per
`DEFINING-STATEMENTS.md` §9, the first job was to read that rather than
research it again — and it changed the answer substantially. The honest summary
of the current state is:

> **The filing code is written, never transmitted, and I now believe it would
> be rejected or non-compliant on several grounds beyond the ones already
> recorded.**

So the question is not *"how do we add accounting?"*. It is four questions:

1. **What does an Ι.Κ.Ε. actually owe**, in 2026, after a year of Greek
   regulatory change that this repository's documents predate?
2. **Which of those obligations belong in this system at all**, and which
   belong in the accountant's software? This is the central architectural
   decision and §2 argues it is currently being got wrong by implication.
3. **What is defective in what already exists?** §4 lists ten findings, eight
   of them in code, each traced to a file and line.
4. **What does Tasos need in order to run the business**, as against what the
   state needs in order to assess it? §5B. Different numbers, on a different
   basis, and the accountant's software answers only the second.

**The deliverable I am proposing is deliberately smaller than the question.**
Per §7 of `DEFINING-STATEMENTS.md` the instinct here should be suspicion of
scope: an accounting system is a famous way to spend a winter and arrive at
something an accountant will not use.

---

## 1. What an Ι.Κ.Ε. owes — the legal frame

### 1.1 Double-entry books, from day one, with no turnover threshold

**This is the single most important fact and it decides the architecture.** An
Ι.Κ.Ε. is a capital company (κεφαλαιουχική εταιρεία) under Greek Accounting
Standards (Ν. 4308/2014, ΕΛΠ) and keeps **double-entry books (διπλογραφικά,
formerly "Γ΄ κατηγορίας") compulsorily and irrespective of turnover, from its
first day of operation**. The €1.5m threshold that lets an Ο.Ε. or Ε.Ε. stay on
single-entry books **does not apply to an Ι.Κ.Ε. at all**.

Double-entry means a general ledger on the standardised ΕΛΠ chart of accounts
(nine groups), a trial balance, and statutory financial statements — not a
revenue-and-expense list.

**The consequence, stated plainly: this application is not going to be
Anadyon's general ledger, and should not try to be.** §2 develops that.

### 1.2 myDATA — transmission of every document

Every issued document's data must reach ΑΑΔΕ's myDATA platform. This is
independent of invoice *format* obligations and applies to retail receipts as
much as to business invoices. The repository already implements this path
directly against the myDATA REST API.

### 1.3 Mandatory B2B e-invoicing — and this is new since the repo's documents

Greece obtained an EU derogation from Articles 218 and 232 of the VAT Directive
(Council Implementing Decision **(EU) 2025/502**, 5 March 2025) allowing it to
require structured electronic invoices for domestic B2B without the recipient's
consent. National law **5222/2025** implements it in phases:

| Phase | Who | Reported start |
|---|---|---|
| 1 | 2023 revenue above €1,000,000 | **2 March 2026**, penalties from 3 May 2026 |
| 2 | **everyone else — this is Anadyon** | **disputed:** 1 October 2026 in earlier sources; **2 November 2026** in later ones (Α.1128/2025 as deferred by Α.1197/2026), with an adjustment period to **31 January 2027** |

**Two things follow, and the second is the one that matters.**

**(a) The dates are not settled and I could not settle them.** `aade.gr`,
`gsis.gr` and EUR-Lex all refuse requests from this container (HTTP 403, and an
empty 202 from EUR-Lex), so **no primary source was obtained** — every date
above is from secondary commentary, and the commentary conflicts. Per §8 this
is recorded as **unverified**. *Nothing should be built to a date taken from a
vendor blog.* **The accountant is the source for these dates**, and asking is
cheaper than being wrong by a quarter.

**(b) B2C is exempt from the e-invoice format obligation, and that splits the
system into two paths.** Retail sales to private individuals are *"εξαιρείται
από την υποχρέωση ηλεκτρονικού τιμολογίου, όχι από τη διαβίβαση στο myDATA"* —
exempt from the electronic-invoice obligation, **not** from myDATA transmission.

**For Anadyon this is the decisive distinction, because its customers are
overwhelmingly private tourists:**

- **B2C (`11.2`, the large majority of rentals)** — myDATA transmission only.
  **The existing direct-to-myDATA design stays viable.** No provider, no fee.
- **B2B (`2.1`, a small minority)** — structured e-invoice through an
  **accredited provider** (πάροχος ηλεκτρονικής τιμολόγησης) or ΑΑΔΕ's free
  `timologio`, in the European standard **EN 16931** over Peppol.

So the mandate does **not** oblige Anadyon to re-platform its invoicing. It
obliges a second, narrow path for business customers. §5 proposes the cheapest
compliant shape for that, and it is not "build a Peppol access point".

### 1.4 Ψηφιακό Πελατολόγιο Οχημάτων — mandatory since 1 July 2025

The vehicles Digital Client List, under decision **Α.1057/2025**, became
**compulsory on 1 July 2025** after a voluntary period to 30 June 2025. Rental
businesses are in scope; **leasing companies are excluded**, as are
self-service operations that issue the document immediately on completion.

**The obligation is described as recording, in real time, the vehicle's entry,
its exit, and the provision of the service, before the document is issued.**

That bears directly on open question **A2** in `GATE-0-QUESTIONS.md`, which
asks whether a closing declaration is required. The description of the
obligation strongly suggests **yes** — and this system files only an opening
entry. §4 records it as finding **F6**.

### 1.5 VAT — and one piece of genuinely good news

Short-term hire of a means of transport (**30 days or fewer**) is taxed, under
**Article 56** of the VAT Directive, **where the vehicle is actually put at the
customer's disposal**. Every Anadyon rental is handed over in Zakynthos.

**Therefore Greek VAT applies to every rental, whatever the customer's country
or VAT status, and there is no reverse charge for an EU business customer.** An
EU business recovers the Greek VAT through the refund procedure, not by
self-accounting.

**This validates a choice already in the code** and is worth writing down
precisely because it looks wrong to a competent implementer: `lib/aadeXml.ts`
charges VAT on a `2.1` invoice even when a counterpart VAT number is present.
**That is correct.** An implementer who "fixes" it by adding reverse-charge
treatment for EU VAT numbers would be introducing a tax error. Long-term hire
above 30 days follows a different rule and Anadyon does not do it today.

### 1.6 Retention — already answered

**Five years** for invoice, agreement and payment record — answered by Tasos on
30 August 2026 (`GATE-0-QUESTIONS.md` A3) and consistent with what
`lib/i18n/content/legal.ts` publishes. Identity images and damage evidence are
a separate clock and a separate question (B3). Not reopened here.

### 1.7 Obligations I am flagging rather than specifying

Named so they are not discovered late, each **unverified** and each needing the
accountant:

- **Corporate income tax, Ε3 and Ν returns, prepayment, dividend withholding.**
  Entirely the accountant's software. No system work implied.
- **Payroll** — ΕΡΓΑΝΗ and ΕΦΚΑ, if staff are employed. Out of scope here;
  named because a rental office in season has staff.
- **IRIS payments.** One secondary source reports an obligation for traders
  above €50,000 turnover from 1 July 2026. If that is right it reaches
  Anadyon's payment handling. **Verify.**
- **POS–cash register interconnection / ΦΗΜ.** Whether a rental issuing `11.2`
  needs a fiscal mechanism, or whether myDATA transmission via software
  suffices, I could not establish. The sources say a ΦΗΜ is *one route among
  several*. **This is a question for the accountant, and it is not academic:**
  if a ΦΗΜ is required, the desk needs hardware.
- **Ψηφιακό Δελτίο Αποστολής** (digital delivery note), phase B reportedly
  12 October 2026. **Probably out of scope** — it governs movement of goods and
  a rental moves no goods — but it should be confirmed, not assumed.

---

## 2. The architectural decision this proposal turns on

**Recommendation: the application is a subsidiary ledger and a source system.
It is not the general ledger, and building one would be the expensive mistake.**

Because §1.1 requires double-entry books on the ΕΛΠ chart of accounts, there
are only two coherent designs:

**Design A — the application becomes the accounting system.** A chart of
accounts, journals, a trial balance, statutory financial statements, and
whatever the accountant needs to file Ε3 and Ν. This is several months of work,
it must then be *maintained against annual tax change for as long as Anadyon
exists*, and at the end of it the accountant very probably still keeps their own
books, because their software is what their practice, their filings and their
professional liability run on.

**Design B — the application owns the operational truth and hands it over
cleanly.** It issues and files the statutory documents it is the system of
record for (rental invoices, the client list), records money received against
them, and produces a reconciled, auditable export the accountant posts. The
general ledger stays where it is.

**Design B, and the argument is not mainly about effort.** It is about who bears
the consequence of an error. An invoice this system files wrongly is Anadyon's
compliance problem whoever posts it; a trial balance this system computes wrongly
is a problem the accountant would have caught in software built for it. Keep the
responsibility where the expertise and the liability already sit.

**This also follows the project's own §7.** The instruction there is to prefer,
at a crossroads, the option that does not foreclose a different future — and a
clean subsidiary-ledger boundary with a defined export is exactly that. If
Anadyon later wants in-house books, Design B is the foundation for it. Design A
is not a foundation for anything; it *is* the thing.

**What Design B commits us to, and it is not trivial:** the export has to be
*right*, which means the invoice, the payment and the filing all have to be
first-class records with a durable audit trail. §4 shows that none of them is
today. **That is the actual work, and it is also the work that has to happen
under either design** — which is the strongest argument for doing it first and
deciding about a ledger afterwards, if ever.

### 2.1 What that makes in and out of scope

| In scope for this system | Out of scope — accountant's software |
|---|---|
| Issuing rental documents (`11.2`, `2.1`) and transmitting to myDATA | General ledger, chart of accounts, journals |
| Credit notes and cancellations for documents it issued | Trial balance, statutory financial statements |
| Gapless statutory numbering per series | Ε3, Ν, VAT returns, prepayment |
| Ψηφιακό Πελατολόγιο, opening **and** closing | Payroll, ΕΡΓΑΝΗ, ΕΦΚΑ |
| Money received, per document, per method | Corporate tax computation, dividends |
| Fleet cost capture already built (`vehicle_costs`) | Depreciation schedules, fixed-asset register |
| **Non-vehicle expenses, incl. salary *payments*** (§5B.3, §5B.4) | **Payroll computation, ΕΦΚΑ, ΕΡΓΑΝΗ** |
| **Bank and card reconciliation** (§5B.5, §5B.6) | Statutory bank confirmations, audit |
| **Cash-flow projection** (§5B.7) | Accrual accounts, statutory VAT computation |
| A reconciled periodic export | Vehicle disposal invoices (not in this system — A1) |

**Note the asymmetry deliberately.** Everything on the left is something only
this system knows. Everything on the right is something the accountant's
software does better, and in most cases is legally required to do.

---

## 3. What exists today — read this before proposing anything

Verified by reading the code on 11 November 2026, not from the documents.

**Built and reviewed:**

- `lib/aadeXml.ts` (154 lines) — `buildInvoiceXml` and `buildDclXml`.
- `app/api/admin/invoices/submit/route.ts` (129 lines) — myDATA submission,
  with an atomic claim (`claim_invoice_submission`), bounded fetch, and a
  genuinely careful comment explaining why the response body is read inside the
  recovery block. **This is good work and the review history shows it.**
- `app/api/admin/aade/submit/route.ts` (117 lines) — the client-list filing.
- `app/api/admin/aade/backlog/route.ts` — a backlog view for failed filings.
- `lib/aadeCountry.ts` — demonym-to-ISO country mapping, from a real defect.
- Tests: `aadeXml.test.ts`, `aadeFilings.test.ts`, `aadeCountry.test.ts`.

**Never done:** *nothing has ever been transmitted to ΑΑΔΕ, in sandbox or
production.* There are no credentials, and §5.3 of the architecture status
records this. **A module that has never run is written, not built** — the
blueprint's own phrase, from the 30 August audit.

**The data model is the gap.** Of 48 migrations and 30 tables there is **no
`invoices` table, no `payments` table and no `filings` table.** Invoice state is
six columns on `reservations`: `invoice_status`, `invoice_mark`, `invoice_uid`,
`invoice_auth`, `invoice_series`, `invoice_aa`. Payment state is
`stripe_payment_intent` and `deposit_paid_at`.

**So the model permits exactly one invoice per reservation and one payment per
reservation.** §4 shows why that is not enough for a rental.

---

## 4. Findings in what already exists

**Eleven findings** — ten from the statutory review and **F11**, found while writing §5B.6 and then verified. **Confidence is stated on each**, and the two already in the
project record are marked so credit is not taken twice. Reviewers: F1 is the
one I would most like a second opinion on, and F6 is the one with the largest
exposure.

### F1 — Invoice numbering can issue the same number twice. **High confidence.**

`supabase/migrations/001_baseline.sql:413` —

```sql
PERFORM id FROM reservations WHERE invoice_series = p_series FOR UPDATE;
SELECT COALESCE(MAX(invoice_aa), 0) + 1 INTO v_next
  FROM reservations WHERE invoice_series = p_series AND invoice_mark IS NOT NULL;
```

**Three distinct faults, and the first alone is sufficient.**

**(a) The lock is released before the number is recorded.** `next_invoice_aa` is
called as a standalone `rpc()` (`route.ts:54`), so it is its own transaction and
**commits on return** — releasing every row lock. The number is only written to
`reservations` *after* the HTTP round-trip to ΑΑΔΕ
(`route.ts:117-125`), seconds later. Two submissions overlapping in that window
both receive the same `aa`. The lock serialises nothing that matters.

**(b) On the first invoice of a series the lock matches no rows at all.** With no
existing row carrying `p_series`, `FOR UPDATE` locks the empty set, so there is
not even nominal serialisation. *This is the project's own documented failure
mode*: a predicate that cannot exhibit the condition it is supposed to guard —
the lesson from `HANDOVER-ADMIN-FROZEN-PANES.md`.

**(c) `MAX()` over a table the retention purge deletes from.** Numbering is
derived from surviving `reservations` rows. The §4.2b purge deletes reservations
at five years. When it runs, `MAX(invoice_aa)` **drops**, and the next invoice
reuses numbers already filed. Two compliance mechanisms, each sound alone,
destroying each other.

**Also:** the `invoice_mark IS NOT NULL` filter means a filing accepted by ΑΑΔΕ
whose final `UPDATE` failed leaves its number looking unused — so it is handed
out again, and ΑΑΔΕ receives two documents with one number.

**Why it matters legally:** ΕΛΠ requires unique, sequential numbering per
series. This is not a tidiness defect.

**And nothing would catch it:** `grep` finds **no test anywhere** that exercises
`next_invoice_aa`. The sequence generator for a statutory document number is
entirely untested.

### F2 — The invoice carries no income classification. **High confidence it is required; not verified against the current XSD.**

`lib/aadeXml.ts:131-141` emits `invoiceDetails` with `lineNumber`, `netValue`,
`vatCategory`, `vatAmount` and **no `incomeClassification`**, and the summary
carries none either. myDATA classifies income by `classificationType` (an `E3_*`
code) and `classificationCategory`; provider documentation describes dedicated
per-line error codes for classification faults (101 enumeration, 313
type/category not permitted), which only exist because the element is expected.

I could **not** confirm against ΑΑΔΕ's current XSD whether it is
schema-mandatory or business-rule-mandatory, and the distinction decides whether
a filing fails validation or fails a rule. **Either way it fails.**

**The likely values need the accountant, not a developer:** probably
`category1_3` (income from services) with an `E3_561_*` code, but *which* code
depends on whether the counterpart is a business or a consumer, and I found no
source tying a specific code to vehicle rental. **Do not guess this.**

### F3 — The issue date is the pickup date. **High confidence.**

`lib/aadeXml.ts:134`: `<issueDate>${res.pickup_date}</issueDate>`. The issue
date of a document is the date it is issued. For a rental invoiced at
check-out, or re-filed after a failure, or issued for a booking that was moved,
`pickup_date` is simply a different date — and it drives the VAT period the
document falls in.

### F4 — One invoice per reservation cannot express a rental. **High confidence; design, not a bug.**

A rental generates money at up to three moments: **deposit** at booking,
**balance** at handover, and **extras at return** — fuel, mileage, late return,
damage. The blueprint's phase 2 is built around exactly those. Six columns on
`reservations` permit **one** document, so there is no way to issue a deposit
document and a final document, and **no way at all to issue a credit note or
cancel a filed invoice** — which is what a refund requires. §2188 of the
blueprint already records that refunds' VAT treatment is a Gate-0 decision; the
*data model* cannot express the answer whatever it turns out to be.

### F5 — There is no payment ledger. **High confidence.**

`stripe_payment_intent` and `deposit_paid_at` describe a single online deposit.
A rental desk also takes **cash and card in person**, refunds deposits, and
charges extras after the fact. Accounting needs each receipt with its date,
amount, method and the document it settles — that is what makes a VAT return
and a bank reconciliation possible. One `text` column cannot carry it, and cash
is not represented at all.

### F6 — The client list files an opening entry and never a closing one. **Largest exposure. Already in the record as question A2; the legal half is new.**

`app/api/admin/aade/submit/route.ts:78-88` hardcodes `nonIssueInvoice` **true**
and `movementPurpose` **1**, and `grep` finds no second filing anywhere.
`GATE-0-QUESTIONS.md` A2 asks whether a closing declaration is required and
leaves it open.

**§1.4 is the new part: the obligation has been compulsory since 1 July 2025
under Α.1057/2025, and is described as recording the vehicle's entry, its exit
and the provision of the service, before the document is issued.** That reads as
requiring the exit entry this system never sends.

**If that reading is right, this is a live, repeating compliance gap on every
rental since July 2025, not a flag to flip** — and it has been open in the
record since 30 August. I am **not** asserting the reading is right: it comes
from vendor summaries, and the decision text was not obtainable. **It is the
first question for the accountant and it should not wait for this proposal.**

**Separately:** the module's namespace is `http://www.aade.gr/myDATA/dcrnew/v1.0`
and predates Α.1057/2025. Whether that decision changed the schema or endpoint
is **unverified** and worth checking before anything is filed.

### F7 — VAT is a hardcoded constant. **Medium confidence it matters.**

`lib/aadeXml.ts:83`: `const VAT_RATE = 0.24`, with `vatCategory` fixed at `1`.
24% is right for Zakynthos today and the arithmetic is the correct
VAT-inclusive back-calculation. But the rate is Parliament's to change, it is
duplicated from whatever `lib/pricing.ts` assumes, and a rate change would need
edits in two places with no test tying them together. **Not urgent; cheap now,
annoying later.** Note that §5 of `DEFINING-STATEMENTS.md` makes single-sourcing
pricing a principle, and a VAT rate is a pricing input.

### F8 — The "schema check" is a hand-transcription, not a validation. **High confidence.**

`lib/aadeXml.test.ts:24` — *"InvoiceSummaryType, in schema order. All eight are
minOccurs=1"* — encodes a human reading of `InvoicesDoc-v1.0.10.xsd`. **The XSD
is not in the repository** (`find -name "*.xsd"` returns nothing), so nothing
validates against the real schema. The test asserts what someone believed the
schema said in August 2026.

This is a better test than none — it caught five missing mandatory elements. But
it cannot detect a transcription error, and it cannot notice that **the declared
version `v1.0.10` may no longer be current**, which I could not establish.
**Vendoring the XSD and validating against it is a small change that converts a
belief into a check.**

### F9 — The code states a deadline that has reportedly moved. **High confidence.**

`app/api/admin/invoices/submit/route.ts:12`: *"Mandatory from 1 October 2026
(Phase B — all businesses)"*. Per §1.3 the later sources put Phase 2 at
2 November 2026 with adjustment to 31 January 2027. It also conflates **myDATA
transmission** with the **e-invoicing mandate**, which are different obligations
with different scopes — the distinction in §1.3(b) that keeps Anadyon's B2C path
on its current design. A date in a comment is where a stale fact hides.

### F10 — The B2B path will need an accredited provider, and does not have one. **Medium-high confidence, dates unverified.**

The `2.1` branch of `buildInvoiceXml` serves business customers, and §1.3 puts
those invoices inside the e-invoicing mandate on a timetable that may already
have started. Direct myDATA transmission satisfies *reporting*; it does not
produce an EN 16931 invoice through a πάροχος. **B2C is unaffected** — which is
why this is a bounded problem and not a rebuild.

### F11 — Card fees and payouts are recorded nowhere, so revenue is overstated. **Verified, 11 November.**

Found while writing §5B.6 and then checked rather than assumed. `grep` for
`application_fee`, `balance_transaction`, `payout` and `fee` across
`app/api/stripe-webhook/route.ts`, both `app/api/admin/stripe/*/route.ts` and
`lib/stripe.ts` returns **nothing**. The webhook persists the deposit against
the reservation and writes to `alert_outbox`; no fee, no payout, no balance
transaction is captured anywhere.

**Two live consequences.**

1. **Revenue is overstated** by the card fees, which are a genuine cost of sale
   and currently invisible.
2. **A bank deposit can never be tied to a booking.** Stripe pays out *net of
   fees*, on a delay, **batching many charges into one transfer** — so the
   amount arriving in the bank matches no single reservation, and *"did we
   receive the money for this rental?"* is unanswerable from this system.

**Not a filing or statutory defect** — it files nothing and breaks no rule, which
is why it is last in this list. But it is the one finding here that is silently
wrong about money **today**, rather than wrong about a document that has never
been transmitted. §5B.6 proposes `payouts` as the fix, and the Stripe Balance
Transactions API is the only possible source, since nobody can key this in.

---

## 5. Track A — the statutory proposal

**There are two tracks.** Track A, this section, is what the **state** requires. **Track B (§5B) is what Tasos requires to run the business.** They share one foundation — Stage 1's money records — and that shared dependency is the strongest reason Stage 1 is worth doing whatever is decided about everything else.

Five stages, **in dependency order**, each independently useful and each
stopping somewhere defensible. The sequencing principle: **nothing that files
to ΑΑΔΕ is touched until the thing it files is correctly modelled**, because the
current module's history is of a filing path built on a model that could not
carry the filing.

**Stage 0 is not engineering and it gates everything.** It is §6.

### Stage 1 — The accounting data model *(largest change; everything depends on it)*

Three new tables, replacing the six columns on `reservations`.

**`invoices`** — one row per issued document, not per reservation. Carries
`series`, `aa`, `invoice_type` (`11.2`/`2.1`/`5.1`/`5.2`), `issue_date` (its
own, per F3), net/VAT/gross, the income classification (per F2), the myDATA
`mark`/`uid`/`authentication_code`, lifecycle status, and
`replaces_invoice_id` for credit notes and cancellations. Multiple rows per
reservation; a reservation is a *reference*, not the parent (per F4).

**`invoice_sequences`** — one row per series, holding `last_aa`, incremented by
`UPDATE ... RETURNING` under the row's own lock inside the **same transaction**
that inserts the `invoices` row. This fixes all three faults in F1 at once: the
lock is held until the number is durable, it works on the first invoice because
the row exists before any invoice does, and it does not derive from a purgeable
table. **A number is allocated before transmission and never reused** — a
rejected filing leaves a *cancelled* invoice row, not a recycled number. Gaps
are legal; duplicates are not.

**`payments`** — one row per receipt or refund: `invoice_id`, `amount`,
`method` (`cash`/`card`/`stripe`/`transfer`), `received_at`, staff attribution,
and the Stripe reference where there is one. Cash becomes representable (F5).

**Migrations are written and handed to Tasos, never applied** — and each must
`GRANT` to `service_role` in the same migration, per the 30 October 2026
platform change and `lib/serviceRoleGrants.test.ts`.

### Stage 2 — Correct the existing filing modules

With the model in place, F2, F3, F7, F8 and F9 become small, local changes:
income classification from the `invoices` row; a real `issue_date`; the VAT rate
single-sourced from `lib/pricing.ts`; the XSD vendored and **actually
validated** against; the stale comment deleted.

**Then exercise it against the ΑΑΔΕ sandbox.** This is the step that has never
happened, and until it does, "correct" remains a belief. It needs the staging
environment and sandbox credentials — see §6.

### Stage 3 — Close the client-list gap (F6)

**Subject to the accountant's answer**, which may make this urgent and may make
it unnecessary. If a closing declaration is required: a second filing at
check-in completion carrying the exit, with `nonIssueInvoice` set correctly once
an invoice exists, and the invoice `mark` if the closing entry must reference it.

**It belongs after Stage 1** because the closing entry has to reference a real
invoice record, and before Stage 4 because it may be a live breach.

### Stage 4 — Credit notes and cancellations

`5.1`/`5.2` credit notes and myDATA cancellation, so a refund has a lawful
document. **Needs the Gate-0 VAT-treatment answer** (blueprint §2188) *and*,
because it changes what a customer receives, **Tasos's explicit §13 approval of
the specific wording and behaviour**. Buildable as an unmerged branch
beforehand.

### Stage 5 — The accountant's export

The point of Design B. A per-period export — documents issued, money received,
by VAT rate and classification, reconciling to the myDATA marks — in whatever
format the accountant's software ingests. **Specified by asking them, not by
guessing**, which is why it is last and also why §6 asks the question now.

**Fleet costs are already captured** in `vehicle_costs`, so expenses have a
source; whether they flow into the export or stay with the accountant's
purchase-invoice processing is their call.

### Deliberately excluded from Track A

Two of these are picked up by Track B, and that is said here explicitly: an
exclusion which silently reverses two sections later is worse than none.

- **A general ledger, chart of accounts, trial balance or financial
  statements.** §2.
- **Depreciation and a fixed-asset register.** The accountant's. Note the
  tension with blueprint §7's fleet-economics goal — *management* contribution
  per vehicle is a different number from *tax* depreciation, and conflating
  them is how a management report becomes wrong twice.
- **Vehicle disposal invoicing.** No sale path exists (A1); do not add one
  speculatively.
- **Payroll *computation*** — gross-to-net, ΕΦΚΑ contributions, ΕΡΓΑΝΗ filings.
  **Still excluded, and not becoming unexcluded.** §5B.4 draws the line:
  *recording a salary payment as cash out* is in scope for Track B; *running the
  payroll* is not.
- **Becoming a Peppol access point.** Buy the provider; the mandate does not
  require building one, and for a minority B2B path it would be absurd.

---

## 5B. Track B — the management view *(added 11 November at Tasos's request)*

**What Tasos asked for:** monitoring of *"expenses, salaries paid, rental
income, cash received, cash flow projection, bank accounts and credit card
payment systems reconciliation"*, as a **basic build**.

### 5B.0 Why this is a different thing from Track A, and why that is the point

Track A exists because the **state** requires it. Track B exists because **the
owner needs to know whether the business is making money and whether it will
have cash in March** — and those are not the same question, are not answered by
the same numbers, and must not be mixed up.

| | Track A — statutory | Track B — management |
|---|---|---|
| Audience | ΑΑΔΕ, the accountant | Tasos |
| Basis | **accrual**, as ΕΛΠ requires | **cash**, because that is what runs out |
| Timing | correct, and late | approximate, and now |
| Authority | the accountant's books are the truth | indicative; never filed |

**The accountant's software will not give him Track B**, and this is the honest
argument for building it. It produces statutory output weeks or months after the
period, on an accrual basis, for the state. It does not tell him on a Tuesday in
February what the May insurance renewals will cost against the deposits already
taken for June.

**So Track B does not contradict §2 — it is the other half of it.** §2 says do
not build the general ledger. Track B is not a ledger: it is the operational
reporting a rental business needs, built on the money records Track A Stage 1
creates anyway.

**One consequence to state before any of it is built.** Track B's numbers
**will disagree** with the accountant's, legitimately — cash versus accrual,
VAT treatment, depreciation, period cut-offs. **Two numbers that differ for
known reasons are fine; two numbers that differ for unknown reasons are
dangerous.** So every report in Track B states its basis on its face, and §5B.6
makes the tie-back to Track A a requirement rather than a nicety.

### 5B.1 The warning that matters most: VAT is not income

**A cash-flow view built on gross receipts overstates income by about 19.4% and
then the VAT bill arrives.** At 24%, €124 received is €100 of income and €24
held on behalf of the state. This is the single most common way a small Greek
company surprises itself, and it is a *design* requirement, not a caveat:

- every cash-in figure carries **gross, net and VAT separately**;
- the **VAT payable** is a projected *outflow* with its own due date;
- no report shows a single "income" number without saying which it is.

Track A's `invoices` table already holds net/VAT/gross per F2's fix, so Track B
gets this for free **if it reads from there and not from `reservations.total`**.

### 5B.2 Rental income — and a correction to how it is measured today

**`reservations.total` is not revenue.** It is a quote: it includes bookings
never paid, bookings cancelled, and bookings still in the future, and it
excludes extras charged at return. Any report built on it is wrong in both
directions.

**Revenue comes from `invoices`; cash comes from `payments`** — both created in
Track A Stage 1. This is the strongest practical argument for Stage 1: it is not
only statutory plumbing, it is the only honest source for the income reporting
Tasos is asking for. **Track B is therefore blocked on Stage 1 and on nothing
else.**

Income reporting then splits three ways, and the split is the useful part:
**booked** (reservations, forward-looking), **invoiced** (earned), **collected**
(cash in). A gap between invoiced and collected is a debtor; a gap between
booked and invoiced is work in progress.

### 5B.3 Expenses — extend the pattern that already works

`vehicle_costs` (migration 011) is **already the right design** and should not be
touched: one row per outlay, `period_start`/`period_end` so an annual premium
spreads across the season it protects, with `supplier` and `invoice_ref`. Its
comment even records why profitability is not stored.

**What is missing is everything not attached to a vehicle:** rent, salaries and
contributions, the accountant, utilities, telecoms, marketing, bank and card
fees, software, legal, office costs.

**Proposed `expenses`**, deliberately mirroring `vehicle_costs`:

`category` · `amount` · `vat_amount` · `incurred_on` · **`paid_on`** ·
`period_start` / `period_end` · `supplier` · `invoice_ref` · `payment_method` ·
`bank_account_id` · `notes`.

**`incurred_on` and `paid_on` are separate columns and that is the whole point.**
Accrual needs the first, cash flow needs the second, and an unpaid invoice is
the difference between them — which is also how a creditors list falls out for
free.

**Two tables rather than one, with the reasoning stated so a reviewer can
disagree.** `vehicle_costs` stays because fleet attribution is what blueprint
§7's contribution-per-vehicle work needs, and its `cost_type` constraint is
vehicle-specific. A unioned read-only view presents both as one expense stream.
**Honestly: designed together today, these would be one table with a nullable
`vehicle_id`.** They are not being designed together, and migrating live data
plus the code that reads it, to arrive at the same reports, is cost without
benefit. *That is a judgement a reviewer may reverse — see §7.*

### 5B.4 Salaries — record the payment, do not run the payroll

**The distinction decides the scope.** Computing gross-to-net, ΕΦΚΑ
contributions and ΕΡΓΑΝΗ filings is payroll, it is regulated, it is the
accountant's or a payroll bureau's, and §5 excludes it. **That exclusion
stands.**

**"Salaries paid" is a cash outflow**, and recording it is in scope: two
`expenses` categories, `salaries` and `social_contributions`, with `paid_on`
and the period covered.

**Recommended default: aggregate by month, not per person.** Per-employee salary
rows would put sensitive personal data in a system whose access boundary was
designed around customer records, for little management gain — Tasos knows who
he employs and the bureau holds the detail. **If he wants per-person tracking it
is a small addition**, and it should then be a deliberate decision with its own
access rule, not a side effect of expense tracking.

### 5B.5 Bank accounts — import, do not integrate

**`bank_accounts`**: label, bank, IBAN, currency, active. **`bank_transactions`**:
one row per statement line — `value_date`, `amount`, `description`,
`counterparty`, an import batch reference, and a nullable link to the `payment`
or `expense` it settles.

**Start with CSV or MT940 export from e-banking, and do not build a bank API.**
PSD2 account-information access exists, but for one company with a handful of
accounts it is an integration, a credential, a consent to re-authorise every 90
days and an ongoing maintenance liability, to replace a monthly file download.
**This is exactly the speculative build §7 of `DEFINING-STATEMENTS.md` warns
against.** If the monthly import proves tedious, revisit with evidence.

**Reconciliation is matching, and matching is a suggestion, never an
assertion.** Propose matches on amount, date window and reference; a person
confirms. An auto-matcher that silently mis-attributes is worse than no matcher,
because it produces a reconciled-looking report that is wrong.

### 5B.6 Card reconciliation — the part most likely to be quietly wrong today

**Stripe does not deposit what the customer paid.** It deposits a payout, net of
fees, days later, batching many charges. So:

> **gross charge ≠ bank deposit**, and nothing in this system currently records
> the difference.

Today a deposit leaves `stripe_payment_intent` and `deposit_paid_at` on the
reservation. **The fee is recorded nowhere and the payout is recorded nowhere.**
Two consequences, both live:

1. **Revenue is overstated** by the card fees, which are a real cost of sale.
2. **The bank line can never be tied to a booking**, because one deposit
   corresponds to many charges minus fees — so "did we receive the money?"
   cannot be answered.

**Proposed `payouts`**: provider, provider payout id, `gross`, `fees`, `net`,
`arrival_date`, bank account, status — with each `payment` carrying its
`payout_id` and its own fee. Stripe's Balance Transactions API supplies all of
it, which makes this **the one place an API is worth it**, precisely because it
is the only source for data nobody can key in.

**Fees post to `expenses` as `card_fees`**, so they appear as a cost rather than
vanishing into a smaller deposit.

**NBG:** a hosted-payment path exists as an undeployed draft
(`NBG-PAYMENTS-INTEGRATION.md`). `payouts` should be **provider-agnostic from
the start** — per §7 of `DEFINING-STATEMENTS.md`, that costs nothing now and
avoids a rebuild if NBG ever lands.

### 5B.7 Cash-flow projection — and most of the data is already captured

The genuinely forward-looking piece, and the one no accounting package will
give him. **It should be a computed projection with its assumptions printed,
never a stored figure** — blueprint §8's rule that profitability is never
stored applies with equal force here.

**Inflows**, from data that exists: deposits already taken; balances due at
pickup on confirmed future reservations, dated by pickup; and — stated as an
assumption, not a fact — expected income for the season ahead.

**Outflows: the useful discovery is that the fleet table already knows most of
them.** `vehicles` carries `road_tax_paid_until`, `insurance_expiry`,
`kteo_expiry` and `next_service_due` per vehicle, and `vehicle_costs` carries
what each of those cost last time. **So a twelve-month outflow projection is
largely derivable from data already captured** — circulation tax in December,
insurance renewals on their real dates across 29 vehicles, KTEO as each falls
due — plus recurring `expenses` (rent, salaries, the accountant) and the **VAT
payable** from §5B.1.

**This matters most right now, which is the timely argument for building it.**
The office is closed, it reopens with preparations at end February / early
March, and the website is still taking bookings. **The off-season is exactly
when a cash-flow projection earns its keep** — outflows continue while revenue
is seasonal, and the question "what does it cost to get to March, and what is
already committed for June?" is unanswerable from this system today.

It also feeds **F1 of the open items** (insurance, KTEO and odometer data per
vehicle): the projection is only as good as those dates, which gives that item a
second reason to be done.

### 5B.8 Deliberately NOT in the basic build

Named so "basic" means something, and so the next person does not quietly add
them:

- **Budgeting and variance analysis.** Build the actuals first; a budget against
  no reliable actuals is theatre.
- **Depreciation and a fixed-asset register.** The accountant's (§2.1), and note
  the trap already flagged: *management* contribution per vehicle and *tax*
  depreciation are different numbers, and conflating them makes the management
  report wrong as well as the tax one.
- **Automated bank APIs.** §5B.5.
- **Per-employee payroll records.** §5B.4, unless Tasos asks.
- **Multi-currency.** Everything is EUR.
- **Any filing or submission.** Track B never sends anything anywhere. It is a
  mirror, and a mirror cannot create an obligation.

### 5B.9 Staging — what to build in what order

| | Stage | Depends on | Delivers |
|---|---|---|---|
| **B1** | `expenses` + the unioned view with `vehicle_costs` | nothing | **Total operating cost, finally visible.** Standalone value even if nothing else is built |
| **B2** | `bank_accounts`, `bank_transactions`, CSV import, assisted matching | B1, and A1 for `payments` | "Did the money arrive?" answerable |
| **B3** | `payouts` + Stripe fee and payout capture | A1 | Revenue stops being overstated; card takings tie to the bank |
| **B4** | The cash-flow projection | B1–B3, and F1's fleet dates | The off-season question answered |
| **B5** | A management summary screen — booked / invoiced / collected, cost by category, cash position, the projection | B1–B4 | One page, each figure stating its basis |

**B1 is the cheapest useful thing in this entire document** and depends on
nothing: one table and a view, and Anadyon can see its full operating cost for
the first time. **If only one thing is built from this proposal, build B1.**

**B3 is the one with a correctness argument behind it** rather than a
convenience one — it fixes an overstatement that exists today.

---

## 6. What needs a person — and Stage 0 is here

**Nothing in §5 should start before the first three are answered**, because each
changes what gets built rather than merely when.

### For the accountant — ask now, not when Stage 1 starts

1. **Is a closing declaration required on the vehicles Ψηφιακό Πελατολόγιο,
   and does it carry the invoice MARK?** (F6, and A2 since 30 August.) **This is
   the one with standing exposure.** If yes, every rental since July 2025 is
   affected and it outranks everything else in this document.
2. **Which income classification for a vehicle rental** — category and `E3_*`
   code, and does it differ for a business versus a private customer? (F2.)
   Nothing can be filed correctly without this and it must not be guessed.
3. **The Phase 2 e-invoicing date that actually applies to Anadyon**, and
   whether a πάροχος is needed for the B2B path or ΑΑΔΕ's `timologio` suffices.
   (§1.3, F10.) **Sources conflict and no primary source was obtainable.**
4. **Does the rental desk need a ΦΗΜ**, or does software transmission satisfy
   the retail-receipt obligation? (§1.7.) **This one can require hardware**, so
   a late answer is expensive.
5. **Refunds and VAT** — credit note `5.1`/`5.2` or cancellation, and in which
   period? (Stage 4, and Gate-0 §2188.)
6. **What format does your software ingest**, and what would you want in a
   periodic export? (Stage 5.) *Asking shapes the work; guessing wastes it.*
7. Still open from 30 August: **`1.1` with `category1_4` / `E3_880_001` for a
   fleet disposal** — confirm, and say whether the E3 code differs for an
   intra-EU or third-country buyer. **Not urgent; no code depends on it.**

### For Tasos — Track B (§5B), and none of these needs the accountant

These are quick, and each one changes what gets built:

- **Which bank accounts** should be tracked, and **can your e-banking export
  CSV or MT940?** §5B.5 assumes a monthly download rather than a bank
  integration; if the export does not exist, that assumption fails and I need
  to know before B2.
- **Salaries: monthly aggregate, or per person?** §5B.4 recommends aggregate,
  because per-person rows put sensitive personal data in a system scoped around
  customer records for little management gain. Easy either way — but it should
  be your decision, not a side effect.
- **Which expense categories** you actually want to see. My list in §5B.3 is a
  guess at a rental office's costs; the categories are what every report is
  grouped by, so getting them close to how you already think saves rework.
- **Is B1 alone worth it?** One table and a view, dependent on nothing, and it
  shows Anadyon's full operating cost for the first time. **If one thing is
  built from this document, it is that** — and it does not wait on the
  accountant, on Stage 1, or on the evaluation.

### For Tasos — Track A

- **ΑΑΔΕ sandbox credentials**, and the staging project — Stage 2 cannot be
  verified without them, and this is the reason the module has sat untransmitted
  since August. An agent cannot obtain these.
- **A §13 decision at Stage 4**, on the specific refund wording and behaviour,
  before anything customer-facing merges.
- **Whether to commission Stage 1 at all**, given §2's recommendation. The
  honest framing: **Stage 1 plus Stage 2 is worth doing on its own merits** —
  it fixes F1 through F5 and makes the existing filing path trustworthy —
  **whereas Stages 3 to 5 depend on answers only the accountant has.**

### What I could not verify, listed so nobody treats it as settled

Per §8, all labelled **unverified**:

- **Every e-invoicing date in §1.3.** `aade.gr` and `gsis.gr` return HTTP 403
  and EUR-Lex returns an empty 202 from this container, so **no primary text was
  obtained for any date in this document.** Secondary sources conflict,
  particularly on Phase 2.
- Whether `incomeClassification` is schema- or business-mandatory, and the
  correct codes for vehicle rental.
- Whether the current myDATA version is still `1.0.10`.
- Whether Α.1057/2025 changed the client-list schema or endpoint.
- Whether a closing client-list declaration is legally required.
- The IRIS threshold, the ΦΗΜ position, and whether the digital delivery note
  reaches a rental business.
- The reported penalty of 50% of VAT for non-compliance.

**One note on method, since it recurs in this project's history.** The
30 August record said `aade.gr` was unreachable and then drew a conclusion from
it; the correction was that *web search runs outside the container*. Today both
are true at once: search works and reached everything in §1, while direct
fetches of the authoritative text are refused. So the limit is real **and** it is
not an excuse — what it means is that the dates in this document are commentary,
and the accountant is the primary source. That is a better outcome than a
scraped PDF anyway.

---

## 7. For Fable and Codex — what I want challenged

Please argue with the reasoning, not the formatting. In rough order of what a
wrong answer would cost:

1. **Is Design B right (§2)?** The whole proposal rests on *"this system is a
   subsidiary ledger, not the general ledger"*. If an Ι.Κ.Ε.'s obligations
   actually make a half-ledger worse than either extreme — worse than full books
   or worse than a plain export — say so now, because Stage 1's schema is drawn
   around it.

2. **F1 — check my concurrency reasoning.** My claim is that
   `next_invoice_aa`'s `FOR UPDATE` serialises nothing, because the `rpc()` call
   commits before the number is persisted, and separately locks the empty set on
   a series' first invoice. **If that is wrong I want to know before a migration
   is written.** And if it is right: is `invoice_sequences` with
   `UPDATE ... RETURNING` in the inserting transaction the right fix, or is a
   Postgres sequence per series better despite sequences being non-gapless and
   non-transactional?

3. **F6 — is my reading of Α.1057/2025 sound** given I could not obtain the
   decision text? I have framed a closing declaration as *likely required* from
   vendor summaries describing entry/exit recording. **Challenge the inference.**
   Overstating it sends Tasos to the accountant with a false alarm;
   understating it leaves a breach running since July 2025. Both are costly and
   I would rather be corrected than balanced.

4. **Does Stage 1's model actually fit a rental's money?** Deposit at booking,
   balance at handover, extras at return, deposit refunded or retained against
   damage. Is `invoices` + `payments` + `replaces_invoice_id` enough, or does
   retaining a deposit against damage need something I have not modelled —
   and is that a *document* at all, or a settlement against a liability?

5. **Is the B2C/B2B split in §1.3(b) as load-bearing as I have made it?** I
   conclude Anadyon need not re-platform invoicing because retail is exempt from
   the e-invoice *format* obligation while remaining inside myDATA. If that
   reading is wrong, F10 stops being a bounded problem and Stage 2 changes
   shape entirely. **This is the conclusion I would most like a second reader
   on**, because it is the one that saves the most work if right.

6. **Sequencing.** I put the data model before correcting the filing modules, on
   the grounds that the modules' defects are consequences of the model. Is there
   a cheaper order that closes the compliance exposure sooner — in particular,
   should F6 jump the queue if the accountant says a closing entry is required?

7. **Scope.** §7 of `DEFINING-STATEMENTS.md` warns against speculative
   building. Have I excluded enough, or is Stage 1 itself already more than the
   obligations demand? A reviewer who says *"do only Stage 2 and the export, the
   rest is speculative"* would be making exactly the argument this project's
   rules invite — make it if you believe it.

### Track B (§5B) — added the same day, so less settled than the rest

8. **Is the two-track framing honest, or is it §2 being quietly walked back?**
   I claim Track B is not a general ledger because it is cash-basis management
   reporting that never files anything. **A reviewer could reasonably say that a
   system holding expenses, salaries, bank lines and card payouts *is* a set of
   books whatever it is called**, and that §2's recommendation has been reversed
   by instalments. If that is the better reading, say so plainly — it is the
   criticism I am least able to see from inside.

9. **Two expense tables or one?** §5B.3 keeps `vehicle_costs` and adds
   `expenses`, unioned in a view, and admits that designed together today they
   would be one table with a nullable `vehicle_id`. I judged migration cost not
   worth identical reports. **Reverse me if the duplication will cost more over
   time than the migration would now** — two tables that mean the same thing is
   how divergent `cost_type` vocabularies start.

10. **Is the `payouts` model right?** The underlying defect is **verified** — see
    **F11**; nothing captures a fee or a payout today. What is open is the fix:
    is a `payouts` table with per-`payment` fee attribution the right shape, and
    is posting fees to `expenses` as `card_fees` double-counting against the net
    deposit, or the correct way to make a cost of sale visible? **I am less sure
    of that second point than the rest of §5B.**

11. **Is the cash-flow projection within "basic"?** It is the piece with the
    most assumptions and the most ways to mislead, and a reviewer arguing it
    belongs in a spreadsheet until B1–B3 have produced a season of real data
    would be making a fair point.

**What would be most useful is disagreement with reasons.** Two things in here
are already known to be the kind of claim that has been wrong before on this
project: a lock that does not lock (F1(b) is the frozen-panes lesson in another
costume), and a date taken from commentary rather than the source (every date in
§1.3). Those deserve the hardest reading.

---

## 8. Where this sits

- **Owning document:** this one, indexed from `docs/README.md`.
- **Related:** `GATE-0-QUESTIONS.md` (A1–A3 answered, A2 open and now
  escalated), `RENTAL-SYSTEM-BLUEPRINT.md` §2188 (refund VAT, Gate 0), §4.2b
  (the purge, which F1(c) collides with), §7 (build order and §7's
  anti-speculation rule), `DEFINING-STATEMENTS.md` §5 (one pricing
  implementation, which F7 touches).
- **Track B's relations:** migration 011 (`vehicle_costs`, the pattern §5B.3
  extends), blueprint §8 (*"profitability is never stored"*, which §5B.7 obeys),
  blueprint §7 deferred (*"scheduled email reports — once reporting exists"*,
  which B5 would be the prerequisite for), `NBG-PAYMENTS-INTEGRATION.md` (the
  undeployed draft §5B.6 keeps `payouts` provider-agnostic for), and open item
  **F1** (fleet dates, which §5B.7's outflow projection depends on).
- **Open items:** the accountant's questions and the F-findings go to
  `docs/OPEN-ITEMS.md` as a group so they are not carried by this document
  alone.
- **Nothing in this document is approved, merged or deployed.** Stage 4 in
  particular reaches a customer and is explicitly subject to
  `DEFINING-STATEMENTS.md` §13.

---

## 9. Review — Fable, 11 November 2026

**Status: a review of §0–§8, not an approval. Nothing here is built either.**
Every code claim below was checked against `main` at `5ebffe1`. Claims about
ΑΑΔΕ behaviour or Greek law are from memory or from this repository's own
record and are **labelled unverified** where they are.

**Verdict in one paragraph.** Design B is right and I would not reopen it. The
code findings F1(a), F1(b), F2, F3, F4, F5, F7, F8, F9 and F11 reproduce.
**F6's evidence is stale and F1(c) is wrong as stated**; both are corrected
below. One defect was missed (**F12**), and it is the same defect this project
already found and fixed once in the sibling module. And the proposal skips the
fact that decides whether Stage 1 is needed at all: **nothing in `docs/`
records how Anadyon issues its invoices and files its client list today.**

### 9.1 The missing Stage 0 fact — how are documents issued today?

The rental business has operated through at least one season while this
module could not run: the invoice route returns 503 without `AADE_USER_ID`,
and §3 says there are no credentials. So invoices and receipts have been
issued **by some other means** — the accountant's software, a commercial
invoicing package, ΑΑΔΕ's `timologio`, a ΦΗΜ at the desk — and `grep` across
`docs/` finds no record of which.

That fact outranks every question in §6, because it changes what Stage 1 is:

- **If another system issues today and keeps issuing**, this application is
  not the system of record for invoices. Stage 1's `invoices` and
  `invoice_sequences` would then create a *second* numbering authority, which
  is worse than none. The right build is a `payments` table plus a reference
  to the externally issued document, and F1–F4 are closed by **deleting the
  invoice module**, not by repairing it.
- **If this application is meant to take over issuing**, Stage 1 stands as
  written — and the takeover needs a series that does not collide with the
  numbers already issued elsewhere.

The same applies to F6. If the Ψηφιακό Πελατολόγιο has been filed some other
way since July 2025, there is no gap. If it has not been filed at all, the gap
is **the whole filing, not the closing half of it**, and no code change
addresses the past.

**For Tasos, one question, and it does not need the accountant:** *what issues
Anadyon's invoices and receipts today, and what files the vehicle client
list?*

### 9.2 F6 — the evidence is stale; the substance is better evidenced than the proposal says

§4 F6 says `app/api/admin/aade/submit/route.ts:78-88` hardcodes
`nonIssueInvoice` true. **It does not.** That sentence is `GATE-0-QUESTIONS.md`
A2's, written 30 August about code that PR #185 replaced on 2 October.
Current state:

- `lib/aadeXml.ts:66-79` emits `dcrnew:NewDigitalClientDoc` with no
  `nonIssueInvoice` element at all, and `lib/aadeXml.test.ts:181-189` asserts
  the element is **absent**.
- §3 says nothing was ever transmitted, "in sandbox or production". The record
  disagrees: open item **E3** and the blueprint entry of 2 October record a
  sandbox trial of the client-list filing that exposed two defects. What is
  true is narrower — **no filing has ever been accepted**; E3 is still waiting
  on a positive `newClientDclID`.
- F6 calls the namespace "unverified" against Α.1057/2025. The blueprint entry
  of 2 October (Codex, against ΑΑΔΕ's v1.1 documentation) records that v1.1
  **retains** `http://www.aade.gr/myDATA/dcrnew/v1.0`.

The substance survives and gets stronger. The same blueprint entry says:
*"Invoice outcome and return details belong to UpdateClient, which is a
separate future operation."* So ΑΑΔΕ's own API has a second operation for
exactly what F6 says is missing, and this project has known since 2 October
that it is unbuilt. **That is better evidence than a vendor summary**, and it
turns question 1 for the accountant into a narrower one: *is `UpdateClient`
compulsory for every rental, when, and does it carry the invoice MARK?*

This is the §9 failure the proposal opens by warning against: §3 claims
"verified by reading the code, not from the documents", and F6 was taken from
a document. `GATE-0-QUESTIONS.md` A2 still carries the stale text and should
be corrected in the same pass.

### 9.3 F1 — (a) and (b) confirmed, (c) wrong, and two more paths to a duplicate

**(a) Confirmed.** `route.ts:54` is a standalone `rpc()`; PostgREST commits it
on return; the number is written at `route.ts:116-126`. Two reservations
submitted in overlap receive the same `aa`. `claim_invoice_submission` does
not help — it serialises per reservation, not per series.

**(b) Confirmed, and subsumed by (a).** With the lock released on return, what
it locked is irrelevant.

**(c) Does not follow.** A purge by age deletes the **oldest** rows, which
carry the **lowest** numbers. `MAX(invoice_aa)` is held by the newest row and
does not move. Numbering regresses only if the highest-numbered row is deleted
— an Article 17 erasure of a recent customer, or a series purged entirely
after five dormant years. That is a real path and much rarer than "when the
purge runs". Deriving a counter from business rows is still the wrong design;
the stated reason needs correcting.

**Two paths the proposal missed, both in `route.ts`:**

- **Line 54 discards the RPC error and line 58 falls back to `aa ?? 1`.** Any
  failure of `next_invoice_aa` files the document as number **1**.
- **Line 20 takes `series` from the request body, unvalidated.** Any admin
  caller can open a new series by typing one.

**The fix.** A counter row per series is right, and a Postgres sequence is
not: sequences are neither transactional nor creatable per series without DDL.
Three conditions, or the fix repeats the fault:

1. **"The same transaction" means one database function** that increments the
   counter and inserts the `invoices` row. Two `supabase-js` calls are two
   transactions, which is fault (a) again.
2. **`UNIQUE (series, aa)` on `invoices`.** The counter is the mechanism; the
   constraint is the guarantee.
3. **The fail-first test must run two overlapping calls against a real
   Postgres** (the migration replay harness), and be watched failing against
   the current function. A mocked `rpc()` cannot exhibit this bug.

**"Gaps are legal; duplicates are not" is asserted, not sourced.** Allocating
before transmission means a rejected filing consumes a number that never
reaches myDATA. Ask the accountant whether that is acceptable — **unverified**.

**Severity.** F1 is latent, not live: the route cannot run in production
without credentials. It blocks turning the module on; it is not an exposure
today.

### 9.4 F12 (new) — the invoice route treats HTTP 200 as acceptance. Verified in code.

`app/api/admin/invoices/submit/route.ts:104-126`: if the HTTP status is 2xx,
`invoiceMark` is pulled out with a regex that tolerates its absence, and the
reservation is set to `invoice_status: "issued"` with `invoice_mark: null`.
The result of that final `update` is never checked.

The client-list route had exactly this defect. The 2 October sandbox trial
exposed it (*"HTTP-200 business errors were treated as success"*), PR #185
fixed it with `lib/aadeDclResponse.ts`, and **the invoice route was not given
the same fix**. An invoice ΑΑΔΕ rejects with a validation error in a 200 body
would be recorded here as issued, could never be retried
(`claim_invoice_submission` refuses `issued`), and — because of the
`invoice_mark IS NOT NULL` filter — would hand its number to the next invoice.

*That myDATA `SendInvoices` returns per-invoice `statusCode` errors inside an
HTTP 200 is my recollection of ΑΑΔΕ's documentation plus the sibling API's
observed behaviour; **not verified against the sandbox for this endpoint**.*

Belongs in Stage 2 with F2/F3/F8. Like F1, latent rather than live.

### 9.5 Smaller corrections to §3 and §4

- **F3** cites `aadeXml.ts:134`; the line is **132**. **F2** cites `131-141`;
  the block is **136-141**.
- **F3 is half of a larger fault.** `aadeXml.ts:98` computes the invoice
  amount as `reservations.total − discount_amount`. §5B.2 argues, correctly,
  that `reservations.total` is a quote and not revenue. The invoice module
  files that quote. Extras charged at return never reach the document.
- **No `paymentMethods` element is emitted.** I believe myDATA requires it on
  these document types — **unverified**; vendoring the XSD (F8) settles it.
- **F11's wording.** Revenue is not "overstated by the fees" — revenue is
  gross and the fee is an expense. What is wrong today is that **margin and
  cash are overstated and the fee is invisible**. The distinction matters for
  question 10 (§9.7).
- **"30 tables"**: `CREATE TABLE` across the 48 migrations names 28.

### 9.6 Questions the accountant should also be asked

Add to §6:

- **Is a document due when the online deposit is received**, months before
  pickup? Stage 1 models deposit, balance and extras as up to three documents,
  but nothing in §6 asks *when* each must be issued. If an advance payment
  needs its own document at receipt, the issue point is the Stripe webhook,
  not check-out — **unverified, and it changes Stage 1's shape**.
- **Is a deposit retained against damage inside VAT at all?** Question 4 in §7
  asks whether it is a document or a settlement. My expectation is that
  compensation is outside VAT scope and takes a different document from a
  rental charge — **unverified**. Either way `payments.invoice_id` must be
  **nullable with a separate allocation**, because money arrives before any
  invoice exists and may never be matched to one.
- **Does the B2B mandate reach foreign business customers?** `aadeXml.ts:94-97`
  selects `2.1` on the mere presence of a VAT number, Greek or not. If the
  mandate is domestic-only, F10 covers only Greek-ΑΦΜ customers and shrinks
  again — **unverified**.

### 9.7 Answers to §7

1. **Design B — yes.** Subject to §9.1, which may shrink it further.
2. **F1** — §9.3.
3. **F6** — §9.2. Neither a false alarm nor yet a proven breach; ask the
   narrower `UpdateClient` question, and ask §9.1 first.
4. **Stage 1's model** — not quite: payments must be allocatable rather than
   owned by one invoice (§9.6).
5. **B2C/B2B split** — I cannot verify it either. It is the right working
   assumption because the wrong answer costs a provider subscription, not a
   rebuild.
6. **Sequencing** — there is a cheaper order. Nothing in F1–F5 or F12 is a
   live exposure, because the module cannot run. So: **§9.1's question →
   accountant's answers → then decide whether Stage 1 exists.** Do not write
   Stage 1's migration before §9.1 is answered.
7. **Scope** — Stage 1 is speculative until §9.1 is answered, and I would say
   so plainly. `payments` is justified under every answer; `invoices` and
   `invoice_sequences` only if this system issues.
8. **Is two-track honest?** For B1 and B3, yes. **B2 is where it becomes a
   set of books**: once bank lines, VAT-bearing expenses and payouts are all
   matched, this is a cash book whatever it is called. Two rules keep it a
   mirror: nothing in Track B is ever handed to the accountant as input, and
   nothing is required to balance. The real cost is not architectural — it is
   **Tasos typing every expense that the accountant also enters**. Before B1
   is built, check whether received supplier invoices can be read back from
   myDATA (its `RequestDocs` operation returns documents issued *to* a VAT
   number) — **unverified for this account**. That would remove most of the
   keying.
9. **Two tables — keep two.** But the unioned view has a hole the proposal
   does not mention: `vehicle_costs` has **no `paid_on` and no `vat_amount`**
   (migration 011), so fleet costs cannot appear on a cash basis or net of
   VAT. Add both as nullable columns in the B1 migration.
10. **Card fees are not double-counted, provided one rule holds:** cash-in is
    read from `payments` at **gross**, fees are an expense, and a bank line is
    matched to a **payout**, never to a payment. Double-counting happens only
    if income is read from bank lines (already net) *and* fees are also
    posted. Stripe's fee invoices come from Ireland, so their VAT treatment is
    the accountant's.
11. **The projection — split it.** The outflow calendar from fleet dates is
    arithmetic on existing columns and is within "basic", once open item F1
    has populated those dates. The inflow forecast is an assumption and
    belongs in a spreadsheet until a season of `payments` exists.

### 9.8 Recommendation

**Do not merge #256 as it stands; it is one correction away.** F6 and its copy
in W82 state something about the code that is false, and W82 is what every
agent reads first each morning. Fix F6, F1(c) and §3's "never transmitted",
add F12 and §9.1's question, then merge — it is documentation, and the rest is
sound and worth having on `main`.

**Order of work I would propose instead of §5's:**

1. Tasos answers §9.1.
2. The accountant gets §6 plus §9.6, with question 1 reworded per §9.2.
3. **B1**, with the two columns from §9.7 point 9 — after the `RequestDocs`
   check. Internal, depends on nothing, no §13 effect.
4. Everything else waits for 1 and 2.

### 9.9 Tasos's answers to §9.1 and §9.6 — 11 November 2026

Recorded as given, the same day. These are the owner's account of current
practice, **not yet confirmed by the accountant**.

| Question | Answer |
|---|---|
| What issues receipts today? | **Epsilon Net.** |
| What files the vehicle client list? | *"Are we supposed to file the customers list? I didn't know about it. We currently use the Epsilon net module for it."* **Ambiguous** — see below. |
| Document for an online deposit? | A receipt is normally issued **when the money is received in the bank account**. |
| Deposit retained against damage? | **Normally includes VAT** — it reflects a mechanic's quote, which is VAT-inclusive. |
| Does B2B reach foreign customers? | *"It could be."* Still open; the accountant's. |

**What follows from "Epsilon Net issues".**

- **This application is not the system of record for invoices, and must not
  become a second one.** Stage 1's `invoices` and `invoice_sequences` are
  withdrawn from my recommendation. What remains of Stage 1 is **`payments`**,
  carrying a reference to the Epsilon Net document number.
- **F1, F2, F3, F4, F7, F8, F9, F10 and F12 are defects in a module that should
  not be switched on.** They need no repair. The open choice is to remove
  `app/api/admin/invoices/submit` and `buildInvoiceXml`, or leave them dormant
  behind the missing credentials. **Not done here** — it was not asked, and
  whether Anadyon ever moves issuing in-house is Tasos's call.
- **Stage 2 and Stage 4 fall away with it.** Credit notes are issued where the
  invoices are.
- **Stage 5 inverts.** The useful hand-over is no longer an export *to* the
  accountant; it is this system telling staff what to issue in Epsilon Net
  (customer, amount, VAT, date), and recording the number that comes back.
- **Track B is unaffected**, and B3 gains a reason: if a deposit receipt is due
  when money reaches the **bank**, that date is the Stripe **payout** date, not
  the charge date — and F11 shows this system records neither payout nor fee.

**The client list is the unresolved one, and it is the urgent one.** The
answer can be read two ways: *Epsilon Net is what we use for receipts*, or
*Epsilon Net has a client-list module and we use it*. Tasos not having known of
the obligation points to the first. What can be said from this repository:

- ΑΑΔΕ's published `SendClient` schema has a dedicated `rental` use case
  carrying the vehicle registration (verified by Codex, 2 October, blueprint
  entry of that date). **Vehicle rental is a designed-for case of the
  obligation**, whatever the start date.
- The start date of **1 July 2025** is from secondary sources only
  (§1.4) — **unverified**.
- This application has **never had a client-list filing accepted** (E3), so
  it has not been covering the obligation.

So: if Epsilon Net's client-list module is not switched on and in use, **no
entry has been filed for any rental**, and the question for the accountant is
no longer the narrow `UpdateClient` one in §9.2 but the whole of it.

**Needed from Tasos — two checks, in this order:**

1. **In Epsilon Net, look for a "Ψηφιακό Πελατολόγιο" module and whether it
   holds entries for this season's rentals.** That is a fact, not an opinion,
   and takes a minute.
2. **Ask the accountant**, paste-ready: *"Είμαστε υπόχρεοι στο Ψηφιακό
   Πελατολόγιο Οχημάτων (Α.1057/2025) για τις ενοικιάσεις μας; Από ποια
   ημερομηνία; Καταχωρούνται οι ενοικιάσεις μας σήμερα, και από ποιο σύστημα;
   Αν όχι, τι πρέπει να γίνει για τις ενοικιάσεις από 1/7/2025 και μετά;"*

**On the two tax answers.** Both are plausible and both stay with the
accountant, because each has a catch worth naming when asking:

- *Receipt on arrival in the bank*: the customer is charged days before the
  payout lands, and one payout batches several customers. Which date governs?
- *Damage deposit includes VAT*: a mechanic's VAT-inclusive quote is Anadyon's
  **cost**. Whether the amount recharged to the customer is itself a taxable
  supply, or compensation outside VAT, is a separate question from what the
  quote contained.
