# Anadyon fiscal operations blueprint

## Epsilon Smart parity, B2B invoicing, myDATA and Digital Client Registry

**Status:** architecture and product requirements; no implementation authorised by this document  
**Prepared:** 31 August 2026  
**Repository baseline:** `origin/main` at `02c6795`  
**Companion document:** [`RENTAL-SYSTEM-BLUEPRINT.md`](./RENTAL-SYSTEM-BLUEPRINT.md)

This focused companion exists separately because the review was explicitly
requested as a separate document. It does not replace the primary blueprint;
settled product decisions should be folded back into that document's revision
history so the architecture does not develop two competing sources of truth.

---

## 1. Executive decision

Anadyon should build a **rental-native fiscal operations layer**, but it should
not attempt to become a certified Greek electronic-invoicing provider.

The target should be:

1. Anadyon remains the operational source of truth for customers, rentals,
   prices, extras, payments, vehicle handovers and returns.
2. Anadyon creates an immutable fiscal-document intent from that operational
   data.
3. A licensed electronic-invoicing provider is the issuing and authentication
   channel for mandatory B2B invoices, unless Anadyon deliberately chooses the
   AADE `timologio`/`myDATAapp` workflow instead.
4. Anadyon stores the provider result, printable artefact, identifiers,
   delivery history and accounting audit trail.
5. Anadyon integrates the AADE Digital Client Registry (DCL) as a proper
   lifecycle: open, update/return, cancel, correlate with the fiscal document,
   retrieve and reconcile.

This approach can be better than Epsilon Smart for Anadyon because staff would
not re-key a rental into a generic accounting screen. The reservation, vehicle,
customer, DCL record, payment and invoice would be one controlled workflow.
It also avoids the unacceptable legal and operational risk of treating a
home-grown ERP-to-myDATA call as a compliant B2B issuing channel.

### Immediate business deadline

AADE's current FAQ divides mandatory B2B electronic invoicing into two periods:

- businesses with 2023 gross revenue above EUR 1,000,000: mandatory since
  2 March 2026;
- other businesses: mandatory from **1 October 2026**;
- the second group may operate progressively alongside other issuance methods
  until 31 December 2026 only if the required commencement declaration names a
  start date no later than 1 October 2026.

Anadyon's accountant must confirm the applicable period and chosen legal
channel immediately. If Anadyon is in the second group, there is approximately
one month from this document's date to complete provider selection and the
required declaration. Software construction must not delay that compliance
decision.

### Current readiness verdict

The existing Anadyon AADE code is a useful prototype and contains several good
safety improvements, but it is **not a production-ready invoicing subsystem**
and is not sufficient for B2B electronic-invoicing compliance.

The present code can:

- build one simplified myDATA XML document from one reservation;
- select type 11.2 for a private service receipt and 2.1 when a VAT number is
  present;
- calculate a 24% VAT split;
- allocate a serial number and claim one submission attempt;
- send to AADE's development endpoint by default;
- record a MARK, UID and authentication code on the reservation;
- build one simplified DCL opening document and record its MARK;
- refuse unrecognised counterpart countries rather than silently filing them
  as Greece.

It does not yet provide the document, provider, lifecycle, reconciliation,
reporting, archival and testing controls described below. No production AADE
submission should be enabled merely by setting `AADE_PRODUCTION=true`.

---

## 2. Scope, method and evidence

### 2.1 What was reviewed

This review combined four evidence sources:

1. A read-only inspection of the signed-in Epsilon Smart application. No
   customer, invoice, setting, integration or submission was created, edited,
   exported or deleted.
2. The current Anadyon repository, particularly:
   - `app/api/admin/invoices/submit/route.ts`;
   - `app/api/admin/aade/submit/route.ts`;
   - `app/admin/components/ReservationModal.tsx`;
   - `lib/aadeCountry.ts`;
   - `lib/aadeXml.test.ts` and `lib/aadeFilings.test.ts`;
   - `supabase/migrations/001_baseline.sql`;
   - `supabase/migrations/014_revoke_public_function_execute.sql`;
   - the existing rental-system blueprint.
3. Current official AADE material covering:
   - myDATA ERP/provider APIs and test environment;
   - mandatory B2B electronic invoicing;
   - Digital Client Registry v1.1;
   - digital movement documents.
4. Current Supabase security and platform guidance, including RLS,
   service-role isolation, backups and branch/test-environment capabilities.

### 2.2 Evidence labels used below

- **Observed — Epsilon:** visible feature or field in the inspected Epsilon
  Smart UI.
- **Verified — Anadyon:** present in the repository baseline.
- **Official requirement:** supported by current AADE or EU material.
- **Recommendation:** proposed Anadyon design; not a claim about Epsilon or a
  statutory interpretation.

### 2.3 Limits

- The review did not submit a real or test AADE document.
- It did not inspect Epsilon's source code, network credentials, database or
  internal architecture.
- It did not test accounting outputs against Anadyon's accountant's books.
- It did not make a legal determination about VAT, invoice timing, retention,
  B2C receipt channels, foreign VAT numbers or B2G applicability.
- Product capabilities were recorded, not proprietary layouts, code or
  confidential customer records.

An accountant and the selected licensed provider must sign off the fiscal
mapping before any production release.

---

## 3. Epsilon Smart capability map

This is the functional benchmark. Parity does not mean copying Epsilon's UI;
it means ensuring that Anadyon can complete the same necessary business and
fiscal outcomes.

### 3.1 Dashboard and operating view

**Observed — Epsilon:**

- quick actions for a new sale and new customer;
- revenue, receipts and monthly-revenue views;
- sales by service category;
- myDATA transmission statistics;
- receivables, top customers and top services;
- calendar information.

