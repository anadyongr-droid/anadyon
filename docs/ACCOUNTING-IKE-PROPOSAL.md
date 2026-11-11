# Accounting for a Greek Ι.Κ.Ε. — what the system must do, and what it must not try to do

**Status: PROPOSAL. Nothing here is built, merged or deployed.** Written for
independent evaluation by Fable and Codex before any code is written.

**Last verified:** 11 November 2026, Claude.

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

So the question is not *"how do we add accounting?"*. It is three questions:

1. **What does an Ι.Κ.Ε. actually owe**, in 2026, after a year of Greek
   regulatory change that this repository's documents predate?
2. **Which of those obligations belong in this system at all**, and which
   belong in the accountant's software? This is the central architectural
   decision and §2 argues it is currently being got wrong by implication.
3. **What is defective in what already exists?** §4 lists ten findings, eight
   of them in code, each traced to a file and line.

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

Ten findings. **Confidence is stated on each**, and the two already in the
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

---

## 5. The proposal

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

### Deliberately excluded

- **A general ledger, chart of accounts, trial balance or financial
  statements.** §2.
- **Depreciation and a fixed-asset register.** The accountant's. Note the
  tension with blueprint §7's fleet-economics goal — *management* contribution
  per vehicle is a different number from *tax* depreciation, and conflating
  them is how a management report becomes wrong twice.
- **Vehicle disposal invoicing.** No sale path exists (A1); do not add one
  speculatively.
- **Payroll.**
- **Becoming a Peppol access point.** Buy the provider; the mandate does not
  require building one, and for a minority B2B path it would be absurd.

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

### For Tasos

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
- **Open items:** the accountant's questions and the F-findings go to
  `docs/OPEN-ITEMS.md` as a group so they are not carried by this document
  alone.
- **Nothing in this document is approved, merged or deployed.** Stage 4 in
  particular reaches a customer and is explicitly subject to
  `DEFINING-STATEMENTS.md` §13.
