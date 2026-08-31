# Anadyon Rental System — Architecture Blueprint

**Written:** 17 August 2026 · **Current as of:** 25 August 2026

This is the living document for *what to build and why*. It is revised in place,
never restated — see `DEFINING-STATEMENTS.md` §9. Revision history is in §10.

**Purpose:** benchmark the build against the platforms a Greek rental operator
would otherwise buy, state honestly where it falls short, and set the
architecture for closing that gap.

A reference document. It records *why* things are built the way they are, so a
decision taken today is not silently reversed in six months. Research findings
are attributed; judgement calls say so.

---

## 1. The field

Sixteen systems examined. They divide into four distinct positions, and knowing
which position a feature comes from matters more than the feature list.

### 1.1 The direct comparison — **Wheelsys**

The benchmark that matters most. Athens-based, founded 2003, **1200+ operators
across 100+ countries**, private-equity backed, ~$4.6M ARR. Powers franchises of
**Europcar, Avis, Sixt, Hertz, Budget, Enterprise, Payless, National/Alamo**.

A Greek company selling to Greek operators, already fiscalised for Greece. This
is the product Anadyon would be buying if it were not being built.

Positioning: *"Sell Online, Book, Rent, Bill, Manage, and Report from a Single
Platform."*

Distinctive: **yield-managed rates**, **stop-sells**, multi-currency, real-time
rate feeds to OTAs and brokers, *"designed for speed at the counter"* and
tablet-friendly UI, **40+ accounting integrations**, customisable and scheduled
email reports, real-time dashboards and alerting, **full card tokenization**,
fiscalisation across Greece, Italy, Bulgaria, Turkey, Croatia, Bosnia, Costa
Rica.

### 1.2 The connected-vehicle position — **Coastr**, **RentSyst**, **Rent Centric**

These sell hardware-adjacent capability. Useful to read for what they consider
table stakes *around* the vehicle.

**Coastr** (UK): Automated Fleet Scheduling and Onboarding, Fleet Maintenance
Management, **Driver & Vehicle Licence Check**, **Immobilisation & Vehicle
Tracking**, **Keyless Entry**, Revenue Management, Customer Portals, Fleet
Management App, **ISO-27001 certified**, GDPR, a marketplace of integrations.

**RentSyst**: Cloud CRM, **Task Manager** ("planner for efficient operation"),
GPS with door locks, engine blocking, overspeeding alerts and fuel-level
monitoring, **timeline and daily-plan views**, a manager reward system,
WordPress plugin / API / iFrame embedding, and broker integrations naming
**CheapCarRent and Economy Car Rentals**.

**Rent Centric** — the widest scope of any examined:
- Assets: car, **motorcycle**, RV, boat, accessible van, golf cart, dealer loaner
- Models: long-term, **vehicle subscription**, buy-here-pay-here, corporate
  fleet, **P2P car sharing**, condo car share
- **"Paperless Counter"**, **"Mobile Agent App" for checkout/check-in**,
  "Contactless Technologies"
- **Real-time License Verification**, **Real-time Insurance Verification**
- **Key Management System**, Integrated Toll Processing, SMS Notification
- Renters Collision Protection, Roadside Assistance
- CRM connectivity (NetSuite, Salesforce, Zoho), Affiliate & Agency Login
- **Smart AI Automated Agents** for bookings, pricing and fleet insights

### 1.3 The incumbents — **TSD**, **RENTALL**

**TSD** (owned by **Reynolds & Reynolds**, the dealership software giant). The
oldest name in the category. Modular: **LOANER**, **REZ** (online reservations),
**Corporate Accounts** (multi-location and franchise health). Integrations with
QuickBooks, Reynolds ERA, Great Plains, Autymate. Depth in insurance-replacement
rentals and dealer loaner programmes.

One line from TSD's own description is worth quoting, because it states the
principle behind a lot of this build:

> the LOANER module *"ensures all required fields are completed before the
> agreement is printed to reduce liability"*

That is exactly why the reservation and customer forms were given a shared
minimum: an incomplete record is a liability, not an inconvenience.

**RENTALL** — Bluebird Auto Rental Systems acquired **Thermeon** and **Navotar**
in 2024, merging three established platforms under one brand. Consolidated
mid-market incumbent.

### 1.4 The adjacent layer — **RentingPilot**

**Not a rental management system.** An AI booking-capture layer that sits in
front of an existing website: *Cara*, an agent answering chat, **WhatsApp** and
**voice**, 24/7, in 30+ languages, turning conversations into structured booking
requests. Website scanning to import fleet and pricing. Demand-based rate
suggestions requiring owner approval. EU-hosted, GDPR.

Worth taking: **out-of-hours WhatsApp and voice capture** genuinely suits an
island operator whose customers are mid-journey. Its pricing intelligence is
demand-heuristic; Anadyon's competitor rate collection is a stronger input to
the same decision and already exists.

### 1.5 The specialists — **Record360**, **ProovStation**, **Self-Inspection**

Standalone condition-capture products the majors bolt on. Their existence as
viable businesses is the strongest evidence that check-in/check-out is where
money is won and lost.

---

### 1.6 The local field — **EzCar**

*Added 25 August 2026.* The eleven systems above are what a Greek operator would
*buy*. This is what the two competitors we actually track *run*.

`lib/competitorRates.ts` scrapes `ionianrentals` and `motorclubzante`. Both
resolve to the same host: `ezcar.eu/<tenant>/vehicle.results.php`. **Ionian
Rentals and Motor Club Zante are not two systems — they are two tenants of one
platform.** So are EasyRent Zante, Zakynthos Car Rentals, EuroAlfa, Acteon and
Syros 4 Seasons. EzCar describes itself as built for Greek rental companies, on
PHP and MySQL.

Practically: scraping those two samples *one* product with two skins, and their
capability ceiling is published rather than guessed.

| EzCar offers | Notes |
|---|---|
| Unlimited vehicles — cars, mopeds, ATVs | Dynamic availability calendar, fleet "top view" |
| Multiple pickup / delivery locations | Parity with ours |
| Rates adjustable at any time; duration and date discounts | Parity |
| Accessories — GPS, baby seat — with or without charge | Parity |
| PayPal, credit card, bank deposit | We have Stripe + Wise |
| Automated daily pick-up / delivery list | We have `/admin/today` |
| **Affiliate system for hotels and travel agencies** | **We have nothing equivalent** |
| Sales statistics | We have per-vehicle margin they do not |

No mobile app, e-signature, damage workflow, telematics or insurance module is
documented — so the counter gap in §3 is a gap against the *vendors*, not against
the local competition, which has none of it either.

**The one thing they have that we do not is the affiliate channel**, and on
Zakynthos that is distribution, not a feature: hotel receptions and travel
agencies book cars for arriving guests. A platform handing partners live
availability and a commission statement competes for supply we never see.

That makes it a different question from OTA distribution, which §8 declines
deliberately. A hotel desk is not a broker: the commission is local and
negotiable, the guest is already on the island, and the relationship stays
direct. Worth building; see §7.1 and phase 4.