**Anadyon requirement:** a Fiscal Operations dashboard containing:

- documents awaiting issue;
- submissions in progress, rejected or needing correction;
- DCL rentals awaiting opening, return/update, cancellation or correlation;
- issued documents not delivered to the customer;
- paid rentals not yet invoiced;
- issued invoices with payment mismatch;
- sequence integrity and last successful issue per series;
- provider/AADE service health and last reconciliation time;
- today's gross, net, VAT, receipts and outstanding balances;
- B2B obligations due before the 1 October 2026 gate.

Every count must link to an actionable work queue. A green total with no route
to the underlying exception is not operationally useful.

### 3.2 Sales-document register

**Observed — Epsilon:** the service-sales register exposes date, document code,
customer, company name, MARK, series, net value, VAT, gross value, payable,
payment method, status, certification and origin. Staff can create, view/edit,
delete where allowed, print, draft-print, reprint, email, message, transform,
cancel, copy and export.

**Anadyon parity requirement:** a dedicated Fiscal Documents screen, separate
from Reservations, with:

- issue date/time and tax point;
- internal document ID and human-readable reference;
- legal type, series and sequential number;
- customer/person or business snapshot;
- net, VAT, fees, withholding, deductions, gross and payable totals;
- currency and payment terms/methods;
- provider status, myDATA status, MARK/UID/authentication code;
- delivery status and delivery address;
- source reservation and source payment;
- original/copy/credit/cancellation relationships;
- an immutable event history.

Actions must be state-dependent. For example, an issued document is never
edited in place; it is corrected by the legally appropriate credit,
cancellation or replacement workflow.

### 3.3 Service invoice editor

**Observed — Epsilon:** the document form supports:

- series, customer, date, number and code;
- multiple service lines;
- printable code and description;
- quantity, unit of measure, unit price, line discount and line total;
- document discount percentage and amount;
- VAT regime and exemption;
- payment method, reference, reason, status, origin and comments;
- MARK and certification fields;
- dispatch date/time and special category;
- explicit net, VAT, tax, fee, deduction, retention, gross and payable totals;
- billing name/company, full address, country, email and phone;
- extensible user fields;
- temporary save, save-and-new, last prices and line analysis.

**Anadyon requirement:** the invoice editor must be generated from a shared
fiscal schema rather than a reservation-shaped form. A rental should normally
arrive pre-populated with lines such as:

1. vehicle rental for the agreed rental period;
2. additional driver;
3. GPS;
4. baby/child seats;
5. insurance or damage-waiver products;
6. delivery/collection or other legitimate charges;
7. discounts as explicit line or document allowances according to the
   provider/accountant mapping.

The operator may adjust a **draft** with permission. The server must recalculate
all totals from quantity, unit price, tax category and allowances. The browser
must never provide an authoritative payable, VAT or discount total.

### 3.4 Fast retail receipt

**Observed — Epsilon:** a compact receipt workflow accepts customer, date,
billing name/address, description, value, VAT, total, reason, comments,
tax/retention totals and payment method.

**Anadyon requirement:** provide a fast B2C path for a legitimate walk-in or
manual rental, but still create the same canonical fiscal document and audit
events. “Quick” must mean fewer required inputs, not a separate ungoverned data
model.

### 3.5 Customer and company master

**Observed — Epsilon:** customer records include:

- code, name and company name;
- VAT number, retail/business distinction and “contact only” status;
- VAT regime and exemption;
- payment method and discount;
- profession, tax office, branch code;
- complete postal address and country;
- email and telephone details;
- category, accounting category, source and active status;
- debit, credit, turnover and balance;
- Greek GGPS lookup and VAT validation;
- customer ledger, statement and history actions.

**Verified — Anadyon:** the customer table already covers identity, contact,
address, country, VAT number, driving documents and CRM information. It does
not yet hold a complete company/fiscal profile or receivables ledger.

**Anadyon B2B requirement:** add a versioned business tax profile:

- legal/trading name;
- VAT number and country;
- domestic VAT validation status, source and checked timestamp;
- tax-office/DOY where still needed operationally;
- occupation/activity description;
- branch/establishment code;
- registered billing address;
- VAT regime and exemption code/reason;
- default currency, payment method and payment terms;
- accounts-payable contact and invoice-delivery channel;
- public-sector identifiers where B2G is in scope;
- active/blocked state and credit note;
- link to the underlying person/contact records.

The issued document must contain an immutable copy of the relevant profile.
Changing a company address later must not rewrite historical invoices.

### 3.6 Service catalogue and accounting mapping

**Observed — Epsilon:** services, service categories, units of measure, VAT
classes, VAT exemptions, taxes, retentions, payment methods, income/expense
classifications and prices are configurable master data.

**Anadyon requirement:** create a fiscal service catalogue whose entries map
rental concepts to:

- internal service code and bilingual printable description;
- unit of measure;
- default VAT category;
- allowed VAT exemptions and reasons;
- myDATA income category and classification type;
- provider/UBL code where applicable;
- default price behaviour and whether an operator may override it;
- valid document types;
- active dates and version history.

Hard-coding “one line, 24% VAT” in an API route is insufficient even if it
matches today's usual rental. Tax configuration must be explicit, reviewable
and effective-dated.

### 3.7 Document series and document families

**Observed — Epsilon:** configurable sales-document series include normal,
cancellation, return/credit and active/inactive characteristics. The inspected
account includes service receipts, service invoices, cancelling documents and
service credit documents.

**Anadyon requirement:** support at minimum the accountant/provider-approved
families for:

- B2C service receipt;
- B2B service invoice;
- B2C correction/return where applicable;
- B2B credit invoice, correlated and uncorrelated as applicable;
- cancellation/reversal paths accepted by the chosen provider and AADE;
- any B2G profile if Anadyon invoices public bodies.

Series must be configured per legal entity, establishment, channel and
document family. The server must not accept an arbitrary series string from a
browser request.

### 3.8 myDATA configuration and work queue

**Observed — Epsilon:**

- an 11-step myDATA setup wizard;
- parameter tables for document types, units, income and expense
  classifications, VAT, exemptions, movement purposes, payments, withheld and
  other taxes, fees and digital duties;
- a “documents to send” queue filtered by circuit, date, myDATA state and
  series;
- actions to inspect myDATA data, create/view a summary, propose
  classifications and refresh classifications;
- a transmitted-documents report filtered by date, record type, document type
  and series.

**Anadyon requirement:**

- versioned fiscal mappings;
- draft validation before issue;
- a durable provider/myDATA outbox;
- retry and dead-letter states;
- human-readable rejection messages plus raw codes;
- safe correction guidance;
- retrieval/reconciliation against the remote system;
- a searchable submission-attempt ledger;
- download of the exact request, response and schema version with secrets and
  unrelated personal data excluded;
- alerts for backlog age and reconciliation mismatch.

### 3.9 Electronic issuance and UBL

**Observed — Epsilon:** a separate electronic-issuance wizard and parameter
tables for UBL document types, VAT categories, exemptions, units, charges and
allowances. Epsilon Smart exposes a certified-provider connection (“Epsilon
Digital”).

**Official requirement:** AADE currently says that, for mandatory B2B
electronic invoicing, an ordinary commercial/accounting ERP is not itself an
accepted issuance method. The accepted routes identified by AADE are a licensed
electronic-invoicing provider or AADE's `timologio`/`myDATAapp` applications.

**Anadyon requirement:** build a provider adapter, not a pretend provider.
The adapter should support:

- provider customer/business onboarding state;
- document issue, cancellation and credit operations;
- provider idempotency keys;
- provider-specific status and error codes;
- returned structured invoice and human-readable PDF;
- MARK/UID/authentication information;
- recipient delivery and evidence;
- webhooks with signature verification, replay protection and durable
  processing;
- periodic reconciliation when a webhook is late or missing;
- provider portability through a provider-neutral domain interface.

UBL/EN 16931 should be part of the canonical mapping if required by the chosen
provider or B2G use case. It must not be implemented by guessing Epsilon's UBL
tables.

### 3.10 Digital Client Registry for rentals

**Observed — Epsilon:** the DCL register tracks departure, return, vehicle,
state, linked document and document code. It supports creating/viewing a
record, cancelling a client, offsite service, service category, different
return location, linking a fiscal document, issuing a receipt and completing
vehicle return. The blank rental entry includes:

- vehicle number;
- foreign vehicle flag;
- vehicle category and manufacturer;
- movement purpose;
- different return-location flag and location;
- related record;
- transmission-failure flag;
- provided service and comments.

**Official DCL v1.1 capabilities:**

- `SendClient`;
- `UpdateClient`;
- `CancelClient`;
- `ClientCorrelations`;
- `RequestClients`;
- rental-specific different return-location fields;
- B2B counterpart VAT/country requirements when updating the rental record,
  followed by explicit correlation to the fiscal document;
- recurring and continuous rental fields and validations.

**Anadyon requirement:** treat DCL as an event lifecycle, not two columns on a
reservation. At minimum:

1. determine whether and when the rental requires opening;
2. validate the vehicle and service data;
3. send the opening record and store the exact accepted payload/version;
4. update at return with actual return data and different return location;
5. correlate the accepted DCL record with the issued fiscal document;
6. cancel only through an explicit reasoned flow;
7. retrieve remote records and reconcile daily;
8. support AADE-declared transmission-failure/offline procedures;
9. prevent a returned rental from remaining remotely “in progress”;
10. expose every exception on the operations dashboard.

### 3.11 Digital movement

**Observed — Epsilon:** separate carrier and receiver workflows exist. Carrier
actions include start/transshipment, successful delivery, successful delivery
without recipient, partial delivery and failed delivery; the UI accepts a QR
URL.

**Relevance to Anadyon:** vehicle rentals and movement of fixed assets require
accountant review under the current digital-movement rules. Do not build this
module merely because Epsilon exposes it. First document which Anadyon
movements are in scope: customer rental handover/return, transfers between
offices, maintenance transport, replacement vehicles and transport of saleable
stock. If in scope, implement the current AADE v2.0.2 lifecycle and QR rules as
a separate bounded context.

### 3.12 Reporting, ledgers and receivables

**Observed — Epsilon:** customer and service balances/cards, sales journals,
detailed sales journals, daily receipts, tax/retention, VAT analysis, customer
list, service-by-customer, price-by-service, and myDATA reports.

**Anadyon requirement:**

- fiscal document register;
- VAT analysis by period, series and document family;
- net/VAT/gross reconciliation;
- daily receipts by payment channel;
- invoice-to-payment and invoice-to-reservation reconciliation;
- business-customer statement and open balances;
- credit notes and refunds;
- myDATA/provider submission register;
- DCL open/closed/correlated register;
- accounting export with stable identifiers;
- fiscal close report that identifies late or missing work.

Reports must be reproducible from immutable facts, not mutable reservation
totals.

### 3.13 Imports, exports, communications and integrations

**Observed — Epsilon:** data import/export, Excel exports, invoice email/SMS,
GGPS customer lookup, myDATA, a certified provider, messaging, payment/banking
and API-user integrations.

**Anadyon requirement:**

- accountant export in an agreed format;
- controlled master-data import with dry run, validation and rollback;
- customer-facing PDF/email delivery with delivery evidence;
- AFM lookup/validation through an authorised service;
- payment allocation from Stripe, Wise, NBG/Key2Pay or later providers without
  storing card data;
- provider webhook and reconciliation integrations;
- no spreadsheet export of unnecessary identity-document data;
- role-gated exports with an audit event.

---

## 4. Current Anadyon gap and risk assessment

### 4.1 What is already sound

The prototype contains several decisions worth retaining:

- production is an explicit opt-in; the AADE development endpoint is the
  default;
- XML escapes user-controlled text;
- unknown business/customer countries cause refusal rather than a fabricated
  Greek country code;
- B2C uses service-receipt type 11.2 rather than the goods-receipt type;
- B2B selects service-invoice type 2.1;
- the five mandatory zero-valued invoice-summary elements were restored;
- unique partial indexes protect stored invoice and DCL MARK values;
- submission claims reduce accidental repeated sends;
- failed construction/network requests release the claim into an error state;
- privileged SECURITY DEFINER functions have had PUBLIC/anon/authenticated
  execution revoked and their search paths pinned;
- tests verify key XML and refusal behaviour.

These are components of a future adapter, not evidence that the whole module is
ready.

### 4.2 Critical gaps

#### C1 — No accepted mandatory-B2B issuing channel

`app/api/admin/invoices/submit/route.ts` posts directly to the myDATA ERP API.
AADE's current FAQ says an ordinary ERP is not an accepted issuance method for
the mandatory B2B regime. A licensed provider or AADE application decision is
therefore a legal deployment dependency, not an optional later enhancement.

**Required:** provider/accountant decision, contract, commencement declaration,
sandbox onboarding and production credentials. Keep production submission
disabled until complete.

#### C2 — The fiscal document is not a document

Invoice state and identifiers live on `reservations`. There is no invoice
header table, line table, immutable customer snapshot, tax breakdown,
relationship graph, delivery archive or attempt history.

**Consequence:** one reservation can represent only one simplistic fiscal
outcome and historical facts can drift when the reservation/customer changes.
Credit, cancellation, split billing, multiple payments, company billing and
auditable re-issue cannot be represented safely.

#### C3 — DCL lifecycle is incomplete and unvalidated

The current DCL route only calls `SendClient`, always sets
`nonIssueInvoice=true`, hard-codes service/movement settings and stores only
status plus MARK. It does not update return details, cancel, correlate the
invoice, retrieve remote records or reconcile. The XML has not been proven by
an end-to-end call against the AADE DCL test environment and current XSD.

**Consequence:** a rental can be left remotely open or uncorrelated even though
Anadyon considers it returned and invoiced.

### 4.3 High gaps

#### H1 — Simplified and possibly incomplete invoice payload

The XML contains one line and a 24% VAT split, but no explicit service
description, quantity/unit catalogue, payment-method block, income
classification, allowances/charges model or complete provider document.
Only a current XSD plus AADE/provider sandbox acceptance can establish whether
the payload is valid and truthful.

#### H2 — Issue date is derived from pickup date

The current header uses `reservation.pickup_date` as `issueDate`. The legal
issue/tax point must be decided at issuance under the accountant/provider
mapping; it cannot be assumed to equal planned pickup.

#### H3 — Totals do not have an immutable canonical source

The route calculates gross as `reservation.total - discount_amount`. The
meaning of `total` must be proven across website, admin and historical records:
if it is already post-discount, the route deducts twice. Even if currently
correct, a mutable reservation total is not a safe historical fiscal source.

**Required:** create a server-side fiscal snapshot and recompute from canonical
lines using decimal arithmetic. Assert `net + VAT + taxes + fees - deductions =
gross/payable` according to the approved mapping.

#### H4 — Sequence generation is not a fiscal counter service

`next_invoice_aa` scans reservations and uses `MAX(invoice_aa)+1`. Locking
matching rows does not protect an empty/new series from concurrent first
allocation and couples numbering to successful reservation MARKs. A failed or
externally issued document complicates the sequence.

**Required:** use provider-assigned numbering where required, or a dedicated
series-counter row locked in one transaction, with a unique constraint,
reservation/expiry policy and accountant-approved handling of failed issue
attempts. Never let the browser choose an unrestricted series.

#### H5 — Synchronous network call without timeout or durable job

Both AADE routes wait inside the browser request and have no explicit timeout.
The admin timeout incident elsewhere in the system demonstrates why remote
availability cannot be allowed to hold an interactive request indefinitely.

**Required:** durable outbox, bounded timeout, retry schedule with jitter,
idempotency key, dead-letter state, watchdog for stuck claims and remote
reconciliation before retrying an unknown outcome.

#### H6 — Response parsing and evidence are too weak

The routes parse XML with regular expressions and preserve only a few returned
identifiers. Attempts, status codes, schema versions and accepted artefacts are
not durably recorded.

**Required:** namespace-aware XML parser, XSD validation, structured error
mapping, redacted request/response archive, hashes, timestamps and provider
correlation IDs.

#### H7 — No provider webhook security model

A provider integration needs signed webhooks, constant-time verification,
timestamp tolerance, replay/idempotency protection, raw-body verification,
audited processing and reconciliation. This should reuse the security lessons
already applied to the Resend and Stripe paths.

#### H8 — Environment switch is too easy to misuse