**Source:** [ezcar.gr software page](https://www.ezcar.gr/en-software.php) ·
[ezcar.eu](https://www.ezcar.eu/) · tenant paths in `lib/competitorRates.ts`.

---

### 1.7 The 2026 entrants — **CarCEO Pro**, **HQ Rental**, **Rentware**

*Added 25 August 2026.* Three systems absent from the original survey. Two of
them matter, and one of those changes a question this document has never asked.

**CarCEO Pro** — the one to watch. Its own site claims e-signature with
auto-generated PDF contracts delivered over WhatsApp, damage inspection reports
with customer damage history, fuel and mileage monitoring, service-due
notifications, profit and loss per vehicle, 12 languages with RTL, and 34
currencies. Pricing is public: free for 2 vehicles, **$29/month to 10 vehicles,
$129/month unlimited**, $399 for multi-branch and API.

Read that against §7. Phases 1, 2, 4, 5 and 6 — fleet register, condition
capture, digital agreement, per-vehicle margin, service alerts — are what it
sells for $129 a month.

*Verification note:* a third-party comparison credited CarCEO with AI inspection
diagrams, ID fraud detection and 44 contract templates in 19 languages. The
vendor's own site claims none of the AI features and says 12 languages. The
vendor's figures are the ones recorded here; the discrepancy is why §8 of
`DEFINING-STATEMENTS.md` exists.

**HQ Rental Software** — mainstream mid-market. Custom rental agreements with
digital signature captured on phone or tablet, digital inspections with photos,
GPS tracking, payment collection and real-time inventory through a mobile app.
Published pricing starts around $50-120/month depending on source. It occupies
the same ground as Wheelsys (§1.1) but at small-operator prices.

**Rentware** — a German provider focused on the DACH market: bookings,
availability, check-in/check-out, contract and licence management, invoicing,
multi-location, and integrations with Stripe, PayPal, WooCommerce, WordPress and
Channex. Custom pricing. Included because the rest of §1 skews US/UK apart from
the two Greek systems, and an EU vendor carries GDPR alignment as a default
rather than an afterthought.

**Not added, and why.** Booqable and EasyRentPro are general-purpose or thin.
Fleetwire is built around Turo, and §8 declines peer-to-peer. Turo and Getaround
are marketplaces, not software this operator would buy. Fleetio is fleet
maintenance rather than rental — worth revisiting only at §7 phase 6. Adding
them would lengthen this section without changing a single decision in it.

### 1.8 The question §8 has never asked: build or buy the counter?

§8 records what is deliberately **not built**. It has never recorded why the
counter workflow is being **built rather than bought**, because when this
document was written the systems that offered it were enterprise products
carrying enterprise prices and assumptions.

That is no longer true. CarCEO sells phases 1-6 for $129/month, and HQ Rental
sells the same ground from around $50.

Arguments for continuing to build, none of them decisive on their own:

- **AADE.** The Digital Client List and myDATA are Greek statutory obligations.
  Of the sixteen systems surveyed, IOS Rentals and Wheelsys (§1.1) claim them —
  **and GoCars claims them too (§1.10), unverified.** Neither CarCEO nor HQ
  Rental mentions Greek fiscalisation. Treat this as a weaker differentiator
  than it was, pending the §7.1a gate.
- **The competitor rate engine.** Five live feeds into a comparison view appears
  in **none** of the sixteen. It is the one place this system leads, and it
  would not survive a migration.
- **Server-side price verification.** §8b. Not advertised by any of them.
- **The mixed fleet.** Cars, scooters and bicycles in one system — Rent Centric
  and IOS Rentals do this. **GoCars may also (§1.10); bicycle support is
  specifically unverified** and "bikes" in Greek marketing usually means
  motorcycles.
- **Switching cost.** 33 migrations, 17 tables and a live booking flow.

Arguments for buying that the decision below had to answer:

- The counter workflow is the largest remaining build, and it is the part of the
  category that is most commoditised.
- A $129/month subscription against the engineering time in §7 phases 1-4 is not
  a close call on cost alone.
- Every hour spent on condition capture is an hour not spent on the rate
  intelligence that actually differentiates.

#### Decision: build the counter in Anadyon; do not replace or dual-enter

*Decided 25 August 2026, before phase 2.* Anadyon remains the system of record
and the counter workflow is built here, narrowly. CarCEO Pro and HQ Rental are
not adopted as a second operational system and Anadyon is not migrated into
either.

The $129/month comparison is not the price of the architecture Anadyon would
need. A separate counter product must exchange reservations, assigned vehicles,
customers, payments, status changes and evidence without staff re-keying them.
CarCEO's published API sits on its $399 tier, not the $129 tier; HQ Rental's API
and mixed-fleet behaviour are unverified. Neither vendor is recorded in §1 as
supporting cars, scooters and bicycles together. Buying without a proved
round-trip integration would create two sources of truth at the point where a
mistake releases a vehicle or loses evidence.

This is not sunk-cost reasoning. AADE, the competitor-rate engine and the live
booking path can remain outside a bought counter only if the boundary between
the two systems is reliable. No such boundary has been verified, while the
minimum counter data itself is small and fits the reservation, vehicle, damage
and cost model already present. The correct comparison is therefore a narrow
phase-2 build against an API-tier integration plus permanent reconciliation,
not against a standalone $129 subscription.

The decision may be reopened only if one vendor demonstrates, in a trial rather
than a sales claim, all of the following:

- cars, scooters and bicycles in the same account;
- API or webhook round trips for Anadyon reservation IDs, vehicle allocation,
  status and evidence, with idempotency and an export of every record and file;
- no manual duplicate entry and no replacement of Anadyon's pricing, AADE or
  competitor-rate systems;
- EU/GDPR terms, role isolation, audit history, data retention and an exit
  export acceptable for customer identity and damage evidence; and
- a tested tablet workflow whose annual API-tier cost plus integration and
  reconciliation is lower than the bounded phase-2 scope in §4.2.

Until every gate passes, the implementer proceeds with §4.2 and does not run a
second vendor evaluation mid-build.


#### Review of the decision — Claude, 26 August 2026

The decision stands. Three amendments, and one correction accepted.

**Verified independently.** CarCEO's API is on the $399 Enterprise tier, not the
$129 tier — confirmed against the vendor's own pricing. The reframe that follows
from it is the strongest part of this section: the cheap number was never the
relevant number, because a bought counter that cannot exchange reservations,
allocation and evidence is not the same product as one that can.

**Correction accepted.** An earlier note in this document suggested the partner
channel reuse the existing `admin`/`staff` role model. §7.1 is right to reject
that. An external partner is a tenant, not a member of staff, and putting hotels
inside the internal authorisation model would have made every future permission
change a cross-tenant risk.

**Amendment 1 — the third option is missing.** The decision is framed as build
everything against replace everything. §1.5 already records Record360,
ProovStation and Self-Inspection: point solutions for timestamped condition
evidence, designed to integrate rather than to own reservation state.

The decision's central objection is two sources of truth "at the point where a
mistake releases a vehicle or loses evidence". That objection is materially
weaker for a capture-only tool: it holds no reservation, no allocation and no
status, and writes photos and a reference back. The reconciliation surface is a
file and an ID, not an operational state machine.

This does not change the outcome for the counter as a whole. It does mean the
photo-storage half of §4.2 — `handover_photos`, retention, and the durability
of damage evidence years later — has a buy option that has not been examined.
Either dismiss it here with a reason, or record it as open. Skipping it leaves
§1.5 in the document with nothing depending on it.

**Amendment 2 — neither side is costed.** "A narrow phase-2 build against an
API-tier integration plus permanent reconciliation" is the correct framing, and
it is not yet a comparison. Nothing in this section estimates the phase-2 build:
tables, screens, and the tablet flow in §4.2. A decision taken deliberately
before phase 2 should carry that estimate, or it cannot be checked later against
what the build actually cost — which is the only way the reopening gates ever
get exercised honestly.

**Amendment 3 — say that the gates are near-prohibitive.** Five conditions, all
demonstrated in a trial rather than claimed. That is a defensible bar for a
system of record, and it is close to unreachable in practice. As written the
section implies a live option. Stating plainly that reopening is unlikely, and
that the gates exist to make the decision falsifiable rather than to invite a
vendor evaluation, is more honest and does not weaken the decision.

**Minor.** "only IOS Rentals and Wheelsys (§1.1)" — IOS Rentals has no section
of its own; it appears in the §2 table and the header note. Inherited from my
own text, not introduced here.

**Not disputed:** §7.1's phasing and its exclusion list; the commission snapshot
on the reservation; commission payable only after a returned and paid rental
with explicit ledger reversals; §7.2 placing area 5 before the phase-2 migration
because legal determines what is lawful to store and charge; and the frozen-pane
closure criteria, which correctly refuse stylesheet rules, unit tests and
hand-written reproductions as evidence.


#### Architect adjudication — 26 August 2026

The review above was right to raise capture sourcing and wrong to leave it open.
`AGENTS.md` asks the architect for a section that can be built from without
asking questions; "either dismiss it here or record it as open" is the opposite
of that. This resolves it.

**Anadyon remains the system of record** for handovers, damage observations and
evidence metadata. A capture provider may later act as an *input adapter*, but
Anadyon always ingests and retains its own durable copy of the original
evidence. It never depends on an expiring vendor URL, and no vendor holds the
only copy of a photograph that has to defend a charge years later.

**One bounded evaluation, inside Gate 0**, before the native capture UI is
built: two business days, Record360 only. It must produce, in writing:

- pricing for 29 mixed assets;
- DPA, data location and retention terms;
- complete media export terms;
- API and webhook access terms; and
- proof that cars, scooters and bicycles can carry *different* inspection
  templates.

If any of those is unavailable, or a real iPad and Android trial does not
succeed, the implementer proceeds with native capture under §4.2. The
evaluation does not reopen the decision to build the counter here, and must not
delay the rest of phase 1.

**Two corrections to the review's own reasoning, accepted.** "A file and an ID"
understated the work: an adapter still needs vehicle mapping, task creation,
outbound reservation context, webhook authentication and replay handling,
lifecycle and status mapping, media retrieval and retention, template version
mapping, and GDPR export and deletion. And the three vendors in §1.5 are not
interchangeable for this purpose — ProovStation and Self-Inspection sell
AI-assisted damage analysis, which §8 declines, so only Record360 fits the
adapter shape. Naming all three as one option was imprecise.

**Costing.** No speculative figure is inserted here. Gate 0 produces a work
breakdown covering database and functions, storage and evidence handling, the
tablet capture UI, damage and adjustment workflows, automated and
physical-device testing, and rollout with ongoing support — then a three-year
native-build against capture-vendor total. A decision recorded before phase 2
can only be checked afterwards if the estimate exists.

**Sources:** [carceo.pro](https://carceo.pro/) ·
[HQ Rental via SoftwareAdvice](https://www.softwareadvice.com/retail/hq-rental-profile/) ·
[HQRent feature overview](https://hqrent.com/rental-features) ·
[Rentware via Capterra](https://www.capterra.com/p/182136/Rentware/)

---

### 1.9 Benchmark stop rule

The benchmark stops at sixteen systems. No product is added merely because it
exists or repeats a capability already represented here. Add one only when
primary vendor evidence would change one of these decisions: build versus buy
the counter; Greek fiscalisation; mixed-fleet support; the local partner
channel; or a deliberate exclusion in §8. If it changes no decision, recording
it creates maintenance rather than knowledge.

---

### 1.10 The Greek specialist — **GoCars.online**

*Added 26 August 2026, and immediately downgraded — read the epistemic note
before using anything here.*

A Greek vendor selling rental software into this exact market. It qualifies for
inclusion under §1.9 because it bears on Greek fiscalisation, mixed-fleet
support and the local partner channel — three of the five named triggers.

**Vendor claims, none independently verified:** a Digital Client Registry with
real-time myAADE and myDATA submission; electronic contracts with e-signature;
an agent portal with per-agent sales tracking and commission reporting; Greek
bank rails (Piraeus, Alpha, Eurobank, National) alongside Viva Wallet, Stripe
and PayPal; a customer self-service portal; and booking, pricing and reporting
tooling. Pricing is not published.

#### Epistemic note — why none of that is treated as established

The first pass over the vendor's feature page produced a confident table
including bicycle support, and the absence of any damage or condition-capture
feature. **A second read of the same page reproduced neither.** It found no
mention of bicycles, motorcycles, an API, damage records or photo check-in at
all.

One of those reads is wrong and there is no way to tell which from here. What
can be said is that the section was written as though a summary were evidence,
which is the failure `DEFINING-STATEMENTS.md` §8 exists to prevent, and it was
then used to weaken three arguments in §1.8.

Specifically flagged as **unverified**, not as absent:

- **Bicycles.** "Bikes" in Greek marketing commonly means motorcycles. Cars are
  clearly supported; motorcycles probably; bicycles unknown.
- **An API.** Reported elsewhere as available "upon agreement" — scope,
  availability and contractual access all unknown.
- **Damage records and photo/video check-in.** Reported elsewhere as existing
  and as *upcoming* respectively. The earlier claim here that GoCars has no
  condition capture was not supportable; a feature page that does not mention
  something is not a vendor that does not have it.

**Consequence for §1.8.** The arguments there are annotated rather than
rewritten: an unverified vendor claim is not grounds to withdraw a decision, and
it is not grounds to leave a superseded statement standing either. See the
annotations in §1.8 and the gate in §7.1a.

**Source:** [gocars.online/charaktiristika](https://gocars.online/charaktiristika/)
— one page, read twice, with different results.

---

## 2. Feature comparison

✅ built · ⚠️ partial · ❌ absent · — not applicable at this scale

| Capability | Anadyon | Seen in |
|---|---|---|
| Reservations lifecycle | ✅ | all |
| Online booking engine | ✅ | all |
| Seasonal + duration rate bands | ✅ | Wheelsys, RENTALL |
| Promotions, discount rules | ✅ | Wheelsys, IOS Rentals |
| **Live competitor rate collection** | ✅ | **none** |
| Card tokenization, no PAN stored | ✅ | Wheelsys, Coastr |
| **Server-side price verification** | ✅ | not advertised by any |
| Greek fiscalisation (AADE myDATA) | ✅ | Wheelsys, IOS Rentals |
| AADE Digital Client List | ⚠️ columns present, unproven | IOS Rentals |
| **Multi-asset (car + motorbike + bicycle)** | ✅ | only Rent Centric |
| SMS notification | ✅ `/api/admin/sms` | Rent Centric |
| Fleet register with statutory dates | ✅ | Coastr, Wheelsys |
| Cost tracking per vehicle | ✅ | Coastr, RENTALL |
| Maintenance scheduling | ⚠️ dates only, no scheduler | Coastr, Navotar, RentWorks |
| Damage log | ⚠️ schema only, no UI | all |
| **Counter / paperless check-out & check-in** | ❌ | Wheelsys, Rent Centric, TSD |
| **Condition capture with photos** | ❌ | Record360, ProovStation, Coastr |
| **Digital agreement + signature** | ❌ | TSD, Rent Centric, Coastr |
| **Stop-sells (withdraw for a date range)** | ❌ | Wheelsys |
| **Licence verification** | ❌ stored, never checked | Coastr, Rent Centric |
| Utilisation / RevPAV reporting | ❌ | Wheelsys, RENTALL, Nomora |
| Real-time dashboards + alerting | ⚠️ one daily cron | Wheelsys, Coastr |
| Scheduled email reports | ❌ | Wheelsys |
| Task manager / daily plan view | ❌ | RentSyst |
| Accounting integrations | ⚠️ AADE only | Wheelsys (40+), TSD |
| Customer portal | ❌ | Coastr, Rent Centric |
| OTA / broker distribution | ❌ **deliberate** | Wheelsys, RentSyst |
| Yield-managed rates | ❌ | Wheelsys, Coastr |
| GPS / telematics / immobilisation | ❌ **deliberate** | Coastr, RentSyst, Rent Centric |
| Keyless entry, key management | — | Coastr, Rent Centric |
| Toll processing | — | Rent Centric |
| Franchise, multi-location | — | Wheelsys, TSD |
| Vehicle subscription, P2P sharing | — | Rent Centric |

**Two positions worth noticing.**

*Above par:* live competitor rate collection appears in **none** of the eleven.
And **multi-asset support** — cars, scooters and bicycles in one system — appears
only in Rent Centric, which sells it as a headline. Anadyon does it already.

*Behind:* everything between the customer arriving and the vehicle returning.

---

## 3. The counter gap

Wheelsys advertises *"designed for speed at the counter"*. Rent Centric sells a
**"Paperless Counter"** and a **"Mobile Agent App"** for checkout and check-in.
Three vendors exist solely to serve condition capture. This is the category's
centre of gravity, and Anadyon has none of it.

The reason is disputes. Timestamped condition photographs are what make a damage
charge defensible. Without them the operator either absorbs damage they cannot
prove, or charges for damage they cannot evidence.

```
CHECK-OUT                          CHECK-IN
  identity + licence verified        odometer in
  odometer out                       fuel level in
  fuel level out                     condition photos (same angles)
  condition photos                   compare against check-out
  damages noted as pre-existing      new damage → damage record
  agreement signed                   charges settled
  keys released                      deposit released or withheld
                                     turnaround clock starts
```

That last line connects to §5: turnaround is the state a vehicle *enters* at
check-in, not a scheduling nicety.

---

## 4. Data model

### 4.1 Built

```
vehicles            registration, KTEO, road tax, insurance, service,
                    odometer, purchase, turnaround_minutes, transmission
vehicle_costs       typed outlay per vehicle, dated, with period coverage
vehicle_damages     description, severity, repair cost, charged_to_customer,
                    linked reservation, photo
```

### 4.2 The counter

```
rental_handovers
  id uuid PK
  reservation_id uuid NOT NULL FK reservations ON DELETE RESTRICT
  vehicle_id uuid NOT NULL FK vehicles ON DELETE RESTRICT
  direction ('out' | 'in')
  status ('draft' | 'completed' | 'voided')
  client_operation_id uuid UNIQUE NOT NULL
  inspection_template_id uuid NOT NULL
  created_by, completed_by uuid FK auth.users ON DELETE SET NULL
  staff_name_snapshot text
  occurred_at, completed_at, created_at, updated_at timestamptz
  UNIQUE (id, inspection_template_id)        -- referenced by handover_photos
  odometer_km integer NULL CHECK >= 0
  fuel_eighths smallint NULL CHECK 0-8
  cleanliness ('clean' | 'acceptable' | 'poor') NULL
  notes, void_reason

handover_photos
  id uuid PK, handover_id uuid NOT NULL FK rental_handovers
  inspection_template_id uuid NOT NULL      -- carried so the pair below can be enforced
  template_view_id uuid NOT NULL, sequence smallint NOT NULL
  FK (handover_id, inspection_template_id) -> rental_handovers (id, inspection_template_id)
  FK (inspection_template_id, template_view_id) -> inspection_template_views (template_id, id)
  object_path text UNIQUE NOT NULL, mime_type, byte_size, width_px, height_px
  sha256, captured_at, uploaded_at, captured_by
  UNIQUE (handover_id, id)                   -- referenced by handover_damage_photos

inspection_templates
  id, vehicle_category, version, active, created_at

inspection_template_views
  id, template_id, view_code, label, sort_order, required
  UNIQUE (template_id, view_code)
  UNIQUE (template_id, id)                   -- referenced by handover_photos

handover_damage_observations
  id, handover_id, damage_id FK vehicle_damages,
  observation ('pre_existing'|'unchanged'|'worsened'|'new'), notes
  UNIQUE (handover_id, damage_id)
  UNIQUE (handover_id, id)                   -- referenced by handover_damage_photos

handover_damage_photos
  handover_id uuid NOT NULL                 -- carried so both sides can be pinned
  observation_id, photo_id
  PRIMARY KEY (observation_id, photo_id)
  FK (handover_id, observation_id) -> handover_damage_observations (handover_id, id)
  FK (handover_id, photo_id)       -> handover_photos (handover_id, id)

reservation_adjustments
  id, reservation_id, handover_id, damage_id NULL,
  kind ('fuel'|'mileage'|'damage'|'cleaning'|'other'),
  description, quantity, unit, unit_rate, amount numeric(10,2) CHECK >= 0,
  currency 'EUR', calculation_snapshot jsonb,
  status ('proposed'|'approved'|'waived'|'posted'),
  approved_by, approved_at, waived_reason, posted_at, created_at

rental_handover_events
  id, handover_id, event_type ('completed'|'corrected'|'voided'),
  actor_user_id, reason, before_state jsonb, after_state jsonb, created_at
```

**Verified starting state, 25 August 2026:** the live database has
`reservations`, `vehicles`, `vehicle_damages` and `vehicle_costs`; it does not
have `rental_handovers` or `handover_photos`. The private
`reservation-documents` bucket exists. Phase 2 therefore adds new structures;
it must not repurpose identity-document storage or claim the counter schema is
already present.

One non-voided handover per reservation and direction is enforced with a
partial unique index. `client_operation_id` makes a tablet retry return the
same draft/completed handover rather than create another. `vehicle_id` is
stored on the handover even though the reservation also has it: it is the
physical unit that was actually presented, and later reallocation must not
rewrite history.

`staff_name` alone was wrong. The actor is the authenticated user ID; the name
snapshot preserves what staff saw if that user is later renamed or removed.

`signature_url` was also wrong. Signature belongs to the versioned rental
agreement in phase 3, not to an odometer/fuel record, and a signed URL expires.
Phase 2 may require the existing `reservations.agreement_signed_at` (including
the current paper process) before check-out, but it does not invent a second
signature source.

Photographs are a table rather than columns because the count varies and angles
must be comparable between out and in. `photo_1..photo_6` would make the
comparison positional and fragile. The comparison set is a versioned template,
because a car, scooter and bicycle do not require the same views. Both the out
and in handover for one reservation use the same template version.

Photographs store the immutable private Storage object path, never a public or
signed URL. `captured_at` is useful device metadata but `uploaded_at` is the
server evidence time. MIME type, byte size, dimensions and SHA-256 are recorded
so the evidence can be validated and an object replacement detected. The
private `handover-photos` bucket uses UUID paths, an explicit size/MIME allowlist
and no direct `anon`/`authenticated` policies; reads and writes go through the
authorised admin API.

**Fuel in eighths:** what the gauge shows and what staff read without
arithmetic. A percentage invites false precision and argument. It is nullable
for bicycles and any vehicle without a fuel gauge; the finalisation service
decides required fields from the assigned vehicle category. Odometer is also
nullable where the physical unit has no instrument. Do not write invented zero
readings to satisfy a form.

`vehicle_damages` remains the lifecycle record: discovered, attributed,
charged/absorbed, repaired. A handover observation is the immutable statement
of what staff saw at that moment. A new check-in damage creates the damage and
its `new` observation in the same database transaction; an out handover records
the open damage rows as `pre_existing`. New code stops writing the legacy
single `vehicle_damages.photo_url`; evidence is linked through
`handover_damage_photos` so one damage may have several before/after/detail
images.

Raw facts and money are deliberately separate. Fuel, mileage and damage do not
silently alter the original quoted total. They create itemised
`reservation_adjustments`; approval or waiver is explicit and auditable. The
customer balance is the agreed rental amount plus approved adjustments minus
payments. A waived item remains visible rather than being deleted.

Phase 2 does **not** invent automatic fuel or mileage tariffs. Automation needs
operator-approved tank capacities, included-distance terms, per-unit rates and
customer wording that do not yet exist. The first release records the measured
difference and lets authorised staff enter/approve an itemised adjustment;
`unit_rate` and `calculation_snapshot` preserve how that amount was reached.
`posted` means transferred to the reservation/invoice balance, not that a card
was charged. Payment remains in the payment system and no handover action may
charge a stored payment method automatically.

All times are stored as `timestamptz` and displayed in Europe/Athens for the
Zakynthos operation. Completion time is server-authored. If staff record an
earlier real-world occurrence after a connectivity delay, the difference and
reason are written to the event log; device time alone is not legal evidence.

**Finalisation rules — one short server-side transaction:**

1. Lock the reservation and assigned vehicle; never call Storage, email or a
   payment provider while locks are held.
2. Check-out requires a confirmed reservation, an assigned eligible vehicle,
   no maintenance/statutory/date block, a non-expired driving licence, the
   required template views, a cleanliness value (with notes when `poor`) and a
   recorded agreement signature. It atomically completes the out handover and
   changes the reservation to `active`.
3. Check-in requires an `active` reservation and a completed out handover. It
   validates inbound odometer against outbound, creates any new damage and
   proposed adjustments, updates `vehicles.odometer_km`, completes the in
   handover and changes the reservation to `returned`.
4. A completed handover is not normally editable or deletable. A correction
   requires a reason and writes before/after state to
   `rental_handover_events` in the same transaction. Voiding is the same kind
   of audited action, not a DELETE.
5. Every foreign key is indexed. Operational indexes are
   `(reservation_id, direction)`, `(vehicle_id, completed_at DESC)`,
   `(handover_id, template_view_id)` and partial indexes for drafts/proposed
   adjustments. The expected queries are written before adding more indexes.
6. Every new public-schema table has RLS enabled and all privileges revoked
   from `PUBLIC`, `anon` and `authenticated`. The browser never receives the
   service-role key.

   **Finalisation runs through a two-layer pattern, because a private schema is
   not reachable the way this codebase calls the database.** All nine existing
   call sites use `supabaseAdmin.rpc(...)`, which goes through the Supabase Data
   API, and that API only exposes configured schemas. There is no Postgres
   driver in `package.json`. A function in a genuinely non-exposed schema would
   therefore be uncallable — the earlier wording here specified something that
   could not be built.

   - a **thin gateway function in `public`**, which is what the server route
     calls;
   - it verifies `auth.uid()` against database-held staff membership — never a
     JWT claim — then calls the real implementation in a private schema;
   - `SECURITY DEFINER` only where it is actually required, always with
     `SET search_path = ''` and every object fully qualified. A `SECURITY
     DEFINER` function with a mutable search_path is a privilege-escalation
     path, not a convenience;
   - EXECUTE revoked from `PUBLIC` and `anon`, granted only to the role that
     needs it.

   > **OPEN — this gateway cannot work as written, and the fix is not decided.**
   > *Raised 28 August. Do not implement §4.2's finalisation against this
   > pattern until it is resolved.*
   >
   > Every non-test `.rpc()` call site in the repository uses `supabaseAdmin` —
   > the service role. Under a service-role key **`auth.uid()` returns NULL**,
   > because there is no end user in that request. So a gateway that "verifies
   > `auth.uid()` against database-held staff membership" either rejects every
   > call, or is written permissively enough to let every call through — and the
   > permissive version is the dangerous one, because it looks like an identity
   > check and is not.
   >
   > This is the *second* time this section has specified a mechanism that
   > cannot work given how the application actually reaches the database. The
   > first was the private schema, corrected immediately above. Correcting it
   > with another untested mechanism would be the third.
   >
   > Resolving it is an architecture decision with a real code footprint —
   > roughly, whether privileged routes stop using `supabaseAdmin` and construct
   > a user-scoped client from the staff member's access token — and it is
   > deliberately **left open** rather than answered here. The options, the
   > trade-offs and what has been verified are written up in
   > `docs/OPEN-QUESTION-RPC-STAFF-IDENTITY.md`, which is the document to read
   > and to put in front of an outside reviewer.

   Grants are stated explicitly in the migration. Supabase no longer guarantees
   that a newly created public table is reachable through the Data API — grants
   and RLS are separate controls, and assuming either implies the other is how
   a table ends up either unreadable or over-exposed.
7. **A photo cannot reference a view from a different template.**
   `handover_photos` carries `inspection_template_id`, with a composite foreign
   key to `rental_handovers (id, inspection_template_id)` and another to
   `inspection_template_views (template_id, id)`. Without both, a scooter photo
   can be filed against a car's template view and the out/in comparison silently
   compares different things.
   Postgres refuses a composite foreign key unless the referenced columns carry
   a unique constraint, even where one of them is already the primary key — so
   `rental_handovers (id, inspection_template_id)` and
   `inspection_template_views (template_id, id)` each need one adding. They are
   in the schema above.
8. **The inbound handover uses the outbound handover's exact template.** The
   rule is stated elsewhere in this section and nothing enforced it: the schema
   lets each handover pick its own `inspection_template_id`, so an out/in
   comparison could silently compare a car template against a scooter one. The
   finalisation function, holding the reservation lock, requires that where a
   completed `direction = 'out'` handover exists for the reservation, the
   inbound handover's `inspection_template_id` equals it — and refuses
   otherwise. A regression test covers the concurrent case, where two
   finalisations race, not only the accidental one.
9. **A damage photo belongs to the same handover as its observation.**
   `handover_damage_photos` carries `handover_id`, with composite foreign keys
   to `handover_damage_observations (handover_id, id)` and
   `handover_photos (handover_id, id)`. Evidence attached across handovers is
   worse than no evidence: it looks defensible and is not.

Photo upload is a short saga, not a cross-service transaction: create/reuse the
draft, upload each object, persist verified metadata, then finalise only when
required objects exist. A failed upload leaves a resumable draft; a scheduled
cleanup may remove abandoned draft objects after the documented retention
window. Evidence belonging to a completed handover follows the legal retention
policy and is not removed by ordinary customer or reservation cleanup.

At rollout, active rentals that began before phase 2 are not given fabricated
photographs or readings. Staff either capture an explicit
`legacy_cutover` baseline before return or complete a check-in marked
`baseline_missing` with a mandatory reason. The UI and reporting must keep
those rows distinguishable from complete evidence.

**Built for a tablet, not a desktop.** Rent Centric's "Mobile Agent App" and
Wheelsys's tablet-friendly counter both exist because this is done standing next
to a car, not at a desk.

**Phase-2 acceptance gate:** the real authenticated tablet flow must prove
draft resume, double-submit idempotency, simultaneous finalisation conflict,
required-view enforcement, out/in comparison, damage creation, adjustment
approval/waiver and both reservation status transitions. Each regression test
is first run against unfixed code and seen to fail. At least one physical iPad
and one Android Chrome device complete the flow; viewport emulation alone is
not evidence of touch behaviour.


### 4.2a Evidence survives a restore, or it is not evidence

*Added 26 August 2026, corrected 27 August after reading what already exists.*

**What is already in place, and is better than this section first implied.**
`.github/workflows/backup.yml` runs nightly: a full dump including roles and
schema — not a data-only export, which is what turns a restore into a
reconstruction — refused if empty or truncated, compressed and encrypted with
`openssl aes-256-cbc` at 600k iterations, **verified to decrypt and list before
it is trusted**, uploaded to Cloudflare R2 with a monthly copy retained, pruned,
and alerting to Telegram *only on failure*, because a nightly success message
trains people to ignore it.

That is a real backup with a real recovery check. The gap is narrower and
sharper than "backups are missing".

**The gap: Supabase Storage objects are not backed up.** Nothing in
`backup.yml` or `scripts/backup.mjs` touches `/storage/v1` or a Supabase
bucket — the "storage" in that workflow is R2, the destination. Today that costs
nothing, because no bucket holds anything that matters. **Phase 2 changes that
completely.** A restore would return every handover row, every damage
observation and every photo *reference*, and not one photograph: a system that
looks intact and cannot defend a single charge.

Before phase 2 ships:

- the photo bucket is included in the nightly job, encrypted, to the same R2
  destination;
- the bucket has versioning or overwrite protection, so a re-upload cannot
  quietly replace the image a dispute depends on;
- metadata and the recorded SHA-256 hashes are backed up in step with the
  objects, so a half-restored pair is detectable;
- retention and deletion follow §4.2b rather than living only in the backup;
- the restore is **tested, not documented**, and the test asserts a restored
  file still hashes to its record.

That last check is the one that matters. A backup that restores a file which no
longer matches its hash has restored something, but not evidence.

### 4.2b Retention and destruction

*Added 27 August 2026.* **The published privacy policy already promises what the
system cannot do.** It offers erasure under Article 17 and states retention
limits. The codebase has no retention field, no purge job and no erasure path —
`grep` finds the promise in `lib/i18n/content/legal.ts` and nothing that
performs it. Phase 2 makes this materially worse by adding identity documents
and photographs of vehicles taken with customers present.

The tables already hold `dob`, `driving_licence_number`, `driving_licence_expiry`,
`passport_number`, `passport_expiry` and `vat_number`.

**Two of the periods are already published, and this section previously said
they were undetermined.** *Corrected 28 August.* `lib/i18n/content/legal.ts`
commits Anadyon publicly to **five years from the rental date** for booking and
contract data, and **twelve months** for contact requests that do not become
bookings. Those are promises made to customers, not open questions.

That changes area 5's task. It is not *set the periods*; it is **validate the
periods already promised, and make the system honour them** — and if area 5
concludes different ones are correct, the privacy policy is a versioned change
to a public document, on data collected under the version it replaces. That is a
larger act than an internal architecture decision and should be recognised as
one.

The periods still genuinely open are the ones the policy does not name: identity
images, damage evidence, and marketing consent. Greek accounting and myDATA
obligations, the rental agreement itself, and identity documents carry different
lifetimes, and one of them being longest does not license keeping everything
that long. What this section fixes either way is that the *mechanism* is missing
regardless of what any period turns out to be.

Required before phase 2 ships:

- **A retention class on every table holding personal data** — not a global
  policy. Accounting records, agreements, identity documents and marketing
  consent expire on different clocks.
- **A scheduled purge that *proposes*, and a person who confirms.** *Amended 30
  August, by Tasos: "the purge should not be automatic. The admin should get a
  prompt and only after approving twice would the data be purged."*

  This section originally said "a scheduled purge that runs". It now runs and
  stops short of deleting. The reasoning for the change is sound and is the same
  one behind `ON DELETE RESTRICT` on the handover tables: an irreversible
  destruction driven by a date calculation is one arithmetic bug away from
  destroying records that tax law requires be kept, and there is no undo.

  **The mechanics, and one distinction that matters.** "Approving twice" here
  means two deliberate confirmations by the same administrator — the
  type-the-word-DELETE shape — **not** the four-eyes queue from migration 038.
  With a single administrator, four eyes on their own action deadlocks, which
  §7 already settled for fleet edits; the same reasoning applies and the same
  trap is worth naming, because the queue exists and is the obvious thing to
  reach for.

  **The risk this introduces, which is not smaller than the one it removes.**
  Retention is an obligation, not an option. A purge that nobody approves for
  eighteen months is a breach of the published twelve-month promise — and a
  worse breach than an automatic job failing, because the system generated a
  prompt and a person did not act on it. Unattended negligence is bad;
  *documented* negligence is what a regulator reads. This project's own record
  is the argument: the audits sat ungraded for twelve days and the RPC
  diagnostics sat unrun; a recurring approval is exactly the kind of task that
  does not happen.

  **So the design keeps the veto and refuses to let it be silent:**

  1. the job runs on schedule and computes what is **due**, deleting nothing;
  2. it records the proposal, so what was due and when is provable later;
  3. an administrator reviews and confirms twice, and only then is anything
     destroyed;
  4. **an unapproved proposal escalates rather than waiting.** It appears in the
     morning briefing, and overdue items are named with their age — the same
     shape `blockChase()` already uses for a vehicle out of the fleet. A pending
     purge is a compliance clock running, and it must look like one.

  The record still matters as much as it did: a purge nobody can prove executed
  is indistinguishable from one that never did — and now so is a purge nobody
  can prove was *proposed*.

- **Anonymisation is the part that should not need a prompt.** Where deletion is
  forbidden but the data is no longer needed — a five-year tax record that does
  not require the driver's passport number — the operation removes a field from
  a row that survives. It is far less destructive than a purge, it is the
  action GDPR most often actually requires, and putting it behind the same
  confirmation would make the safe option as slow as the dangerous one. Proposed
  as automatic; area 5 confirms.
- **An erasure path** that satisfies a real Article 17 request: it deletes what
  it may, retains what it must, and returns to the requester which of the two
  applied to each category. "We deleted everything" is a lie whenever tax law
  says otherwise.
- **Destruction covers Storage as well as rows.** A purged `handover_photos`
  row leaves the JPEG in the bucket. The object must go, and the deletion must
  be verifiable.
- **Anonymisation where deletion is not permitted** — a rental that must survive
  for tax purposes does not need the driver's passport number attached to it.
- **An `unconverted_enquiry` class.** The twelve-month promise for contact
  requests that never became bookings is the most specific commitment in the
  published policy and the one with no mechanism behind it at all. It is not
  covered by any of the classes above.
- **Erasure is reconciled with the backups.** *Added 28 August, and it is a
  direct collision with §4.2a.* The nightly job keeps **30 daily and 12 monthly**
  encrypted archives in R2. An Article 17 erasure removes the row from the live
  database and leaves the person's data recoverable from those archives for up
  to a year — and a restore silently reinstates it, which is erasure undone by
  the disaster-recovery procedure. The resolution is **not** to rewrite
  archives: they are encrypted, immutable and the thing being relied on. Keep a
  **suppression list** of completed erasures and re-apply it as a mandatory step
  of any restore, and state that step in `RESTORE.md` so it cannot be skipped by
  whoever is restoring at the time. Neither section mentioned the other before
  this note.
- **The privacy policy is re-read against what the system actually does**, in
  area 5. Whichever of the two is wrong gets corrected; today they disagree.

---

### 4.2c The tablet: capture, and whether it can take money

*Added 27 August 2026, answering two operational questions directly.*

**Onboarding and delivery on one tablet: yes, and that is already the design.**
§4.2 is tablet-first. One device at the car handles identity capture, the
condition photographs, odometer and fuel, the damage acknowledgement and the
signature, then finalises. The §4.2 acceptance gate requires a real iPad and a
real Android device to complete that flow before it ships — viewport emulation
does not count.

**The same tablet taking payment is a different question, and the answer is
probably no on an iPad.**

- **Apple's Tap to Pay is iPhone-only.** An iPad cannot accept a contactless
  card by itself. *Verify with the acquirer before committing hardware* — this
  is stated from general platform knowledge, not from a quote.
- **Android soft-POS can.** A suitable Android tablet or phone can accept
  contactless without extra hardware, which makes the "one device at the
  airport" model achievable on Android and not on iPad.
- **A paired reader works on either.** SumUp, Viva Wallet or Stripe Terminal
  over Bluetooth — a second object to carry, charge and not lose, but it works
  with the tablet already being used for capture.
- **A payment link needs no hardware at all.** The customer pays on their own
  phone; Stripe links already exist in this system. It fails when the customer
  has no data at the airport, which on an island is not rare.

**What this means for delivery away from the office:** the decision is hardware,
not software, and it is a Gate 0 decision because it determines what the counter
UI must support. The system should treat "payment taken" as a fact recorded
against the reservation, whatever instrument produced it — a reader, a soft-POS
tap, or a link the customer paid an hour earlier. Coupling the counter flow to
one payment method would make a hardware choice expensive to reverse.

Viva Wallet is worth evaluating first: it is Greek, already appears in the
market survey, and covers both soft-POS and readers.

---


### 4.2d Producing a rental's full file, on demand

*Added 27 August 2026, in answer to: what happens when a tax inspection asks for
everything about one rental?*

Today the answer is a person opening several admin screens and a storage bucket
and hoping they found all of it. That is a bad answer during an inspection and a
worse one during a dispute, and it gets harder the moment phase 2 adds
photographs.

**One export, keyed by reservation, producing everything that rental touched:**

- the reservation, its quote, and the customer record as it stood;
- the signed agreement, with its template version;
- both handovers — odometer, fuel, cleanliness, staff, timestamps;
- every photograph, as files, with their SHA-256 hashes and capture times;
- damage observations and any adjustments, with their reasons;
- payments, refunds and deposit movements;
- the AADE submission and the invoice, with their identifiers;
- every email and SMS sent, with delivery state from
  `booking_email_deliveries`;
- an index file listing all of the above with hashes, so the package can be
  shown to be complete and unaltered.

**Design constraints that matter more than the format.** It is generated from
the database, never assembled by hand — a hand-built package is unreproducible
and unverifiable. It is idempotent: the same reservation exported twice
produces the same content, so two exports can be compared. Producing one is an
admin action that is itself logged, because exporting a customer's complete
file is a privileged act. And it respects §4.2b: an export run after a purge
shows what was destroyed and under which rule, rather than silently omitting it.

**An Article 15 subject-access request shares the engine, not the output.**
*Corrected 28 August; this previously said the two were "materially the same
package with a different recipient", and that is wrong in a way that would leak.*
They differ on all three of scope, redaction and recipient:

- A tax inspection wants the business's records — the AADE submission, the
  invoice, staff attribution, the internal adjustment reasons.
- A subject-access request is bounded to **one person's** personal data, and
  Article 15(4) requires that producing it not adversely affect the rights of
  others. The second driver's licence details, another customer visible in the
  same evidence, staff identities and internal commentary about the requester
  are all either out of scope or redacted.

Build one export engine with two named packages and two selection rules. Sending
a tax package to a data subject would disclose other people's data under the
banner of a GDPR right.

---

### 4.2e How long identity documents may be kept — and the distinction that matters

*Added 27 August 2026. Researched, not settled — area 5 decides.*

The instinct is that a rental business must keep licence and passport images for
years. The research does not support that as stated, and the distinction is the
whole point:

- **The transaction record** — the agreement, the invoice, the accounting
  entries — is what tax and commercial law reach. Greek rental operators'
  published policies commonly state **five years from completion of the rental**
  for booking and contract data, citing Greek tax and commercial obligations —
  **and so does ours**, in `lib/i18n/content/legal.ts`. This section originally
  cited the practice as an external observation without noticing that Anadyon
  has already adopted it publicly. See §4.2b.
- **A photograph of a passport is not the transaction record.** The obligation
  is to have verified identity and to hold the contract; it does not
  automatically license storing the image of the document for the same period.
  Under GDPR retention is purpose-driven, not time-driven: data may be kept only
  while a lawful basis still applies, and "the tax code says five years for the
  invoice" is not a basis for holding a passport scan for five years.

**Therefore the system must treat them as separate retention classes**, which is
what §4.2b requires. The agreement and the invoice live on one clock; identity
images live on their own, probably much shorter, quite possibly "verify, record
that verification happened, and do not store the image at all".

**What area 5 must return**, and what this document will not guess:

- the retention period for each class — agreement, invoice, identity image,
  damage evidence, marketing consent;
- whether storing identity images has a lawful basis at all, or whether
  recording *that* a licence was checked, its number and its expiry is
  sufficient;
- whether damage photographs may be kept beyond the rental's tax life on a
  legitimate-interest basis for dispute defence, and for how long;
- and whether any of it changes when the driver is not the customer.

I could not find a Hellenic DPA decision specifically about car-rental identity
copies. **Absence of a decision is not permission** — that is the same error as
reading a silent feature page as an absent feature (§1.10). This needs a Greek
practitioner, not more searching.

---

### 4.3 Stop-sells

```
vehicle_blocks
  id, vehicle_id, starts_on, ends_on,
  reason ('maintenance'|'kteo'|'insurance_lapsed'|'sold'|'owner_use'|'other'),
  notes, created_at
```

Wheelsys's term. Anadyon has no equivalent: a vehicle can only be withdrawn by
changing its status, which removes it from *every* date rather than a period.
Statutory expiry should raise one automatically — a vehicle past KTEO is not
merely inadvisable to rent, **its insurance is void**.

### 4.4 Derived reporting — no new tables

| Metric | Computation | Benchmark |
|---|---|---|
| **Utilisation** | rental days ÷ available days | >70% healthy, 70–85% target |
| **RevPAV** | revenue ÷ available vehicle days | primary revenue KPI |
| Average rental length | mean `rental_days` | trend, not target |
| Turnaround achieved | check-in → next check-out | against `turnaround_minutes` |
| Maintenance ratio | `vehicle_costs` ÷ revenue | under 15% |
| **Margin per vehicle** | revenue − all costs | what the fleet is judged on |

Utilisation must exclude days a vehicle was retired, in maintenance or blocked —
otherwise a car off the road drags the average down and hides the performance of
the ones working.

### 4.5 Schema debt found while writing this

`driving_licence_number` is the only column in the repository baseline and the
only one application code should read or write. **Live drift remains:** on 25
August 2026 the production `customers` table still contained both legacy
`licence_number` and canonical `driving_licence_number`. Licence verification
must use `driving_licence_number`; the legacy column is not a fallback source.

*Updated 28 August 2026 — **applied; this debt is closed**.* Migration
`20260828140000_drop_legacy_licence_number` and paste copy `036` were run
against production on 28 August and reported completion, which means they found
no row holding a different value in each column — the migration refuses and
drops nothing in that case. `supabase/schema.sql` has been brought in line.
Recorded rather than deleted, because how a live schema came to differ from its
migrations is the part worth keeping. What they did: Verified first: `grep` across every `.ts`, `.tsx`
and `.mjs` finds no reference to `licence_number` outside `supabase/schema.sql`,
which is a dump rather than something that runs — so nothing reads it and the
only risk is data held **only** there.

It backfills a legacy value into the canonical column where the canonical one is
empty, trimming on the way across, and **refuses rather than guesses** where a
row holds a different value in each: there is no way to tell from here which is
current, and picking one silently is how a wrong licence number reaches a rental
agreement. It names the count so those rows can be found. Safe to run twice, and
a no-op on a database that never had the column.

The live drift recorded at the top of this section no longer exists.

---

## 5. Operational mechanics

### 5.1 Built

**Turnaround.** Availability compares full timestamps and adds each vehicle's
turnaround window to the end of every rental before measuring overlap — 120
minutes cars, 60 scooters, 30 bicycles, the operator's own figures. A true
double-booking and a too-short gap are reported differently.

**Substitution.** Transmission is never crossed (checked first, inferred from
the model where the quote states no preference); an upgrade is free; a downgrade
needs consent and a lower price; cross-family swaps refused outright.

### 5.2 To build

**Statutory gating.** KTEO, road tax and insurance expiry each carry a fine, and
KTEO expiry voids insurance. Expiry should raise a `vehicle_block`, not a
warning.

**Maintenance blocking.** A vehicle in `maintenance` is currently still
selectable.

**Service due by distance.** `service_interval_km` and `odometer_km` exist; once
check-in records the odometer this becomes calculable rather than remembered.

**Overdue returns.** A reservation past its return time with no check-in is the
most time-critical state in a rental business, and nothing surfaces it.

**Licence expiry check.** `driving_licence_expiry` is stored and never examined.
Renting to an expired licence is an insurance problem, and this is the cheap
half of what Coastr and Rent Centric sell as live verification.

**Daily plan.** RentSyst's Task Manager and timeline views answer "what is
happening today" — collections, returns, vehicles due back. Anadyon has a
calendar but no operational day view.

---


### 5.3 When a dependency is down

*Added 27 August 2026. Nothing in this document previously said what should
happen when something external fails, despite one outage having already
happened.*

On 23 August the admin became unreachable because middleware auth calls stalled.
The cause was never established. The fix — an 8-second timeout that denies
rather than hangs — is in `proxy.ts`, and the incident is written up in
`INCIDENT-ADMIN-MIDDLEWARE-TIMEOUT.md`. What was missing is the rule that fix
was an instance of.

**The rule: security fails closed, convenience degrades, money never silently
succeeds.**

| Dependency | On failure |
|---|---|
| **Supabase auth** | Deny. An unresolved role is not a staff role. Already implemented: 8s timeout, `?unavailable=1`, 503. |
| **Supabase data** | Read paths show a stated error, never an empty list — "no reservations today" and "we cannot reach the database" must never look alike. Write paths refuse and say so. |
| **Storage** | A handover cannot finalise without its photographs. Hold the draft, let staff retry; do not complete a handover whose evidence did not upload. |
| **Resend** | Queue and retry. Delivery state is already derived from `booking_email_deliveries`, so a failure is visible rather than assumed — `pending` is never read as sent. |
| **Stripe** | Never mark paid on a timeout. An unconfirmed payment stays unconfirmed; the webhook is the source of truth, and it is idempotent. |
| **Wise** | *Corrected 28 August — this was wrongly folded in with Stripe above.* **Wise has no webhook.** `lib/wise.ts` says so in the file itself: a deposit link is a constructed URL, "Wise does not call back when the money arrives, so a reservation paid this way has to be reconciled rather than confirming itself." There is nothing to fail closed, because nothing calls back. The failure mode is therefore silence, and the answer is a reconciliation task that is *visible and ages* — an unreconciled Wise deposit must appear as outstanding work, not sit unnoticed until someone checks the bank. |
| **SMS** | Non-blocking, but recorded and visible. A confirmation SMS that fails must not block a booking — and must not vanish either. *Corrected 28 August: this said "degrade silently", which contradicts this section's own closing rule that degraded state is shown rather than hidden.* A failed message is logged against the reservation and surfaced the way a failed email already is, so "we texted them" can be checked rather than assumed. |
| **AADE** | Queue for resubmission and surface the backlog. A statutory submission that failed is an operational task, not a lost message. |
| **Competitor feeds** | Show the data's age. Stale rates presented as current are worse than no rates. |

**Two rules that apply everywhere.** Every external call carries a timeout —
an unbounded call is an outage waiting for a slow day. And degraded state is
shown, not hidden: the operator needs to know the difference between quiet and
broken, which is precisely the distinction the August incident destroyed.

**Not covered here:** there is no failover *target*. Supabase Free has no
replica and the project has no second region. This section is about behaving
correctly during an outage, not surviving one transparently. Anything stronger
is a hosting decision with a cost attached, and it belongs in Gate 0 alongside
the backup requirements in §4.2a.

---

## 6. Greek-specific obligations

Why a Greek product wins locally, and where Anadyon already competes:

- **AADE myDATA** — invoice transmission. Built.
- **AADE Digital Client List** — columns present, unproven. IOS Rentals markets
  it explicitly, so it is local table stakes.
- **KTEO** — expiry voids insurance, so it gates rental.
- **Τέλη κυκλοφορίας** — circulation tax, annual, due each December.
- **Μισθωτήριο συμβόλαιο** — personal insurance takes effect only on the
  renter's signature, making signature capture a legal requirement.

---

## 7. Build order

| Phase | Scope | Rationale |
|---|---|---|
| **Gate 0** | Clear audit area 5; confirm the counter retention, agreement, insurance and adjustment wording with counsel/accountant | area 5 held a blocker and directly determines what phase 2 may collect, retain and charge |
| **1** | ~~Finish the Fleet foundation~~ — **built and applied 28 August.** See §7.3 | the counter must not be capable of releasing a blocked vehicle or an invalid driver |
| **2** | Check-out / check-in facts, template photos, damage observations and itemised adjustments — tablet-first, exactly as §4.2 | the category's centre of gravity and the source of every later contract, charge, damage and service decision |
| **3** | Versioned digital agreement and signature | legally required for the insurance clause; consumes phase-2 handover and evidence IDs rather than duplicating them |
| **4** | Partner-channel pilot — hotel/agency accounts, on-behalf booking, retail availability and commission ledger | distribution is the only material local-competitor gap, but it must not add volume before operational and legal controls exist |
| **5** | Reporting — utilisation, RevPAV, margin per vehicle | needs phase 2 data to mean anything |
| **6** | Alerts and daily plan — expiry, overdue return, service due | cheap once the data exists |

The earlier order placed all stop-sells after phase 2. That was wrong at the
finalisation boundary: a check-out action that does not consult maintenance,
statutory and date blocks can release a vehicle the system already knows should
not move. The safety kernel therefore moves into phase 1. Phase 2 remains the
largest unlock and follows immediately; reporting still waits for real
handover data.

### 7.3 Phase 1, as built

*Added 28 August 2026 by the implementer. Written here because the handover is
the document: the next agent should not have to reconstruct what phase 1 turned
into from a branch.*

All four parts are on `claude/pr59-collaboration-lwcnia`. **Both migrations were
applied to production on 28 August** — `20260828120000_vehicle_blocks` with
paste copy `035`, and `20260828140000_drop_legacy_licence_number` with `036`.

Two of the three gates in `035` took effect the moment it ran, because it
replaces `find_available_eligible_vehicle`: the symmetric turnaround and the
statutory check. The block gate is live but `vehicle_blocks` is empty, so it
constrains nothing until rows are added — the operator-facing way to create
them is not built. **§7.4 is the design for it**, decided 28 August.

- **`vehicle_blocks`** — dated, whole-day, inclusive at both ends, `ends_on`
  null for open-ended. Reasons are a closed set: maintenance, statutory,
  damage, hold, other. `vehicles.status` keeps its job (what the vehicle *is*
  now, including retired); blocks carry what is true on which dates, which
  `status` cannot express and which nobody remembers to reset.
- **Two gates, because there are two paths.** The database gate sits inside
  `find_available_eligible_vehicle`, the single point that decides allocation,
  so every caller inherits it. `lib/vehicleBlocks.ts` gates manual assignment
  on both reservation write paths — the likelier failure, because a person can
  see the car in the list with a customer waiting. It fails closed per §5.3.
- **Statutory cover** now bars the website allocator as it already barred the
  admin screen: `kteo_expiry` and `insurance_expiry` only, being the two fields
  marked `blocksRental` in `lib/fleetStatus.ts`. Road tax and next service are
  deliberately not barred — blocking them would refuse vehicles the admin
  permits and swap one disagreement between the paths for another. A null date
  is *not recorded*, not *expired*.
- **Licence expiry** (`lib/licenceGate.ts`) enforces what `licenceStatus()` has
  reported since it was written and nothing ever acted on: both call sites only
  *displayed* it. Not a hard refusal — a licence expiring next month can be
  renewed before a pick-up in three weeks — but staff must attest with
  `_licence_verified`, and the attestation is written onto the reservation.
- **§4.5's legacy column** is removed by a migration that backfills, trims, and
  **refuses rather than guesses** where a row holds a different value in each
  column.

**Two things found while building it, both live in production until the first
migration runs:**

- **Turnaround was applied to only one end of a rental.** A booking returning a
  car at 09:00 was allowed in front of an existing hire collecting it at 09:00 —
  no clean, no refuel, no inspection. Found by a deliberate test that booked out
  the whole manual fleet and was still allocated a car. The admin availability
  route carried the identical asymmetry; both now pad both ends.
- **The Calendar slid bookings a day earlier.** Not a date bug: the row emitted
  no `<td>` for a rental that began before the visible window, so every bar to
  its right shifted left while the header stayed correct. Fixed separately on
  `claude/calendar-column-shift`, which is deployable on its own.

**One question raised and not decided.** Statutory cover is measured at the
**pick-up**, matching the admin route; a driving licence is measured at the
**return**, because "the customer drives on the last day too". The licence side
is the better-reasoned of the pair — insurance lapsing mid-rental is the
operator's exposure — but changing it moves both paths and is area 5's to
settle.

---

### 7.4 Taking a vehicle out of the active fleet

*Added 28 August 2026, **built and the migration applied 29 August**. Decided
with Tasos.* Migration `20260829090000` with paste copy `037` is in production:
`ends_on` is now `expected_return`, `released_at` / `released_by` exist, and the
allocator's block test is `released_at is null and starts_on <= p_return_date`.

**The screens are on `claude/pr59-collaboration-lwcnia` and not yet deployed.**
Until that branch reaches `main`, production holds the stricter allocator with
no way to create a block — harmless, because nothing can write one, but the
feature is not usable until the branch ships. The design below is what was
built.

**The problem `vehicles.status` cannot solve.** It is a switch with no dates and
no memory: it cannot say "in the workshop Tuesday to Thursday", cannot hold a
future entry, and depends on somebody remembering to set it back. A car left on
`maintenance` stops earning silently; one left on `available` goes out while it
is still on a ramp.

**Statutory cover is out of scope here and needs no block.** §7.3's gate reads
`kteo_expiry` and `insurance_expiry` off the vehicle and bars it automatically
on the day cover lapses. Blocks are for what has no column of its own: a
workshop visit, damage with no known end, an owner's hold.

#### The central rule: an expected return is a promise, not a fact

The first design stored the mechanic's date as `ends_on` and let the block
expire on it. That is wrong, and it is wrong in the dangerous direction: the day
arrives, the block lapses on its own, and a car that is still in pieces becomes
bookable with nobody asked.

So:

| Field | Meaning |
|---|---|
| `expected_return` | The garage's estimate. Drives planning, display and reminders. **Ends nothing.** |
| `released_at` / `released_by` | Set by a member of staff when the car is physically back. **Only this ends the block.** |

A block is open while `released_at is null`, and an open block is a **hard stop
out of the active fleet** — the vehicle cannot be allocated for any date from
`starts_on` onward, including dates beyond `expected_return`.

That costs forward bookings: a car in on 1 September cannot be sold for October
until it is marked back. Accepted knowingly. Workshop blocks are usually days,
and one rule staff can hold in their head beats two they cannot. The escape is
the override below, not a softer rule.

#### The override, which is not optional

A hard stop with no way through gets worked around: the first time a car is
genuinely needed — the mechanic finished early, a customer is waiting — somebody
will **delete the block**, and the record goes with it.

So assignment against an open block is refused *unless* staff attest, using the
`_licence_verified` / `_customer_requested_change` idiom already in this
codebase. The car goes out, a line is written on the reservation naming who
overrode a block and when, and the frequency becomes visible. A refusal people
cannot pass honestly is one they pass dishonestly.

#### Creating a block must surface the bookings it does not cancel

A block stops *new* allocation. It does **not** touch reservations already on
that vehicle, which sit quietly until the customer arrives.

Creating one therefore reports, immediately and in the same interaction: *"this
block covers N existing reservations"*, listed with dates and contact details.
The decision to move or call them is made on the day the car goes in, not on the
day it bites.

#### Reminders

Clocked from **how long the car has been out**, not from the expected return —
an estimate that may already be wrong is a poor thing to measure against.

- **From day 2 out**, daily, in the morning Telegram briefing: the vehicle, how
  long it has been out, and its expected return. Where `expected_return` is
  still in the future the line says so, so a legitimate ten-day rebuild reads as
  under control rather than as a nag.
- **From day 4 out**, escalation: the same item flagged at the top of the
  briefing **and** an email to `anadyon.gr@gmail.com`.

Two channels doing different jobs, deliberately. The briefing is read every
morning and is where routine visibility belongs; an email that arrives every day
about the same car gets filtered, and then the alert is worse than nothing.
**Email is reserved for escalation, so its arrival is itself the signal.**

Note the recipient is the owner directly, not `customerservice@` — an asset
sitting idle is not a customer-service matter, and the shared inbox already
forwards there anyway.

Vercel's Hobby plan permits a single cron and the morning briefing is it (§5.3),
so both reminder stages come from that one daily pass.

#### Where it appears

- **Vehicle modal** — a Blocks tab beside the existing Costs and Damages tabs:
  open and past blocks, a form to create one, and the release action.
- **Today screen** — the screen staff work from. Cars out, days out, and
  one-click release. A release that is fiddly does not happen, and then cars sit
  idle.
- **Fleet screen** — a blocked vehicle must not read `available`, or staff will
  disbelieve the refusal they later get.
- **Calendar** — a distinct bar rather than empty space. Empty space is exactly
  where a dispatcher decides to put a booking.

#### Schema delta

`vehicle_blocks` exists with `ends_on`. Needs: `ends_on` renamed to
`expected_return`, plus `released_at timestamptz` and `released_by uuid`, and
`find_available_eligible_vehicle` changed from a date-range overlap to
`released_at is null and starts_on <= p_return_date`.

Safe to do as a rename rather than an additive migration **because the table is
empty in production** — verified after `20260828120000` was applied. That will
not be true later.

#### Deferred: automatic re-allocation

*Recorded 28 August at Tasos's request. Not phase 1.*

Taking a vehicle out would trigger automatic re-allocation of its reservations
for the next four weeks; and from the second week of an unreturned vehicle
onward, reservations beyond that window would be re-allocated too.

**The constraint that must not be lost.** `lib/substitution.ts` already decides
what may replace what: a `blocked` verdict, and `consentCanPermit` for the
subset a customer may agree to. Automatic re-allocation has to run **through**
that, never around it. A machine that silently moves a customer from an
automatic to a manual, or across vehicle families, produces a dispute the system
was built to prevent — and it would do it at scale, quietly, which is worse than
a person doing it once.

So the shape, when it is built: propose, do not perform. Re-allocate only where
`checkSubstitution` returns `ok`; queue anything needing consent as an
operational task with the customer's contact details; never downgrade without a
recorded agreement. Whether the customer is told automatically is a §4.2-era
question and is not settled here.

---

### 7.1 Partner channel — promoted, but not ahead of the counter

The partner channel leaves the deferred list and becomes phase 4. It does not
jump Gate 0, vehicle/driver gating, phase 2 or the signed-agreement work. More
bookings into an incomplete counter increase operational risk; after those
controls, the channel deserves priority over reporting because it can create
demand rather than only describe it.

The phase-4 MVP is deliberately narrower than an OTA:

- active hotel/travel-agency accounts and named partner users;
- current retail category availability through the same availability boundary
  used by the public site;
- a partner creates a pending booking on the guest's behalf through the same
  atomic booking service — never direct table writes;
- the reservation stores partner attribution and the commission terms as a
  snapshot, so later contract changes do not rewrite old bookings;
- commission is a percentage of the final vehicle subtotal after discounts,
  excluding deposits, extras, fuel/mileage/damage/cleaning adjustments and
  refunds; VAT/accounting treatment is a Gate-0 decision before coding;
- commission becomes payable only after a returned, paid rental; cancellation,
  no-show or refund reverses/accrues an explicit ledger entry; and
- monthly statements, with export, are generated from the ledger rather than a
  mutable total on the partner account.

Reuse Supabase Auth, not the internal `admin`/`staff` authorisation role. An
external partner is a tenant: `partner_accounts` owns `partner_users`, bookings
and statements, and a partner can read only rows belonging to its account.

**Authorisation derives from database membership** — `partner_users.user_id =
auth.uid()` — and never from a JWT claim in `user_metadata`, which the user can
edit. This project has already leaked customer PII once through a policy that
trusted the wrong thing; a partner who can rewrite their own tenant id is the
same failure with a different table. The
server remains the normal write path; tenant-scoped RLS is defence in depth.
No partner receives admin navigation, fleet cost data, competitor rates,
customer marketing lists or another partner's customer data.

Explicitly excluded from the MVP: partner-owned vehicles, special partner rate
cards, OTA/broker feeds, multi-level commissions and automated payouts. Those
are different business models, not hidden phase-4 requirements.

### 7.1a Gate — buy or build the partner channel

*Added 26 August 2026.* §1.10 raised build-versus-buy for the partner channel
and §7.1 tells the implementer to build it. Two instructions, one of them
wrong, which is exactly the ambiguity the counter decision was criticised for.
This resolves it the same way.

**One bounded evaluation, two business days, GoCars only, before phase 4
begins.** It must produce:

- pricing for 29 mixed assets;
- whether cars, scooters **and bicycles** are genuinely supported, not inferred
  from the word "bikes";
- actual API or export documentation, not "integration upon agreement";
- **whether the partner portal can operate without moving the booking engine,
  pricing and AADE paths onto their platform** — the decisive question;
- commission export format, and proof that one partner cannot see another's
  customers; and
- whether the Digital Client Registry submission is automatic or an assisted
  export.

**If any of these is unavailable, phase 4 proceeds natively under §7.1, without
further delay or a second vendor evaluation.** A partner portal that requires
their booking engine is not an addition to Anadyon; it is a replacement, and
§1.8 already decided against replacement.

This gate concerns the partner channel only. It does not reopen the counter.

### 7.2 Audit debt is a release gate, not another feature phase

**Area 5 — content and legal — is cleared before the phase-2 migration is
written.** It previously held a blocker and it determines agreement wording,
damage/fuel/mileage charge authority, evidence retention, identity-document
handling and partner commission/VAT treatment. Building those columns first
would turn unreviewed assumptions into schema debt. The result must be graded
in `docs/audits/`, with each old blocker either closed by evidence or carried as
an explicit stop.

**Area 2 — design — is graded now as the baseline and again at the phase-2
preview gate.** It does not block this architecture document, but no counter UI
ships merely because its database tests pass. The focused preview review covers
standing tablet use, one-handed capture, sunlight contrast, touch targets,
camera orientation, draft recovery, error visibility and the out/in comparison.
The physical iPad and Android acceptance in §4.2 is part of that grade.

Do not mark the existing admin frozen-pane defect closed from stylesheet rules,
unit tests or a hand-written reproduction. `HANDOVER-ADMIN-FROZEN-PANES.md`
records that those forms of evidence previously passed while the real page
failed, and the owner has also reported the failure on Android Chrome. Closure
requires measurement on the authenticated affected table, an unfixed-state
reproduction that demonstrably fails, and physical iPad plus Android Chrome
verification of the corrected state.

This is intentionally asymmetric: legal/content can change what is lawful to
store and charge, so it precedes the migration; design changes how the approved
model is operated, so it can proceed in parallel but gates deployment.

### Deferred, worth revisiting

- **Review-triggered coupons** (IOS Rentals) — retention loop, no equivalent here
- **WhatsApp / out-of-hours capture** (RentingPilot) — suits island customers mid-journey
- **Messaging channel and provider** — *amended 27 August 2026; the first
  version of this entry compared per-message price and missed two things that
  decide the outcome.*

  **Sender ID registration is a gate, not a fee.** In Greece an alphanumeric
  sender ID must be registered with the operators, and messages from an
  unregistered ID are **rejected** — not relabelled, rejected. Twilio listing
  "alphanumeric sender ID: free" refers to the charge, not the registration.
  This system currently sends from `TWILIO_FROM_NUMBER`, a number rather than a
  brand name, so it is unaffected today — and would walk straight into it the
  moment anyone tries to send as "Anadyon". Any provider is therefore evaluated
  first on whether it handles Greek sender-ID registration, and only then on
  price.

  **Viber changes the arithmetic.** Greek consumers use Viber heavily, and
  Viber Business Messages fall back to SMS automatically when the recipient is
  not reachable — one API, cheaper per message, richer content, and a Greek
  customer far more likely to read it. A pure SMS comparison optimises the wrong
  channel. Providers that bundle Viber-with-SMS-fallback natively (Sinch,
  Infobip, and the Greek operators Apifon and Yuboto) are worth more than a
  cheaper SMS-only rate.

  Per-message SMS rates for reference, not as the deciding factor: **Twilio
  $0.0657 to Greece** plus $1.15/month per number; **Yuboto €0.035–0.050**;
  **Apifon from €0.008** at volume. Both Greek providers also keep the data in
  the EU, which removes a transfer question.

  `app/api/admin/sms/route.ts` is the only file importing `twilio`, so the swap
  is contained — but the abstraction should become *channel*-agnostic rather
  than provider-agnostic, since the likely destination is "send this
  notification" resolving to Viber or SMS, not "send this SMS".

  Before switching: written per-message quotes at real volume; confirmation the
  provider registers Greek sender IDs on the operator's behalf; and Viber
  Business Message pricing alongside SMS, since that is probably the channel
  that matters.

- **Nexi XPay / myPOS** (IOS Rentals) — Greek payment rails
- **Customer portal** (Coastr, Rent Centric) — self-service booking management
- **Scheduled email reports** (Wheelsys) — once reporting exists

---

## 8. Deliberately not built

Decisions, not omissions:

- **Card numbers are never stored.** Stripe references, brand and last four —
  what Wheelsys and Coastr do. The line between PCI DSS SAQ-A and SAQ-D.
- **Profitability is never stored.** Revenue minus costs, both of which move.
- **OTA and broker distribution.** Wheelsys's and RentSyst's strongest
  commercial feature, deliberately declined: broker volume arrives at commission
  and price pressure, against a direct engine that keeps the margin. Revisit
  only if direct demand stalls.
- **GPS, telematics, immobilisation, keyless entry.** Coastr, RentSyst and Rent
  Centric all sell these. For 29 vehicles on one island it is hardware cost
  without a question it answers.
- **AI damage detection.** Timestamped photographs already make a charge
  defensible; automated detection adds cost and its own dispute surface.
- **Multi-currency, franchise, multi-location, subscription, P2P sharing, toll
  processing.** Answers to problems a single-island operator does not have.

**Reviewed 25 August 2026: no exclusion changes.** The partner channel is not
OTA distribution: it is a named local commercial relationship with attributable
bookings and negotiated commission. Telematics still adds hardware before
phase-2 readings show a manual-data problem; AI detection still adds a dispute
surface without replacing evidence; and storing card numbers still crosses the
PCI boundary for no operational benefit.

---

## 8b. Pricing — how it actually works

Worth stating plainly, because the second draft of this document got it wrong
and claimed server-side recalculation was deliberately absent.

`BookingForm.tsx` calculates client-side so figures update instantly with no
round trip. On submit, `/api/quote/route.ts` recalculates **everything**
independently from the `rates` and `extras_config` tables — rental days, daily
rate, vehicle subtotal, extras, total, deposit, balance — and the server's
values are the ones stored and emailed, always, whether or not they agree with
the client's.

The submitted client total is kept only for comparison. A difference above
€0.02 sets a `manipulated` flag, which prefixes the internal email subject with
`⚠️ [ALERT]` and adds a banner showing client-submitted against
server-calculated figures.

None of the eleven systems advertises this. It is a stronger position than
"pricing is client-side" implies: the customer gets instant feedback, and a
tampered payload cannot change what is charged or recorded.

**The cost:** two implementations of the same rules. A rate change made in one
and not the other will not produce a wrong price — the server always wins — but
it will make every quote trip the manipulation alert. Keep them in step.

---

## 9. Standing principles

See `DEFINING-STATEMENTS.md`. The three bearing most here:

- **The public site and the rental system collect the same data.** A field
  collected on a quote the reservation cannot store is a dead end.
- **Claims are verified, not assumed.** Schema against the live database, DNS
  against live resolvers, vendor behaviour against vendor documentation.
- **Read what is already written before researching it again** (§9, added 25
  August 2026). This document is the one that principle exists to protect: it
  was duplicated from scratch by a search that looked for `*audit*` and never
  for a blueprint, and the duplicate was thinner. Extend this file; do not write
  a parallel one.

TSD's own phrasing is the third, and worth adopting: an agreement that can be
produced with required fields missing is a **liability**, not a convenience.

---


## 9a. Threat model

*Added 27 August 2026. There was none, and the controls in this document were
being chosen without a stated account of what they defend against.*

This is not a formal STRIDE exercise. It names who would attack this system,
what they would want, which control answers it, and — the part that matters —
where the answer is currently thin.

### Who, and what they want

**1. The opportunistic customer.** Wants a cheaper rental or to avoid a damage
charge. Manipulates the booking form, replays a promo code, or disputes damage
they caused.

*Answered:* pricing is recalculated server-side from the rates table and the
client total is only compared, never trusted (§8b); promo use is a ledger with
hold/redeem/release; seat limits are check constraints. **Phase 2 is the real
answer to the damage half** — timestamped condition photographs are what make a
charge defensible.

*Thin:* until phase 2 ships, a damage dispute is one person's word against
another's.

**2. The credential thief.** Wants the admin. Phishes or reuses a staff
password.

*Answered:* Supabase Auth with MFA; roles from `app_metadata`, never
user-editable metadata; an unresolved role denies; the proxy strips the role
header from incoming requests so it cannot be spoofed; auth calls fail closed
after 8 seconds.

*Thin:* there is no session-anomaly signal — a login from an unusual place at
an unusual hour looks like any other. And a stolen session is as good as the
password until it expires.

**3. The scraper.** Wants the fleet, the rates and the customer list.

*Answered:* the anonymous-privileged-access hole was closed on 16 August;
public tables are not exposed `TO anon`; RLS filters rows and grants are stated
explicitly; quote lookups are rate-limited on the real IP, not a forgeable
header.

*Thin:* the public quote-by-reference path is deliberately unauthenticated. It
is gated by a reference plus the customer's surname, with IP rate limiting — but
a surname is a second *check*, not a second secret, so the reference is doing
nearly all of the work.

**And the reference is not generated securely.** `app/api/quote/route.ts` builds
it with `Math.random()`, which is not a cryptographic generator: its output is
predictable from prior values, and an attacker can obtain as many references of
their own as they like. This is a code defect rather than a design question, and
it is tracked separately — see the action item below.

**4. The insider, malicious or careless.** A staff member exports the customer
list, or deletes something that mattered.

*Answered:* staff routing is method-aware, so read-only means read-only; rates
now require an explicit edit session; the service-role key never reaches a
browser.

*Thin — and this is the weakest area.* There is no audit trail of *reads*.
Nothing records that a staff member opened 400 customer records, and §4.2d's
export makes that materially more consequential: one action, one file,
everything about a customer. That export must be logged, which is why §4.2d
says so.

**5. The supply chain.** A compromised npm package, or a leaked key in a
third-party integration.

*Answered:* `npm ci` from a committed lockfile; a build-time guard refuses a
production bundle carrying the reCAPTCHA test key; CodeQL runs on pushes and
pull requests to `main` and on a weekly schedule.

*Corrected 28 August.* This previously read "CodeQL and Dependabot run on every
push", and neither half was true as written. CodeQL does **not** run on a push
to a `codex/*` or `claude/*` branch — which is where all work happens — only
once a pull request is open against `main`. And there is no
`.github/dependabot.yml` in the repository, nor any Dependabot branch or commit
in its history; alert and security-update settings may be enabled in the GitHub
repository settings, but nothing in the repository evidences it and **it must be
verified there rather than assumed**. Automated version updates are not
configured at all. A control named as the answer to an adversary has to be the
control that exists.

*Closed, and worth keeping for the shape of it.* On 16 August a plaintext
Anthropic key was found in the HTTP headers of a Make.com scenario. The key was
rotated and the Make scenarios have since been retired — both steps, which is
the point: **retiring a scenario revokes nothing.** Make retains blueprints for
disabled scenarios, and exports and collaborators' copies persist, so the
exposure ends at the provider, never in the tool.

*Thin, still:* **integrations outside this repo sit outside every control this
document describes.** No CodeQL run, no Dependabot alert, no migration guard and
no build-time check reaches a credential pasted into a third-party automation
tool. This was the project's last real credential leak and it was found by
reading a scenario, not by any gate. Nothing has changed about that.

**6. The state, lawfully.** A tax inspection, or a subject-access request.

*Answered by §4.2d* — one reproducible, hash-indexed export per rental.

*Thin:* it does not exist yet, and §4.2b's retention rules do not either, so
today the honest answer to "produce everything and nothing more" is that the
system can do neither precisely.

### What is deliberately out of scope

Physical theft of a vehicle; card fraud, which sits with the acquirer under
PCI SAQ-A precisely because no card number is ever stored here (§8); and denial
of service, which is Vercel's edge and not something this application can
usefully defend.

### The three worth acting on first

1. **Log privileged reads and exports** — the insider case is the least
   defended, and §4.2d increases the blast radius of one click.
2. **Inventory credentials held outside this repo**, and give them an owner and
   a rotation date. The Make.com key was rotated and those scenarios retired,
   but that exposure was found by reading a scenario — no gate here would have
   caught it, and nothing says what else exists.
3. **~~Replace the quote reference's generator~~ — done 28 August; the link
   token remains open.** `generateRef()` now takes `crypto.randomBytes` and
   masks each byte to five bits, which is uniform because the 32-symbol
   alphabet divides 256. A reference collision is retried rather than shown to
   the customer as "we could not save your request", and only on
   `quotes_ref_key` — a 23505 from the idempotency key is the replay protection
   working. What is **not** done is the separation below: the reference is
   still the access secret, at about 30 unpredictable bits. That is a different
   change because it alters the customer-facing URL.

   The original wording of this item, kept because it is the instructive part:
   **separate the reference from the secret.** Not "state the entropy and confirm it is sufficient" — that was
   the earlier wording and it invites the wrong answer. The reference is six
   characters from a 32-symbol alphabet, so anyone can state it in one read:
   about 30 bits. The number is not the problem. `Math.random()` is not a
   cryptographic generator, so **length does not help** — `lib/gmail.ts` already
   records the same lesson from the OAuth `state` value: *"Two concatenated
   calls made it longer without making it less guessable."*

   What the fix needs, at minimum: keep the six-character reference for emails,
   phone calls and staff use, where a human has to read it aloud; issue a
   **separate lookup token of at least 128 bits** from `crypto.randomBytes` for
   customer-access links; store only its hash; keep the rate limiting, generic
   failure responses and access logging; and add a uniqueness constraint with a
   collision retry on the human reference. Do not treat the surname as a secret.

None of these is phase-2 work. All three are cheaper than the counter and
currently unowned.

---

## 10. Revision history and what has shipped

This document is revised in place. Each entry says what changed and why, so a
reader six months out can follow the reasoning without re-deriving it.

### 30 August 2026 — confirmed: preview deployments carry the production service-role key

*Verified, not inferred. Tasos read the Vercel settings the same day the
question was raised.*

`SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` are all enabled for **Production and Preview**.
So every preview deployment — every pull-request branch, unreviewed and
half-finished ones included — has run with the production service-role key
against the live database. That key bypasses row-level security by design, and
the database it reaches holds passport numbers, driving licence numbers and
dates of birth.

This is the finding that turns the staging work from a testing convenience into
a data-protection obligation, and it is why the argument in the status document
was rewritten on the same day: vendor sandboxes were never the case for staging;
this is.

**It also retires a piece of advice given repeatedly this month.** "Check it on
the Vercel preview" was, every time, an instruction to check against production.
`HANDOFF-H1.md` §6 had said so all along — *"There is no staging database. A real
booking creates real rows."* — and it was not read.

**The immediate fix is not the staging build.** Preview-scoped **placeholder**
values close it in under an hour, and placeholders rather than unset values
because `lib/supabase.ts` constructs its clients at module scope, so an unset
variable fails the preview *build* rather than only its data access —
`.github/workflows/ci.yml` already documents that and works around it the same
way. Previews then build and render with no data at all, which is correct:
migration 019's own comment records that *"everything the site serves goes
through the service role"*, so there is no partial mode to fall back to.

**Rotation was recommended here, and then withdrawn the same day.** The first
version of this entry said the key should be rotated as well as re-scoped, on
the reasoning that scoping closes the door without establishing that nobody
walked through it. Tasos asked which key had been exposed and why it needed
changing, and the reasoning did not survive the question.

It conflated two risks. The one that was real is **unreviewed code running with
the key**: a preview deployment serves whatever is on its branch, at a publicly
reachable URL, against production data — so a broken `proxy.ts`, a leaking
route, or an agent-written bug had the whole database behind it. Scoping fixed
precisely that, and it is why the work was urgent.

The other is **disclosure of the key itself**, which only rotation addresses.
Its plausible routes — Vercel dashboard access, build logs, a dependency
executing during a build — apply to production builds identically. Preview
scoping never widened them and removing it does not narrow them. Nothing
suggests any of them occurred, and the value has never been in git or in a
browser.

So rotation is optional and low priority rather than the second half of the fix.
Recorded because the withdrawal is the useful part: *"rotate after any
exposure"* is a good reflex that produces a bad answer when the exposure was
misuse rather than disclosure, and the distinction is worth having next time.
Where it does apply — the Make.com credential in §9a — the key was rotated and
the scenarios retired, which is the shape of a real disclosure response.

### 30 August 2026 — outside review, and the two places this document was wrong

*Fable reviewed `docs/ARCHITECTURE-STATUS-2026-08-30.md` cold, from that file
alone. Recorded here because two of its findings are corrections rather than
opinions, and because the standing rule in §9 that comes out of it applies
beyond the section that produced it.*

**Direction: upheld.** The reason given is worth keeping, because it is the
thing to protect: enforcement keeps landing at the one point that can actually
refuse — the SQL allocator, server-side price verification, the locked approval
transaction in migration 038 — rather than each feature inventing its own. §7.4
opening a `vehicle_blocks` row instead of teaching the UI a warning is that
discipline holding under time pressure. Systems in this category rot when the
enforcement point multiplies.

**Correction 1 — the case for a staging database was argued wrongly.** The
status document led with vendor sandboxes: AADE, Stripe, NBG exercised against
real request/response cycles. That is not a case for staging. Driving the AADE
sandbox needs credentials and any non-production place to point them — a script
calling `lib/aadeXml.ts` and the submit path with fixture data needs no database
at all, and Stripe test mode is the same. Leading with sandboxes both delayed
work that can start the day credentials arrive **and** buried the actual
argument, which is that preview deployments appear to run unreviewed branch code
with the production service-role key against a `customers` table holding
passport numbers, licence numbers and dates of birth. The service role bypasses
row-level security by design. That is a data-protection exposure, and it
justifies the work on its own.

**Correction 2 — that claim is inferred, not verified.** Nobody has opened
Vercel → Settings → Environment Variables and looked. Vercel applies a variable
to every environment unless it is scoped, and `PREVIEW-RECAPTCHA-TEST-KEYS.md`
records the preview-scoped variables it needs as *"not yet set"*, so the default
is the likely state — but likely is not checked, and this document has a rule
about that. One click settles it and it decides the urgency of everything else.

**§7.2 is a defect, not a judgement.** The fleet-wide damage endpoint keeps
`repair_cost` out of a staff response by its `select` list, pinned by
`lib/damageVisibility.test.ts`. The realistic failure is not the test missing a
change; it is a refactor to `select("*")` that updates the now-failing pin in
the same commit, which is the known weakness of pinning tests. Column grants
cannot help, because everything runs under the service role. The replacement is
a **view without the financial columns**, queried by that endpoint, making the
leak structurally impossible. Caveat held honestly: this repository contains no
views at all today, so it is a new pattern here; if it proves awkward through the
Data API, a second route handler with its own narrow query is the same fix.

**Standing rule, general beyond §7.2:** *a source-reading test may be a
tripwire, never the sole guard on something security-shaped.* The pattern stays
— it catches drift nothing else looks at — but it is not a control.

**The Record360 evaluation leaves Gate 0.** The 26 August adjudication put it
inside Gate 0; that coupled vendor questions to a legal audit they do not depend
on. Nothing area 5 produces changes what is asked of Record360 — pricing, DPA,
export terms, API access, template variety. Area 5 changes what is done with the
answers. Run it in parallel, now, while reopening the decision is still cheap:
every week of counter code is sunk cost against a decision already described as
one that *looks* settled. The deferred cost estimate stands as a deferral but
needs a named owner and a date, because a reopening gate with no number never
trips.

**Not adopted as stated.** The review recommended scoping production secrets to
Production in Vercel today and letting previews go dark. The security property
is right and should happen immediately; the mechanism needs one change.
`lib/supabase.ts` constructs its clients at module scope, so *unset* variables
fail the preview **build**, not merely its data access — `.github/workflows/ci.yml`
already documents this and works around it with placeholders. Preview-scoped
placeholder values give the identical security property with a preview that
still builds.

**Ordering upheld, on a better argument than was offered.** Error tracking
before staging is not an artefact of the outage being recent: two hours against
half a day to two days wins on cost asymmetry alone, and error tracking is the
only one of the three that pays off the week it is built. Remove the incident
from the record entirely and the order does not change.

### 30 August 2026 — the migration chain does not replay, and why 001 is not the place to fix it

*Architect decision, recorded because Codex asked for it before implementing.
The finding is Codex's, from the §3.1 preflight in
`docs/HANDOVER-TEST-ENVIRONMENT.md`, and it is correct: replaying the migrations
into an empty database stops at 017 with `column "name" of relation "customers"
does not exist`. Reproduced here — 16 of 37 applied.*

**The question asked.** Should `001_baseline.sql` be corrected to recreate the
legacy `customers.name NOT NULL` column that production carried before 017, so
the whole chain replays? Codex recommended that over conditionally skipping 017.

**The answer is no to both, and the third option is one line.**

**What actually happened, which neither option quite describes.**
`supabase/schema.sql` — headed *"Run this in the Supabase SQL editor"* — is the
hand-made schema that predates the migration files. It creates `customers` with
seven columns, one of them `name text not null`. `001_baseline.sql` was written
later with a thirty-two-column `customers`, using `CREATE TABLE IF NOT EXISTS`.
Against production that statement was a **no-op**: the table already existed, so
none of the baseline's columns arrived. That is not a footnote — it is why
`010_close_schema_drift.sql` exists at all, and 010's own header records the
cost, including a Stripe deposit that could be charged and never recorded.

So 001 has never described production. It is a declaration production ignored.

**Why amending 001 is the wrong repair.** Adding `name NOT NULL` to the baseline
would make it describe a thirty-three-column table that existed at no point in
time: not the seven-column hand-made original, and not the thirty-two-column
table the baseline intended. It manufactures a history to make a replay green.
It also has a concrete cost — `scripts/check-schema-drift.mjs` derives *what the
migrations declare* by reading these files, so adding `name` to 001 makes the
drift checker start asserting a column that 017's own comment says should be
dropped once external consumers are confirmed. The repair would block the
cleanup it is meant to preserve.

**Why conditionally skipping 017 is also wrong.** Codex's objection stands and
is the right one: staging would then lack both the column and the
`customers_sync_legacy_name_trg` trigger that production has, and a staging
database that differs from production in a trigger firing on every customer
insert is precisely the drift that makes staging lie.

**The decision.** Make **017 self-sufficient**, by prepending one statement:

```sql
ALTER TABLE customers ADD COLUMN IF NOT EXISTS name text;
```

- Against production it is a provable no-op: the column is already there, the
  `DROP NOT NULL` already ran, and the trigger is `CREATE OR REPLACE`.
- Against an empty database it creates the column, the `DROP NOT NULL` becomes a
  no-op, and the trigger and comment install as they did in production.
- **Verified:** with it, all 37 migrations replay, and `customers.name` ends as
  `text`, nullable, with `customers_sync_legacy_name_trg` attached — the same
  state production reached by a different route.
- 017 is already the file that documents this anomaly, at length, in its own
  header. The repair belongs beside the explanation.
- 017 predates the paste convention (copies start at 022), so no paste copy has
  to move with it.

**The principle, since it will come up again.** A migration chain's job is to
arrive at the right schema, not to re-enact the past. That a fresh database
never holds `NOT NULL` on a column production held it on is a difference in
history, not in schema, and nothing reads the history.

**The larger finding, which is the part worth keeping.** `001_baseline.sql`
contains thirteen `CREATE TABLE IF NOT EXISTS` statements, and five of those
tables already existed from `schema.sql`. Any column the hand-made schema had
and the baseline did not would be invisible to every check in this repository:
`check-schema-drift.mjs` compares in one direction only — columns the migrations
declare that the database lacks — and `customers.name` is the opposite,
a column the database has that the migrations never declare. It was found by
accident, when a replay happened to trip over it.

Compared directly, `customers.name` is the **only** such column across all five
shared tables. So the problem is bounded and closed. But the check that would
have found it deliberately does not exist, which changes the acceptance test for
the staging work: **a green replay is not the exit criterion — a replayed schema
that matches production is.** That comparison has not been run and belongs in
§3.1 of the handover before staging is declared working.

### 30 August 2026 — environments: there is only production

*Architect entry. Nothing here is built. The build brief is
`docs/HANDOVER-TEST-ENVIRONMENT.md`; the reviewable status of the whole
architecture is `docs/ARCHITECTURE-STATUS-2026-08-30.md`.*

**The finding, and a correction owed to the record.** `docs/HANDOFF-H1.md` §6
has said since it was written that *"There is no staging database. A real
booking creates real rows."* That is still true, and it means every "check it on
the Vercel preview" issued during this month's work was pointing at production
data. Preview deployments get their own hostname and their own build; they do
not get their own database.

Three gaps follow from it, and they were prioritised in this order:

**1. Error tracking — first, and not because it is the biggest.** There is none:
no entry in `package.json`, and the only production signals are the 05:00
Telegram briefing and the four-hour email watchdog, both of which report
business state rather than that a request threw. The argument for putting it
ahead of everything is `docs/INCIDENT-ADMIN-MIDDLEWARE-TIMEOUT.md`: three hours
of the owner locked out of `/admin`, every hypothesis disproved, **cause never
established** — and that document's §6 names the exact evidence that would have
settled it, a `[proxy]` log line that was emitted and lost because nothing
collected it. Two hours of work makes the recurrence diagnosable. Staging would
not have helped with that incident at all.

**2. The end-to-end suite into CI.** `tests/e2e/` already holds nine files
covering quote → conversion → lifecycle → guards → operations → security →
readiness, with the mail transport stubbed at the floor in `setup.ts` rather
than left to each test to remember. It runs by hand only, because it writes to
the live database. Almost all the work is already done; what is missing is
somewhere safe to point it.

**3. The staging Supabase project.** The keystone — item 2 cannot run without
it — but third, because it is the only one of the three with an unknown in its
estimate. Half a day if the 37 migrations replay cleanly into an empty database,
one to two days if they do not, and an hour with PGlite (already a dependency,
already used by the `lib/*Migration.test.ts` family) settles which before
anything is committed to.

**What staging is worth, stated narrowly.** The strongest argument is not
"previews stop writing to production" — it is the vendor sandboxes. AADE, Stripe
and NBG can only be exercised against real request/response cycles somewhere
that is not the live business, and §5.3 of the status document is the evidence:
the AADE work is finished and has never been sent anywhere. The invoice XML was
checked against the published schema; the client-list declaration could not be,
because `aade.gr` is unreachable from the build container.

**And what it is not worth.** Neither production defect found on 28 August — the
turnaround applied to one end of a rental, the Calendar drawing a booking a day
early — would have been caught by any of this. Both produced plausible output,
so an end-to-end run would have exercised them and reported success. That
entry's own conclusion holds: the tests *"asserted the predicate as written
rather than the behaviour it was meant to produce."* No environment fixes that.

**The design constraint that decides whether it is worth having at all.**
Staging's failure mode is drift, and a stale staging is worse than none because
it gets believed. So: one command resets it, and nothing in it is ever fixed by
hand — a schema change arrives as a migration or it does not arrive. Seed data
is synthetic and never a production dump; `customers` holds passport numbers,
licence numbers and dates of birth of people who consented to renting a car, not
to their documents being copied into a system with looser access.

**Open, for the architect rather than the branch:** whether staging is its own
Vercel project (stable URL, easier Stripe and Resend webhook registration) or
rides preview deployments of the existing one; whether the e2e job runs on every
pull request; whether the database resets on a schedule; and the retention
setting on whatever error tracker is chosen, given it receives stack traces from
routes that handle identity documents.

### 30 August 2026 — four eyes on the fleet record

Tasos asked for the fleet screen to be opened to staff **and** made editable,
with an administrator approving what staff enter.

**The design in one line: the refusal becomes a proposal.**

`app/api/admin/vehicles/[id]` already computed a `refused` list — the fields a
staff session may not write — and answered 403 naming them. `STAFF_WRITABLE` is
`status`, `odometer_km`, `vehicle_notes`, chosen as counter tasks. So a staff
member noticing a KTEO certificate expires next week had no way to record it
except to tell somebody.

Rather than widen what staff may write, that same refused set now becomes a
`vehicle_change_requests` row, and an administrator turns it into a change.
**Nothing here lets staff write a column they could not write before.** The
property is pinned by `lib/fourEyes.test.ts`, which asserts the writable set is
unchanged and that the request block never touches `vehicles`.

*Migration `20260830120000` + paste `038` — **applied to production, 30 August**.*
Verified rather than assumed: the table and function exist, RLS is on, three
indexes (the primary key's included — an earlier count of two forgot it), and
`has_function_privilege('service_role', …)` is true. That last check is the one
worth repeating on any future `SECURITY DEFINER` function: this blueprint records
revoking a function from `service_role` and leaving it uncallable **twice**, and
the symptom both times was a feature that looked installed and failed on use.

**A mixed edit does both, and says so.** The odometer saves at once; the
statutory dates in the same form go to the queue. Refusing the whole submission
because one field needs review would discard a reading somebody just took off
the dashboard. The response carries `_requested`, the modal names the fields
that went for approval, and it treats **202 as success** — `res.ok` is false for
202, so the obvious check would show "Could not save" over a proposal recorded
perfectly.

**No approval for status, odometer or notes**, deliberately. Putting a review
between a staff member and "this vehicle is in maintenance" would delay the one
action that protects a customer. Slow in the wrong direction.

**Two things the SQL has to get right, both executed against a real Postgres in
`lib/vehicleChangeRequestsMigration.test.ts` rather than reasoned about.**

1. *Approval and application are one act.* Separate statements can be
   interrupted between them, leaving a request reading "approved" over a vehicle
   that never changed. `apply_vehicle_change_request` does both under a row
   lock, so two administrators pressing Approve cannot both apply.

2. *Approving must not undo somebody's work.* Staff propose `kteo_expiry` on
   Monday. An administrator fixes that field by hand on Tuesday. Approving the
   stale request on Wednesday would silently revert Tuesday. Every column named
   in `before` is compared against the vehicle now, and a mismatch refuses the
   **whole** request — surfaced as a 409 naming the field, not a 500, because
   nothing is broken and re-reading is the fix. An unrelated field moving (an
   odometer reading at handover) does not invalidate a pending KTEO correction.

**The key is interpolated as an identifier inside a `SECURITY DEFINER`
function**, so it is validated against `information_schema.columns` and against
an explicit `id`/`created_at` denylist rather than trusted from the application.
`jsonb_populate_record` against the `vehicles` type does the conversion, so a
date arrives as a date and not as text that happens to look like one.

**What is still not four-eyed, and should be said plainly.** An administrator
editing the fleet directly is unchanged — one pair of eyes, as before. This
covers *staff* input, which is what was asked. If the intent is that no single
person can alter a statutory date unreviewed, that is a larger change: it would
mean an administrator's own edits also entering the queue, and a second
administrator to clear them. Anadyon has one administrator today, so that would
deadlock. Worth deciding explicitly rather than discovering.

### 30 August 2026 — major damage takes a vehicle off the road

Tasos's decision, after the visibility work raised it: recording **unrepaired
major damage bars the vehicle immediately**, and only an administrator puts it
back. He chose that over "bar once you approve" — the safe direction, since a
wrecked car bookable in the gap costs more than a good car idle for an hour.

**It is a `vehicle_blocks` row, not a new kind of bar, and that is the whole
design.** The instinct is to teach `rentalBar()` about damage. That would have
been decoration: `rentalBar()` renders a warning on three screens, while the
thing that actually refuses to allocate a vehicle is the SQL allocator in
`20260828120000_vehicle_blocks.sql`. A TypeScript-only bar would have shown a
red line on the fleet screen while the website carried on taking bookings —
this codebase's recurring failure, one more time.

Going through §7.4 means everything else already existed:

| Requirement | Where it comes from |
|---|---|
| Refuses the booking, online and in the office | the SQL allocator reading `vehicle_blocks` |
| Only a person puts it back | `released_at` / `released_by` |
| Chases if it drags | `blockChase()`, remind at 2 days, escalate at 4 |
| Shows on Fleet and Today | the existing "out of fleet" rendering |

The `reason` check constraint has permitted `'damage'` since the table was
created. This is the caller it was waiting for.

**One documented decision was deliberately narrowed.** `blocks/route.ts` says
staff may release a block, because "a release that only an admin can perform is
a release that waits" — right for a van back from the mechanic, which is an
operational fact. Releasing a *damage* block is not that. It is a judgement that
a vehicle carrying unrepaired major damage is fit to hand to a customer, and
that belongs to whoever carries the liability. Damage only; every other reason
keeps the old behaviour. Narrowing a written decision rather than contradicting
it silently, with the reasoning beside the old reasoning.

**Two guards worth keeping.** `repaired_on` stops a back-filled historic repair
from taking a good car off the road — the ledger allows entering a June dent
fixed in July, and barring for that would be absurd. And a second major damage
on an already-blocked vehicle reuses the open block, because two would each need
releasing separately.

**A failed block never loses the damage record.** The operator typed the damage;
that is the part worth keeping. The response carries `_block_error` and the modal
says loudly that the vehicle is *still bookable*, rather than failing the whole
request and teaching people not to log damage.

**The briefing lists damage holds from day one**, separately, under
"ΜΟΝΟ ΔΙΑΧΕΙΡΙΣΤΗΣ". `blockChase()` stays quiet for two days, which is right for
a workshop estimate and wrong for something only one person can clear: the
reminder there is not "this is late", it is "this needs you".

**Risk this was weighed against, and why it is smaller than it looked.** The
objection to a hard bar was a car marked `major` in haste becoming unbookable in
August. But `refuseNonAdmin` gates the ledger POST — **only an administrator can
record a damage at all.** The person who can create the bar is the person who
can lift it. That should be revisited if damage logging is ever opened to staff.

**Still open: staff cannot see any of this.** `/admin/fleet` is `adminOnly` in
the nav *and* absent from `STAFF_PAGES` in `proxy.ts`, so the damage line added
earlier today renders on a screen staff cannot reach. The endpoint is open to
them and nothing shows it. Tasos asked for the fleet screen to show every
vehicle state, which it now does — but the staff-facing surface is unbuilt and
undecided.

### 30 August 2026 — AADE, checked against the published schema

**The invoice module would have been rejected on every single filing.** Checked
against `InvoicesDoc-v1.0.10.xsd` — the version our own `xmlns` declares —
`InvoiceSummaryType` is an `xs:sequence` of **eight mandatory** elements. The
module sent three. `totalWithheldAmount`, `totalFeesAmount`,
`totalStampDutyAmount`, `totalOtherTaxesAmount` and `totalDeductionsAmount` were
simply absent. None of them applies to a vehicle rental, but "does not apply" is
`0.00` in a mandatory element, not an omitted one.

Nothing would have reached a business rule; it fails schema validation first.
Nobody found out because the module has no credentials and had no tests — which
is the more useful lesson than the missing fields themselves. **A module that
has never run is not "built", it is "written".** §2 called both of these
"waiting on environment variables", and this one was waiting on being correct.

Also confirmed from the same schema, so the earlier entry's reasoning is now
verified rather than argued: `11.2` and `2.1` are both valid `InvoiceType`
values, and `vatCategory` is an int 1–10 so `1` is in range. And `paymentMethods`
is **optional** (`minOccurs="0"`), which contradicts what was flagged the hour
before — worth recording as a correction rather than quietly dropping. Schema-
optional is not the same as business-rule-optional, so it stays on the sandbox
checklist, but it is not the blocker it was called.

*The XML is now tested by generating it,* not by reading the source for
literals. `buildInvoiceXml` and `buildDclXml` are exported for that. Order is
asserted as well as presence, because `xs:sequence` is positional and a
presence-only check waves a reordering straight through — both failure modes
were reintroduced and watched to fail.

**What could not be checked, and must not be assumed.** The client list files
against a *different* AADE API, whose schema is published only on `aade.gr`.
This environment's egress policy blocks that host, and the README says to report
a block rather than route around it. So the DCL XML is verified for internal
consistency only — the country resolves, the refusal fires, the escaping holds —
and **not** against its real schema. Given the invoice module turned out to be
missing five mandatory elements, the honest expectation is that the DCL has
something similar waiting. The sandbox is what will say.

### 30 August 2026 — AADE

**Both filing modules were wrong, and neither had a single test.** They were
described in §2 as waiting only on environment variables. That was true of the
*configuration* and quite untrue of the *code*.

**The country was wrong in both, and wrong in the dangerous direction.** The
client list read `customers.nationality` — free text on the customer form, with
the placeholder "e.g. British" — and put it straight into
`<counterpartCountry>`. A demonym is not a country. The invoice module read the
right field, `customers.country`, but that holds an English display name:
`app/components/BookingForm.tsx` builds its dropdown from
`Intl.DisplayNames(["en"], {type:"region"})` and stores **the name as the
value**, so it is "United Kingdom", never "GB". AADE wants ISO 3166-1 alpha-2.

Both then ended `?? "GR"`. That is the part that matters: an unknown country
would have filed as Greece, and AADE would have accepted it without a murmur.
**A filing that is rejected can be corrected; a filing that is accepted with the
wrong country is a false statutory record nobody will ever look at again.** For
a business whose customers are overwhelmingly foreign, that was close to every
filing. Both now refuse — `UnfilableError`, answered as a 422 naming the record
to fix — rather than default.

`lib/aadeCountry.ts` resolves the name by **inverting the same `Intl` call the
form wrote with**, so the map cannot drift from the dropdown the way a
hand-typed table would.

**The invoice type was wrong for private customers**, which is what Tasos's
question surfaced. myDATA distinguishes `11.1` ΑΛΠ — Απόδειξη Λιανικής Πώλησης,
a retail receipt for *goods* — from `11.2` ΑΠΥ — Απόδειξη Παροχής Υπηρεσιών,
for *services*. Renting a vehicle is a service, so a private customer's receipt
is 11.2, and the module filed 11.1. The tell that this was a slip rather than a
decision: the B2B branch already used `2.1` ΤΠΥ, the *service* invoice. So it
knew. Nearly every receipt Anadyon issues goes to a private individual, so
nearly every one would have carried the wrong document type. **Confirm with the
accountant before the first live filing**, as with anything statutory — but
11.1 for a rental is not defensible either way.

**A refusal used to wedge the reservation permanently.** `claim_dcl_submission`
and `claim_invoice_submission` refuse anything already `submitting`/`issuing`,
and there is no timeout and no reset. An exception escaping after the claim but
before the status write left that reservation unfilable forever. Both now catch,
write `error` — which *is* re-claimable — and only then return.

**Testing before going live is already supported and needs no code.** Both
modules choose their endpoint on `AADE_PRODUCTION === "true"`, defaulting to
`mydataapidev.aade.gr`. Leave the variable unset and everything files against
AADE's developer environment. Outstanding: `AADE_USER_ID`,
`AADE_SUBSCRIPTION_KEY`, `COMPANY_VAT_NUMBER`, and `COMPANY_BRANCH` (defaults
to `0`).

*A note on the tests, because it caught us three times in one evening.* These
are source-reading tests, and a comment describing a defect reads as the
defect: the "no `?? \"GR\"`" check failed on the comment explaining that the
`?? "GR"` had been removed, exactly as the damage-visibility suite had failed
hours earlier on a comment saying a column was excluded. `lib/aadeFilings.test.ts`
now strips comments before matching, with the stripper itself under test. Each
of the four defects above was reintroduced one at a time and watched to fail.

### 30 August 2026

**Open damage was recorded faithfully and surfaced nowhere.** `vehicle_damages`
has carried severity, repair cost, `repaired_on` and a recharged flag since
migration 011 — and 011 built a partial index for precisely the fleet-wide
query, `vehicle_damages_open_idx ON vehicle_damages (vehicle_id) WHERE
repaired_on IS NULL`. Nothing ever ran it. The only place an open-damage count
rendered was the Damages tab inside one vehicle's modal, so the question staff
actually ask — *which cars are damaged right now?* — could only be answered by
opening all twenty-nine in turn.

This is the same shape as the licence gate before it: the data was right, the
schema anticipated the question, and no screen ever asked it. Worth naming as a
class, because it is cheap to create — a column added for a form, an index added
for a query nobody wrote yet — and invisible until someone needs the answer in a
hurry.

Now on the fleet list beside the out-of-fleet line, and in the morning briefing
below the escalated blocks. That order is deliberate: a car out of the fleet for
four days needs action today, damage needs remembering, and the briefing is read
top-down.

**Two things it deliberately does not do.**

- *It does not bar a rental.* A scuffed bumper is not a KTEO expiry.
  `lib/fleetStatus.ts` reserves `blocksRental` for the two expiries that
  genuinely void insurance cover, and the fleet row uses amber rather than the
  red that means "this vehicle must not leave the yard". Whether major damage
  should stop a hand-over is a decision for Tasos; an implementer inventing it
  as a default is how a rule nobody agreed to ends up in production.
- *It carries no money.* `repair_cost` and `charged_to_customer` stop at the
  per-vehicle ledger, which is administrator-only.

That second point needed real care, and the reasoning belongs here. The ledger's
own comment records the trap: **`proxy.ts` admits staff to `/api/admin/vehicles`
by prefix, so every route beneath that path is inside staff reach by default**,
and the ledger opts out with an explicit role check at the point of use. The new
fleet-wide endpoint stays open to staff *on purpose* — they are the ones handing
over the car, and putting the fact furthest from the person holding the keys
would defeat it — which means its `select` list is the only thing holding the
financial columns back. `lib/damageVisibility.test.ts` pins that, and pins it by
reading the *column lists of each `.select()`* rather than the raw file: the
first version failed on the endpoint's own comment saying the column is
excluded, because a text search cannot tell a query from a note about a query.
Verified by swapping in `select("*")` and watching it fail.

**`wholeDays` now has a home.** `lib/vehicleBlocks.ts` had it privately; it moves
to `lib/wholeDays.ts` so anything asking "how long has this been open" agrees.
`lib/fleetStatus.ts` keeps its own `daysBetween`, which floors to *local*
midnight where `wholeDays` uses UTC. The two agree for most of the day and
disagree near it. That divergence is recorded rather than reconciled: unifying
them changes when statutory warnings appear, which is a decision and not a
tidy-up.

**Also:** the mapping editor's "Cancel mapping" is now just "Cancel", at Tasos's
request. Both Cancels on that screen keep distinct `aria-label`s — the rate
editor has its own and both can be open at once — each starting with the visible
word, as WCAG 2.5.3 (Label in Name) requires.

### 29 August 2026

**A class of UI defect, not three separate ones.** Tasos asked for the category
mapping on Market to be protected behind an Edit button, the way the rate card
already is. Sweeping the admin for the same shape — a *saved* value rendered as
a live control, with no baseline to restore — turned up two more instances, and
the sweep is worth recording because the shape is easy to reintroduce.

*What the shape is:* a control whose initial value comes from the database and
whose `onChange` writes somewhere, rendered live on first paint. It has no
"pressed edit" step, so there is no moment at which the user declared intent,
and usually no copy of what was loaded, so there is nothing to cancel back to.
On a phone it is a mis-tap away from a silent change.

Three instances, all on pricing screens:

- **Market → Category mapping.** Every "Maps to" dropdown was live on load.
  Staff had it worse than admins: they could change every row and only learn on
  Save that `proxy.ts` lists `/api/admin/competitors/mapping` as `READ_ONLY` for
  them (asserted at `lib/staffPermissions.test.ts:84`) — the screen offered an
  edit it could never keep. Now opens disabled, needs Edit, and Cancel restores
  the last loaded or saved mapping. A *failed* save deliberately keeps the
  session open, because the edits on screen are the only copy of them.
- **Discount rules → Active**, and **Promo codes → Active.** Worse than the
  mapping, because these wrote to the database on the tap rather than to local
  state. A 20px unlabelled circle, no confirmation, no undo. Now confirms,
  naming the rule or code and the direction — "Are you sure?" on a toggle tells
  you nothing, since you cannot tell from it which way you are going.

Two defects rode along on those toggles that were not about intent at all, and
are recorded so the next audit does not re-find them:

- The target was `w-5 h-5` — 20px — on the control most likely to be hit by
  accident. `lib/ratesEditGate.test.ts` already holds the rate card's buttons to
  44px; nothing held these. The dot still renders at 20px; the hit area is 44px.
- They had no accessible name, and an *inactive* row rendered an entirely empty
  button: `{r.active && <Check/>}` puts nothing inside it, so a screen reader
  announced "button" and stopped. Now `role="switch"` with `aria-checked` and a
  label naming the row.

*Why `scripts/check-a11y.mjs` was never going to catch those two:* it covers the
public pages only. Every admin screen is outside it. That is a gap in the audit,
not a gap in the check — worth closing, but it needs a logged-in render, which
the current harness has no way to produce.

*Not changed, deliberately:* the gate on all three is presentation only, exactly
as it is on the rate card. `proxy.ts` is what actually refuses a staff write,
and that was verified against the file rather than assumed from the comment in
the page. `promo-codes` and `discount-rules` also carry a create/edit *form*,
which is a different shape — it already has an explicit Save, so a stray tap in
it writes nothing, and it was left alone.

Regression tests: `lib/ratesEditGate.test.ts` (mapping) and the new
`lib/pricingToggleGate.test.ts` (both toggles). Both were run against the
unfixed pages first — 9 and 12 failures respectively — before being trusted.

**The a11y gap that finding turned up, and what closing it cost.** The empty
button on the toggles was not an isolated slip. Sweeping every `.tsx` under
`app/admin` for buttons whose only content is an icon found **fifteen** with no
accessible name at all — announced as "button" and nothing else. Among them:
the delete buttons on Discount Rules and Promo Codes (an unlabelled X that
removes a pricing rule), the document delete inside the reservation modal, and
the calendar's date-navigation arrows. All fifteen now carry an `aria-label`
naming the row they act on, and `lib/adminButtonNames.test.ts` keeps them named.

*The scanner is worth reading before writing another one like it.* The obvious
form — `/<button[^>]*>/` — is wrong, and wrong in the direction that hides the
bug: `onClick={() => remove(id)}` contains a `>` inside the arrow, so `[^>]*`
ends the opening tag mid-handler and reads the rest of the handler as the
button's content. Every one of these buttons has an arrow handler, so the naive
scan reported **zero problems across the whole admin**. The check tracks brace,
paren and quote depth instead, and a second test pins that parser so a
regression cannot quietly turn the first test green again. This is the
"a reproduction must be able to reproduce" rule in a new costume: a check that
cannot fail is worse than no check, because it is also a claim.

**The admin's touch targets — raised, then approved and built.** The same
buttons were all below the 44px minimum the rate card is already held to: the
calendar arrows 28px (`p-1.5` + a 16px icon), the ledger deletes 21px, the
reservation-document delete 11px, the modal close buttons 20px, and the
edit/delete pair on both pricing screens 13px with no padding at all. Raised as
a design decision rather than built unasked, because it changes the density of
six screens and `docs/audits/` area 2 is ungraded; Tasos approved it the same
evening, so it is now done. Nineteen controls in total.

*The trap that shaped the fix, and it is a nasty one.* The obvious way to fix a
touch target without touching the design is to leave the control its size and
extend the hit area invisibly. Applied blindly that is worse than the bug. The
edit and delete buttons on Discount Rules are 13px icons **8px apart**, so
their centres are only 21px apart: give each a 44px invisible area and the two
overlap by **23px** — wide enough to swallow Edit's own centre. Delete is later
in the DOM, so it paints on top and wins every pixel they share. Asking the
browser `elementFromPoint` on the middle of the edit icon returns **the delete
button**. A tap aimed squarely at Edit deletes the rule, and nothing on screen
shows where the boundary went. A data-loss bug wearing an accessibility fix as
a disguise.

That is measured, not estimated: `tests/browser/touch-targets.spec.ts` asks the
browser what a thumb would hit. An earlier draft of this entry reasoned the
overlap out by hand and said "roughly 35px" — wrong arithmetic, and the reason
it is now a test rather than a sentence.

The spec asks `elementFromPoint` rather than reading
`getComputedStyle(el, "::after").width`, for two reasons. Hit testing *is* the
claim; a computed width is only a proxy, and it is the half that varies between
engines — the suite runs in Firefox as well as Chromium, and this container has
no Firefox to check against. And "the centre of Edit belongs to Delete" is
evidence anyone can act on, where "23px" needs working out. The correctly-spaced
pair is asserted alongside as the control, so the hazard test cannot be passing
for some unrelated reason.
The same spec confirms `.touch-target` does what it claims (a 38×38 button gets
a centred 44×44 hit area, overhanging 3px a side) and that the pair as shipped —
two real 44px boxes 8px apart — overlaps by exactly zero.

One of those three tests deliberately asserts a **hazard** rather than a
feature. `.touch-target` is the tempting general answer, because it costs no
visual change at all; the test measures what it does to a close-set pair so that
the next person to reach for it finds the number, instead of rediscovering it
from a support call about a rule someone deleted while aiming for Edit.

*And the instrument was verified against its own absence.* Renaming the class
and re-running looked like it passed — because `playwright.config.ts` reuses a
running server, so the browser was still being served the previous build's CSS.
The config carries a comment warning about exactly that, and it caught someone
out again. Only after a rebuild did the precondition fire as designed. Editing
CSS and re-running the browser tests proves nothing without a rebuild in
between.

So the rule here is: **make the target you can see the target you hit.**
Sixteen controls became genuinely 44×44 and, where they sit in pairs, are
spaced so their boxes cannot overlap. The invisible-extension trick survives in
exactly one place — `.touch-target` in `globals.css`, used by the three "add
row" buttons in the vehicle ledger, which are `h-[38px]` to line up with the
inputs beside them in a `grid-cols-12 items-end` row. There the 3px of extra
hit area on each side reaches into the row's own gutter, where there is nothing
to hit. The utility carries that warning in its own comment, because its safety
is a property of *where it is used*, not of the utility.

*Two things the size check caught that the name check could not.* The mobile
navigation buttons were flagged and were already correct at `w-11 h-11` — the
first version of the check looked only for `min-h-11`, and would have had an
implementer "fix" working code. It now accepts either spelling and requires
**both** dimensions, since `h-11` alone still permits a 13px-wide target. And
three modal close buttons (customer, reservation, vehicle) were 20px despite
having proper `aria-label`s all along, so the naming sweep had skipped them
entirely: being named and being reachable are different properties, and a check
for one silently passes the other.

### 28 August 2026

*Added late — see the note at the end of this entry.*

**Phase 1 built, and both migrations applied to production the same day.** §7.3
records what it turned into, including two production defects found while building it — a
turnaround applied to only one end of a rental, and a Calendar that drew a
booking a day earlier than its stored date. Neither was a date bug and neither
had a test that could have caught it: the existing ones asserted the predicate
as written rather than the behaviour it was meant to produce.

**§7.4 added — taking a vehicle out of the active fleet.** The design for the
half of `vehicle_blocks` that does not exist yet: who writes a block, what ends
one, and what chases it. Its central rule came out of Tasos pointing at the
weak point in the first sketch — a garage's promised return date was being
stored as though it were a fact, so a block would have expired on its own and
released a car that was still in pieces. Nothing now ends a block except a
person. The deferred automatic re-allocation is recorded with the constraint
that matters: it has to run through `lib/substitution.ts`, not around it.

**§4.5's schema debt is closed.** The legacy `customers.licence_number` column
is gone from production and from `supabase/schema.sql`. It had been recorded as
live drift since 25 August.

**The quote reference no longer comes from `Math.random()`.** §9a's action item
is struck through with what was done and what deliberately was not: the
generator is fixed and collisions are retried, but the reference is still the
access secret at about 30 bits, and separating the two changes the
customer-facing URL.

**The retention periods were already published; this document said they were
open.** §4.2b deferred them to area 5, and §4.2e cited five years as what other
Greek operators do, neither noticing that `lib/i18n/content/legal.ts` commits
Anadyon publicly to five years for booking data and twelve months for
unconverted enquiries. Area 5's task is to validate and honour promises already
made, not to set periods fresh — and changing them is a versioned change to a
public document. An `unconverted_enquiry` retention class was missing entirely.

**Erasure and the backups were specified in isolation and collide.** §4.2a keeps
30 daily and 12 monthly archives; §4.2b promises Article 17 erasure. Neither
mentioned the other, so an erasure would have been undone by any restore. §4.2b
now requires a suppression list re-applied on restore, recorded in `RESTORE.md`.

**A tax-inspection package and a subject-access request are not one output.**
§4.2d called them "materially the same package with a different recipient". They
differ on scope, redaction and recipient, and Article 15(4) bounds one of them
by other people's rights. Shared engine, two named packages, two selection
rules — sending the tax package to a data subject would disclose other people's
data under the banner of a GDPR right.

**Wise has no webhook, and §5.3 said it did.** The failover table folded Stripe
and Wise into one row asserting "the webhook is the source of truth". `lib/wise.ts`
states the opposite in the file itself. Split, with reconciliation stated as
visible ageing work.

**§5.3 contradicted itself on SMS** — "degrade silently" against its own closing
rule that degraded state is shown rather than hidden. Now non-blocking but
recorded and visible.

**§9a overstated the supply-chain control and understated a live defect.**
CodeQL does not run on feature-branch pushes and no Dependabot configuration
exists in the repository; both are now stated as they are. And the action item
"state the quote-reference entropy and confirm it is sufficient" invited exactly
the wrong answer: the reference is generated with `Math.random()`, so its length
is not the question. Rewritten to name the generator, with the separate
128-bit-token design. The code fix is tracked outside this document.

**§4.2's finalisation gateway cannot work as written, and is now marked OPEN.**
Every non-test `.rpc()` call site uses `supabaseAdmin`, under which `auth.uid()`
is NULL — so a gateway verifying `auth.uid()` against staff membership rejects
everything or waves everything through. This is the second mechanism specified
in that section without checking how the application reaches the database. It is
deliberately left unresolved rather than patched a third time; the write-up is
`docs/OPEN-QUESTION-RPC-STAFF-IDENTITY.md`.

**Why this entry is late, and what that cost.** §10 opens by saying the document
is revised in place and each entry says what changed and why. Between 25 and 27
August roughly 600 lines were added — §1.10, §7.1a, §4.2a's correction, §4.2b
through §4.2e, §5.3, §9a and the messaging amendment — and **not one produced an
entry here**. A reader consulting this history would have concluded nothing
changed after the 25th and re-derived it, which is the failure the section
exists to prevent. The entries below were reconstructed from the branch
afterwards; writing them at the time would have been cheaper and more accurate.

### 27 August 2026

*Reconstructed 28 August from the branch history.*

**§5.3 added — what happens when a dependency is down.** Nothing here previously
said, despite the 23 August admin outage having already happened. The rule:
security fails closed, convenience degrades, money never silently succeeds.
Stated per dependency, with the honest limit that there is no failover *target*
— Supabase Free has no replica.

**§4.2b, §4.2c, §4.2d, §4.2e added** — retention and destruction; whether the
delivery tablet can also take payment; the full file for one rental on demand;
and how long identity documents may be kept, with the distinction between the
transaction record and a photograph of a passport.

**§9a added — a threat model.** Six adversaries, what each wants, which control
answers it, and where the answer is thin. The weakest area is the insider: no
audit trail of reads, made more consequential by §4.2d's export.

**The Make.com credential closed, the class of exposure kept open.** The key was
rotated and the scenarios retired — both steps, because retiring a scenario
revokes nothing. What remains is that credentials held outside this repository
escape every control this document describes.

**Messaging entry amended.** Greek alphanumeric sender IDs must be registered or
messages are rejected, which is a gate rather than a fee; and Viber with SMS
fallback is the channel Greek consumers actually read, so the abstraction should
be channel-agnostic rather than provider-agnostic.

### 26 August 2026

*Reconstructed 28 August from the branch history.*

**§1.10 added, then downgraded the same day.** GoCars.online was added as the
first vendor admitted under §1.9's stop rule, from a single pass over the
vendor's feature page recorded as fact. A second read of the same page
reproduced neither the bicycle support nor the absence of damage capture. The
section is now vendor claims with an epistemic note, and the disputed items are
marked unverified rather than absent: **a feature page that does not mention
something is not a vendor that lacks it.**

**§7.1a added** — a bounded two-day GoCars gate for the partner channel, because
§1.10 said build-versus-buy should be examined there while §7 told the
implementer to build it. The decisive question is whether the partner portal can
operate without moving booking, pricing and AADE onto their platform.

**Four defects corrected in §4.2**, three of them specifications that could not
have been built: a private schema unreachable through the Data API; composite
foreign keys whose targets carried no unique constraint; evidence that would not
have survived a restore because Storage objects are not in database backups; and
a shared-template rule that was stated but never enforced.

### 25 August 2026

**Counter architecture decided before phase 2.** Build the narrow counter in
Anadyon and keep one operational source of truth; do not adopt a second system
whose mixed-fleet and round-trip API behaviour are unverified. §4.2 now defines
the implementable model, evidence storage, damage observations, adjustment
ledger, idempotent finalisation, security boundary and real-device acceptance
gate. The safety kernel moves before check-out, and the local partner channel
moves from deferred to phase 4, ahead of reporting but behind the counter and
agreement controls.

**Live-schema claim corrected.** Production still carries legacy
`customers.licence_number` beside canonical `driving_licence_number`; §4.5 no
longer calls that debt resolved.

**Benchmark frozen at sixteen.** A new vendor is added only when it changes a
recorded decision, not because it repeats an existing feature list.

**Added §1.6, the local field.** The eleven systems in §1 are what a Greek
operator would *buy*. None of them is what our two tracked competitors *run*:
`ionianrentals` and `motorclubzante` both resolve to `ezcar.eu` tenants — one
product with two skins. Their ceiling is published rather than guessed, they
have none of the counter workflow in §3, and the single capability they hold
that we do not is the **affiliate channel**, now promoted to phase 4 in §7.

**§4.5 source-schema debt was initially recorded as resolved.** Only
`driving_licence_number` survives in the repository baseline and application
code. A later live-schema verification on the same date found the production
legacy column still present; the correction and phase-1 action are recorded
above rather than erasing how the false conclusion occurred.

**Audits committed.** The three full-system audits moved into `docs/audits/`
with the ten review areas they are scored against. They had lived outside
version control. See `docs/audits/README.md`.

**Added §1.7 and §1.8.** Three systems the original survey missed — CarCEO Pro,
HQ Rental and Rentware. CarCEO publishes $129/month for unlimited vehicles
covering most of §7, which raised a build-or-buy question §8 had never asked.
It was initially recorded undecided and resolved later the same day in the
decision above.

### Shipped since 17 August — verified against the code, not the PR titles

None of the phase work in §7 shipped in the integrity releases summarised
below. What shipped was the layer underneath it, most of it in response to
something found rather than something planned.

| Area | What changed | Where |
|---|---|---|
| **Pricing integrity** | Vehicle type, pricing group and transmission are derived server-side from a canonical catalogue; an unknown model is refused rather than guessed. The client total no longer takes part in the idempotency key | `lib/vehicleCatalogue.ts` |
| **Promo integrity** | Promo uses became a ledger — hold, redeem, release, with expiry — so an abandoned quote can no longer exhaust a code | migration `20260823170000` |
| **Seat limits** | Baby plus child seats capped at 3 combined, as a database check constraint with a pre-flight guard, not a form rule | `lib/seatLimits.ts` |
| **Email truth** | Workflow stage is derived from `booking_email_deliveries`; `pending`, `queued` and `failed` are never read as sent. All workflow mail routes through an audited path | `lib/emailWorkflowStage.ts`, `lib/auditedMail.ts` |
| **Substitution consent** | A blocked substitution now carries a typed reason, and the subset a customer may consent to is explicit rather than implied | `lib/substitution.ts` |
| **Vehicle allocation** | Eligibility and substitution warnings reach every entry point, not only the Quotes screen; the customer's original request is shown beside the selector | `app/admin/components/ReservationModal.tsx` |
| **Admin availability** | Auth calls time out at 8 s and fail closed with a diagnostic log line, after a lockout whose cause was never established | `proxy.ts`, `docs/INCIDENT-ADMIN-MIDDLEWARE-TIMEOUT.md` |
| **Staff permissions** | Staff routing is method-aware — read-only where it should be, write where the role earns it | `proxy.ts` |
| **CAPTCHA** | Preview uses Google's test pair; a build-time guard refuses to produce a production bundle carrying the test site key, after that combination silently rejected every live booking | `next.config.ts`, `lib/recaptchaKeys.ts` |
| **Migration safety** | The numbered migration and its SQL Editor paste copy are enforced identical by test, after a stale copy reached production | `lib/migrationPasteParity.test.ts` |

**What this pattern says.** Nine of the ten rows are integrity work, and most
began as a defect found in production. That is the cost of a system whose
correctness lives in the database rather than in a vendor's warranty — and the
argument for §7 phase 2 being counter work rather than more of this: the counter
is where the *next* class of dispute comes from, and there is currently no
record to settle it with.

### Still pending, unchanged

- **AADE Digital Client List** — columns present, Vercel environment variables
  and Supabase columns still to be set. `⚠️` in §2 remains accurate.
- **NBG hosted checkout** — built, gated behind an open PR.
- **Damage log** — **done, and this line was wrong for weeks.** A full Damages
  tab has existed in `VehicleModal` (add, remove, severity, repair cost,
  recharged flag) behind `/api/admin/vehicles/[id]/ledger`; as of 30 August it
  is also visible fleet-wide. Left uncorrected, this entry was an invitation to
  rebuild what was already built — the §9 failure exactly. Checked against the
  code, not against this list, before being rewritten.

  *The other two entries above were checked the same way and are accurate.* The
  AADE columns really are present — they are named `dcl_status` and `dcl_mark`
  in `001_baseline.sql`, with `claim_dcl_submission()` and a unique index on the
  mark, so a search for "aade" in the migrations finds nothing and proves
  nothing. Only the environment variables remain outstanding.

---

## Sources

**Wheelsys:** [wheelsys.com](https://wheelsys.com/) · [Auto Rental News directory](https://www.autorentalnews.com/auto-rental-news-solution-directory/companies/wheels-car-rental-system) · [Halcyon Equity](https://halcyonequitypartners.com/portfolio-archive/wheelsys/)

**Coastr:** [coastr.com](https://www.coastr.com) — **RentSyst:** [rentsyst.com](https://rentsyst.com) — **Rent Centric:** [rentcentric.com](https://www.rentcentric.com)

**TSD:** [tsdweb.com](https://tsdweb.com/car-rental-software/) · [Reynolds acquisition](https://www.autorentalnews.com/10225932/reynolds-acquires-tsd-mobility-solutions) · [ARRC module detail](https://arrc.net/tsd-car-rental-management-software/)

**RENTALL / consolidation:** [80+ platforms compared](https://fleets.levyelectric.com/blog/best-car-rental-car-sharing-software)

**IOS Rentals 4:** [isopensource.com](https://www.isopensource.com/news/ios-rentals-4.html) — **RentingPilot:** [rentingpilot.com](https://rentingpilot.com)

**Counter workflow:** [Record360](https://record360.com/blog/what-to-check-when-renting-a-car-an-inspection-checklist/) · [ProovStation](https://proovstation.com/industries/rental) · [Alpha Software](https://www.alphasoftware.com/blog/car-rental-damage-form-examples-templates)

**KPIs:** [Nomora](https://www.nomora.io/blog/fleet-reporting-car-rental-maximize-utilization-profit) · [Worco](https://www.worco.io/blog/car-rental-revenue-management-strategies/) · [Camasys](https://www.camasys.com/posts/must-track-kpis-for-car-rental-success)

**Greek obligations:** [ΕΕΑ](https://www.eea.gr/arthra-eea/pos-mporo-na-idryso-etaireia-enoikiasis-aytokiniton/) · [EUGO](https://eugo.gov.gr/services/226431)