A single `AADE_PRODUCTION=true` changes the endpoint. It does not prove that the
deployment is production, the provider declaration exists, the credentials
belong to the right legal entity, the mappings were approved or the sandbox
test pack passed.

**Required:** production host/environment allowlist, explicit fiscal-channel
configuration, credential fingerprint display, release gate and two-person
enablement record. Never copy production fiscal credentials to preview.

### 4.4 Medium gaps

- No B2B billing choice in the reservation workflow: the customer/person and
  invoice recipient/company need to be distinct.
- No branch, legal name, VAT regime, exemption, payment terms or AP contact in
  the canonical company profile.
- No duplicate-VAT or VAT-country validation workflow.
- No draft/issued/accepted/delivered/paid/credited/cancelled state separation.
- No split or consolidated invoice support; the supported policy is
  undocumented.
- No multi-currency policy, even if EUR-only is the deliberate launch scope.
- No print/PDF template, QR, bilingual label or accessible email attachment
  specification.
- No customer delivery evidence or resend history.
- No accounting close/period lock.
- No permissions specific to draft, issue, cancel, credit, export and
  configuration.
- No maker/checker approval for changing tax mappings or series.
- No fiscal retention/backup restore test.
- No operations runbook for AADE/provider outage or unknown submission result.

---

## 5. Target domain model

The model below is conceptual. It must be implemented through numbered,
reviewed migrations and replayed against an isolated test database; this
document does not authorise a production migration.

### 5.1 Boundary rule

Reservation state and fiscal state are linked but not identical:

```text
Customer / Company
        │
        ├── Reservation ── Vehicle handover/return ── DCL lifecycle
        │        │
        │        ├── Pricing snapshot
        │        └── Payment obligations / payment allocations
        │
        └── Fiscal document intent
                 ├── Immutable recipient snapshot
                 ├── Immutable lines and tax totals
                 ├── Series and legal relationships
                 ├── Provider issuance/submission attempts
                 ├── Returned fiscal artefacts and identifiers
                 └── Customer delivery evidence
```

A reservation edit may propose a new fiscal action; it must never mutate an
issued invoice.

### 5.2 Recommended aggregates and tables

#### `fiscal_entities`

Anadyon's issuer profile: VAT number, country, legal name, establishment,
address, provider account, active dates and configuration version.

#### `customer_tax_profiles`

Current reusable business billing data. Changes are versioned and audited.

#### `fiscal_document_series`

Legal entity, establishment, document family, code, next number or provider
numbering policy, active period, provider mapping and permissions.

#### `fiscal_documents`

One row per draft or issued legal document:

- immutable UUID;
- source reservation and optional source quote;
- issuer and recipient snapshot IDs;
- family/type, series, number, issue timestamp, currency;
- draft/issuing/issued/rejected/delivered/credited/cancelled lifecycle;
- net/VAT/tax/fee/deduction/gross/payable totals;
- original-document relationship;
- provider, MARK, UID, authentication code and provider ID;
- content hash and schema/mapping version;
- created/issued/cancelled actors and timestamps.

#### `fiscal_document_parties`

Immutable issuer and recipient snapshot: legal name, VAT, country, branch,
address, contact and relevant identifiers.

#### `fiscal_document_lines`

Line number, service code, bilingual description, quantity, unit, unit price,
allowance/discount, net, VAT category/rate/amount, classification and source
rental item.

#### `fiscal_document_adjustments`

Header or line charges, fees, taxes, stamp/digital duties, retentions,
deductions and allowances with explicit type/code and amount.

#### `payment_allocations`

Many-to-many relation between verified payments/refunds and fiscal documents.
Provider payment references remain opaque; PAN/CVV never enter Anadyon.

#### `fiscal_submission_jobs`

Durable outbox: operation, provider, idempotency key, scheduled time, lease,
attempt count, last outcome and dead-letter state.

#### `fiscal_submission_attempts`

Append-only record of every request/response outcome, timestamps, remote IDs,
schema version, request/response hashes and a redacted diagnostic payload.

#### `fiscal_artifacts`

Private storage references for exact provider XML/UBL, human-readable PDF and
delivery copy, each with checksum, MIME type, source and retention class.

#### `fiscal_delivery_events`

Recipient, channel, provider message ID, accepted/delivered/bounced state and
timestamps. Reuse the architecture of `booking_email_deliveries`, not its
business semantics.

#### `dcl_records`

One DCL aggregate per applicable rental, with local lifecycle, remote MARK,
service type, vehicle and planned/actual dates/locations.

#### `dcl_events` and `dcl_correlations`

Append-only open/update/cancel/retrieve/correlate attempts and the relationship
to one or more fiscal documents.

#### `fiscal_audit_events`

Who did what, from which state to which state, why, and what immutable object
was produced. Never record secrets or unnecessary identity-document values.

### 5.3 Database guarantees

- exact `numeric` amounts; never binary floating point for fiscal arithmetic;
- check constraints for non-negative and balanced totals;
- unique legal identity across entity/series/number;
- unique remote MARK/UID/provider ID where supplied;
- one active job per document/operation/idempotency key;
- foreign-key restriction against deleting issued facts;
- append-only attempt/event history;
- issued snapshots protected from ordinary updates;
- explicit soft-retention/anonymisation process only where legally allowed;
- indexes for work queues, issue date, VAT, customer and remote identifiers.

### 5.4 Supabase security model

All fiscal tables are sensitive and should be treated as server-only unless a
specific UI view proves otherwise.

- Enable RLS on every table in an exposed schema.
- Do not grant browser roles direct write access to fiscal documents, series,
  jobs, attempts or DCL events.
- Use narrowly scoped server routes and Postgres functions for state
  transitions.
- Revoke function execution from `PUBLIC`, `anon` and `authenticated` before
  granting only the intended role.
- Pin `search_path` for every SECURITY DEFINER function and schema-qualify
  objects.
- Keep `SUPABASE_SERVICE_ROLE_KEY` server-only and absent from preview builds
  that point at untrusted branches.
- Use security-invoker views when a view is exposed and verify both table
  privileges and RLS.
- Separate production from the isolated staging Supabase project.
- Add pgTAP/security regression tests for every privilege boundary.
- Audit service-role use and minimise the routes that import the admin client.

The current migration 014 is the correct pattern for privileged functions and
must remain a regression baseline.

---

## 6. Required workflows

### 6.1 B2C rental to receipt

1. Reservation price is calculated and payment is verified.
2. Handover opens/updates DCL if required.
3. On the accountant-approved tax point, the server builds a draft receipt
   from immutable rental lines.
4. Validation reports missing tax/country/series mapping before submission.
5. An authorised user issues, or an approved automatic policy queues issuance.
6. Provider/accepted channel returns legal identifiers and artefacts.
7. Anadyon records, verifies and delivers the receipt.
8. Return updates DCL and correlates the fiscal document.
9. Reconciliation confirms local and remote records match.

### 6.2 B2B rental to company invoice

1. Staff/customer selects “invoice to company” separately from the driver.
2. Business VAT number/country is validated and the company profile completed.
3. Quote/reservation shows the billing company without replacing the driver.
4. Before issue, the system snapshots company and issuer data.
5. Lines, VAT, discounts, payment terms and classifications are recalculated on
   the server.
6. A licensed provider (or `timologio` operational process) issues through the
   declared channel.
7. The returned structured invoice/PDF and identifiers are stored.
8. The invoice is delivered to the AP contact and visible in the customer
   statement.
9. Payment allocations update receivables without rewriting the invoice.
10. DCL update/correlation includes the B2B counterpart fields required by the
    current DCL version.

### 6.3 Credit/correction

1. Staff opens the issued document, not the mutable reservation.
2. The UI explains allowed corrective actions for that state/provider.
3. Staff selects reason and affected lines/amount.
4. Server produces a correlated draft credit/cancellation document.
5. Authorised issue follows the provider workflow.
6. Accounting totals, customer balance, payment/refund and audit update from
   new facts; the original stays immutable.

### 6.4 Unknown remote outcome

1. A bounded submission timeout moves the job to `outcome_unknown`, not
   immediately to “failed”.
2. Worker queries provider/AADE by idempotency or document identity.
3. If found, it records the accepted result.
4. If absent, retry is allowed under the provider's idempotency rules.
5. If unresolved, it goes to a human queue; no blind repeated issue occurs.

### 6.5 Provider outage

- drafts may continue if operationally safe;
- issuance rules follow the provider/AADE contingency procedure;
- staff see service status and backlog age;
- jobs retry automatically within approved limits;
- manual export is not treated as submission;
- recovery performs remote reconciliation before draining the queue;
- every contingency action is auditable.

---

## 7. Permissions and governance

### 7.1 Roles

At minimum:

- **Rental staff:** prepare billing information and drafts; cannot change tax
  mapping, series or cancel an issued document.
- **Supervisor:** approve exceptional draft changes and issue/credit within
  policy.
- **Finance/accountant:** configure mappings, periods and reports; approve
  close and correction rules.
- **Administrator:** manage users/integrations but cannot silently rewrite
  issued fiscal facts.
- **System worker:** narrowly scoped non-human role for provider/DCL jobs.

### 7.2 High-risk actions

Require explicit reason, recent authentication and audit for:

- change of VAT/mapping/series;
- production-channel enablement;
- issue, cancellation or credit;
- resend to a changed email address;
- export of customer/fiscal data;
- manual reconciliation override;
- period reopen;
- deletion of drafts or retention execution.

Consider maker/checker approval for production channel activation and tax
mapping changes.

### 7.3 Configuration change control

Every tax/provider/DCL mapping must have:

- version and effective date;
- source specification/version;
- accountant/provider approver;
- test fixture coverage;
- staging result;
- production activation event;
- rollback or expiry plan.

---

## 8. Better-than-Epsilon opportunities

Epsilon Smart is broad; Anadyon can be better in depth for rentals.

### 8.1 Zero re-keying

One accepted reservation should pre-populate customer, company, vehicle,
service lines, DCL record, payment and invoice. Staff should confirm exceptions,
not reproduce the booking in a generic invoice editor.

### 8.2 One rental timeline

A reservation timeline should show:

- request and quote confirmation;
- payment and booking confirmation;
- DCL opening/update/correlation;
- handover/return;
- fiscal draft/issue/delivery;
- credit/refund;
- every remote result.

The dedicated Fiscal Documents screen remains available for finance work.

### 8.3 Actionable compliance assistant

Instead of “AADE error”, show:

- the field and source record;
- the official/provider code;
- a plain-language cause;
- the safe correction action;
- whether a retry is safe;
- whether remote reconciliation ran.

Do not use generative AI to invent tax classifications. AI may explain an
authoritative code, but mappings remain deterministic and approved.

### 8.4 Rental-specific DCL automation

- open from actual handover, not merely a planned reservation;
- complete from actual return;
- infer different return location from canonical location IDs;
- block return completion if DCL update is unresolved, or create an explicit
  exception task according to the approved outage process;
- correlate the correct fiscal document automatically;
- reconcile nightly.

### 8.5 Safer defaults

- provider development environment only in staging;
- production credentials unavailable to previews;
- issue button disabled until all deterministic validation passes;
- immutable preview of the exact document before issue;
- duplicate/replay detection;
- no destructive delete for issued documents;
- fiscal work queue remains usable during provider latency.

### 8.6 Accountant collaboration

Offer a read-only accountant role, period filters, reconciliation pack and
stable export. This is more useful than emailing spreadsheets whose formulas or
column meanings change.

---

## 9. Delivery plan and gates

### Phase 0 — compliance/channel decision (urgent, no code dependency)

**Owner:** Tasos + accountant + selected provider  
**Target:** before 1 October 2026 where second-period rules apply

- confirm Anadyon's B2B obligation period from 2023 gross revenue;
- choose licensed provider versus AADE `timologio`/`myDATAapp`;
- confirm whether Epsilon Digital/Epsilon Smart remains the short-term fiscal
  system while Anadyon integrates;
- complete contract and commencement declaration steps;
- confirm B2C, B2B, B2G, foreign-company and credit-note document mappings;
- confirm tax point, VAT, exemptions, discounts, deposits, cancellations and
  DCL responsibilities;
- obtain provider sandbox/API documentation and support contact;
- document business-continuity method.

**Gate:** no production in-house fiscal issue until this is signed off.

### Phase 1 — canonical fiscal foundation

- implement isolated staging database first;
- introduce fiscal entities, profiles, series, document header/lines,
  adjustments, jobs, attempts, artefacts, audit and DCL lifecycle tables;
- introduce server-side draft builder from a reservation snapshot;
- add B2B billing-company workflow;
- add permissions and RLS;
- backfill only references needed to find historical Epsilon documents; do not
  fabricate fiscal documents from mutable historical reservations;
- add schema replay and two-way drift checks.

**Gate:** migration replay, RLS tests, parity mapping and restore test pass.

### Phase 2 — provider sandbox adapter

- implement provider-neutral interface and first licensed-provider adapter;
- validate signed webhooks and idempotency;
- issue representative sandbox B2C/B2B/credit/cancel documents;
- store and verify structured/PDF artefacts;
- build durable retries, timeout and reconciliation;
- keep current direct route disabled for production use.

**Gate:** provider certification/onboarding steps complete and sandbox pack
approved by accountant/provider.

### Phase 3 — DCL v1.1 lifecycle

- implement send, update, cancel, correlate and retrieve;
- support actual return and different return location;
- support B2B counterpart rules;
- add continuous/recurring fields only if Anadyon needs them;
- validate every payload against the official v1.1 XSD;
- run test-environment fixtures and failure scenarios;
- create DCL operations queue and nightly reconciliation.

**Gate:** no remotely open/correlated mismatch in the acceptance dataset.

### Phase 4 — operations UI and reports

- Fiscal Documents register/editor;
- work queues and dashboard;
- customer/company statement;
- VAT, sales, payment and myDATA reports;
- document delivery and resend evidence;
- accountant exports;
- mobile-safe receipt/DCL workflow.

### Phase 5 — controlled production cutover

- production credentials only in Production scope;
- credential/legal-entity fingerprint check;
- backup and restore drill;
- provider/AADE health alerting;
- low-volume controlled issue with accountant watching;
- verify recipient delivery, provider record, MARK and accounting export;
- maintain Epsilon/manual fallback until the agreed parallel period ends;
- retrospective review after first day, week and month close.

### Phase 6 — optional digital movement and advanced automation

- build only after accountant scope determination;
- add QR and current v2.0.2 carrier/receiver lifecycle if required;
- add consolidated/company billing, credit limits and advanced receivables only
  after core fiscal controls are stable.

---

## 10. Verification strategy

### 10.1 Deterministic calculation matrix

Test across:

- B2C and B2B;
- car, motorbike and bicycle rental;
- one and multiple rental/extras lines;
- no discount, percentage discount, fixed discount and waived extra;
- 24-hour boundary and cross-season pricing;
- deposit-only, full payment, balance and refund;
- domestic, EU and third-country business profiles;
- VAT exemption cases approved by accountant;
- credit/cancellation paths;
- EUR rounding at line, VAT and document totals.

Every fixture must state the approved expected net, VAT, gross, payable,
classification and document type.

### 10.2 Schema and contract tests

- validate generated XML/UBL against the exact official/provider XSD/version;
- preserve namespace and element order;
- validate all response variants with a real parser;
- pin representative provider fixtures without secrets;
- fail closed on unknown enum/code/version;
- contract-test provider sandbox on a schedule before season and after a
  published specification change.

### 10.3 Lifecycle and concurrency tests

- simultaneous issue clicks create one document;
- timeout after remote acceptance does not duplicate;
- webhook replay is idempotent;
- first number in a new series cannot race;
- credit cannot exceed the approved original balance;
- cancelled/voided rental cannot be silently issued;
- issued invoice cannot be mutated by customer/reservation edits;
- payment replay does not allocate twice;
- DCL open/update/correlation replay is idempotent;
- return cannot target the wrong DCL record.

### 10.4 Security tests

- anon and ordinary authenticated roles cannot read/write fiscal tables or call
  transition functions;
- staff permissions are tested per action, not merely per page;
- service role never enters browser bundles or preview configuration;
- provider secrets are redacted from errors/logs;
- webhook raw body, signature, timestamp and constant-time comparison are
  tested;
- SSRF is prevented if any provider URL is configurable;
- exports are role-gated and audited;
- formulas and CSV cells are escaped against spreadsheet injection;
- XML payloads handle hostile characters without entity expansion;
- rate limits and CSRF protections cover issue/cancel/credit endpoints;
- object storage artefacts are private with short-lived authorised download.

### 10.5 Operational tests

- provider unavailable;
- AADE unavailable;
- database write fails after remote acceptance;
- webhook delayed/out of order;
- worker crash while leased;
- duplicate remote identifiers;
- rejected mapping after a specification update;
- email delivery failure after successful issue;
- restore database and private fiscal artefacts into isolated environment;
- reconcile restored local state with a fixed remote fixture.

### 10.6 Acceptance pack

Before production, retain a signed pack containing:

- accountant-approved mapping table;
- provider onboarding/declaration evidence;
- exact test versions;
- sandbox document IDs for each required family;
- XSD/contract test results;
- security/RLS test results;
- migration replay and drift output;
- backup/restore result;
- outage runbook exercise;
- named launch approvers and rollback owner.

---

## 11. Operational runbooks required

1. Provider or AADE outage.
2. Unknown submission outcome.
3. Rejected invoice/DCL record.
4. Incorrect issued document and credit/cancellation choice.
5. Lost or compromised provider credentials.
6. Sequence inconsistency.
7. Local/remote reconciliation mismatch.
8. Customer says invoice was not received.
9. Payment received but issue failed.
10. DCL record still open after return.
11. Database restore and fiscal artefact restore.
12. Provider migration or exit.

Each runbook must name who acts, what is safe to retry, what must never be
deleted, when the accountant/provider is contacted and how the incident closes.

---

## 12. Product backlog by priority

### Must decide now

- applicable B2B period;
- licensed provider or AADE application channel;
- provider declaration/onboarding deadline;
- interim continued use of Epsilon Smart;
- accountant-approved document/tax/DCL matrix.

### Must build before Anadyon issues production fiscal documents

- separate immutable fiscal-document model;
- B2B company billing profile and snapshot;
- line/tax/discount calculation engine;
- safe series/provider numbering;
- provider adapter and signed webhook processing;
- durable outbox, timeout, retry, dead-letter and reconciliation;
- document/credit/cancellation lifecycle;
- secure artefact storage and delivery evidence;
- full DCL v1.1 lifecycle;
- permissions, RLS and audit;
- official XSD/provider sandbox acceptance;
- backup/restore and outage runbooks.

### Can follow after safe fiscal launch

- advanced receivables and customer statements;
- configurable print designer;
- SMS/Viber delivery;
- AI explanations of deterministic error codes;
- advanced analytics and sales forecasting;
- digital movement, if accountant confirms scope;
- multiple provider adapters;
- sophisticated B2G/Peppol experience if Anadyon enters public contracts.

---

## 13. Explicit decisions still required

The implementation team must not infer these:

1. Is Anadyon above the EUR 1,000,000 2023-revenue threshold?
2. Which provider/channel will legally issue B2B invoices?
3. Will Epsilon Smart remain the official issuer during transition?
4. Which receipt/invoice types and series apply to each rental scenario?
5. What is the issue/tax point for advance, deposit, pickup, return and later
   extra charges?
6. Is `reservations.total` currently before or after `discount_amount` in every
   creation/edit path?
7. How are deposits, guarantees, refunds, no-shows and damage charges treated?
8. Which VAT exemptions/foreign cases does Anadyon actually serve?
9. Is B2G/Peppol in scope?
10. Which vehicle/fixed-asset movements require digital movement documents?
11. What are the accounting and fiscal retention periods and archive format?
12. Who may issue, credit, cancel, change mappings and close a period?

Record answers as versioned architecture decisions with accountant/provider
approval.

---

## 14. Recommended next action

Do not start by expanding the current `buildInvoiceXml()` function.

Start with a two-track process:

### Business/compliance track

Within days, meet the accountant and two licensed providers. Use this document
as the requirements list, confirm the 1 October deadline, select the channel
and complete the declaration/onboarding path.

### Engineering track

Write a provider-neutral technical design for Phase 1 using an isolated
Supabase staging project. The first pull request should introduce only the
domain types, schema proposal, permissions/tests and adapter interfaces. It
must not enable production AADE calls or apply a production migration.

This preserves the safe option to keep issuing through Epsilon Smart while
Anadyon earns the evidence required to take over the workflow.

---

## 15. Sources

Official sources checked on 31 August 2026:

- [AADE — Mandatory electronic invoicing and digital movement](https://www.aade.gr/node/15728)
- [AADE — Mandatory electronic invoicing and digital movement FAQ](https://www.aade.gr/ypohreotiki-ilektroniki-timologisi-psifiaka-parastatika-diakinisis-syhnes-erotiseis)
- [AADE — myDATA specifications](https://www.aade.gr/mydata/prodiagrafes)
- [AADE — myDATA test environment and v2.0.2 material](https://aade.gr/en/mydata-electronic-books/mydata/test-environment)
- [AADE — Digital Client Registry v1.1 specifications](https://www.aade.gr/mydata/tehnikes-prodiagrafes-ekdoseis-psifiako-pelatologio)
- [European Commission — eInvoicing in Greece](https://ec.europa.eu/digital-building-blocks/sites/display/DIGITAL/eInvoicing%2Bin%2BGreece)
- [European Commission — European eInvoicing standard](https://single-market-economy.ec.europa.eu/single-market/public-procurement/digital-procurement/einvoicing_en)
- [Supabase — secure product configuration](https://supabase.com/docs/guides/security/product-security)
- [Supabase — securing data](https://supabase.com/docs/guides/database/secure-data)
- [Supabase — platform changelog](https://supabase.com/changelog.md)

Regulatory dates and technical versions are time-sensitive. Recheck the
official sources and provider contract at implementation and again before
production activation.
