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

Fifteen systems examined. They divide into four distinct positions, and knowing
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
  Of the fifteen systems now surveyed, only IOS Rentals and Wheelsys
  (§1.1) claim them. Neither CarCEO nor HQ Rental mentions Greek fiscalisation.
- **The competitor rate engine.** Five live feeds into a comparison view appears
  in **none** of the fifteen. It is the one place this system leads, and it
  would not survive a migration.
- **Server-side price verification.** §8b. Not advertised by any of them.
- **The mixed fleet.** Cars, scooters and bicycles in one system — only Rent
  Centric and IOS Rentals do this.
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

**Sources:** [carceo.pro](https://carceo.pro/) ·
[HQ Rental via SoftwareAdvice](https://www.softwareadvice.com/retail/hq-rental-profile/) ·
[HQRent feature overview](https://hqrent.com/rental-features) ·
[Rentware via Capterra](https://www.capterra.com/p/182136/Rentware/)

---

### 1.9 Benchmark stop rule

The benchmark stops at fifteen systems. No product is added merely because it
exists or repeats a capability already represented here. Add one only when
primary vendor evidence would change one of these decisions: build versus buy
the counter; Greek fiscalisation; mixed-fleet support; the local partner
channel; or a deliberate exclusion in §8. If it changes no decision, recording
it creates maintenance rather than knowledge.

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
  odometer_km integer NULL CHECK >= 0
  fuel_eighths smallint NULL CHECK 0-8
  cleanliness ('clean' | 'acceptable' | 'poor') NULL
  notes, void_reason

handover_photos
  id uuid PK, handover_id uuid NOT NULL FK rental_handovers
  template_view_id uuid NOT NULL, sequence smallint NOT NULL
  object_path text UNIQUE NOT NULL, mime_type, byte_size, width_px, height_px
  sha256, captured_at, uploaded_at, captured_by

inspection_templates
  id, vehicle_category, version, active, created_at

inspection_template_views
  id, template_id, view_code, label, sort_order, required
  UNIQUE (template_id, view_code)

handover_damage_observations
  id, handover_id, damage_id FK vehicle_damages,
  observation ('pre_existing'|'unchanged'|'worsened'|'new'), notes
  UNIQUE (handover_id, damage_id)

handover_damage_photos
  observation_id, photo_id
  PRIMARY KEY (observation_id, photo_id)

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
   service-role key. Privileged finalisation functions revoke EXECUTE from
   `PUBLIC` and are callable only by the server route after admin/staff auth.

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
`licence_number` and canonical `driving_licence_number`. Phase 1 must verify the
legacy column is unused/empty, backfill any value that exists, then remove it
through the normal reviewed migration-and-paste workflow. Licence verification
must use `driving_licence_number`; the legacy column is not a fallback source.

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
| **1** | Finish the Fleet foundation; add `vehicle_blocks`, statutory/maintenance availability gating and a licence-expiry check using the existing canonical field; close the live licence-column drift | the counter must not be capable of releasing a blocked vehicle or an invalid driver |
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
and statements, and a partner can read only rows belonging to its account. The
server remains the normal write path; tenant-scoped RLS is defence in depth.
No partner receives admin navigation, fleet cost data, competitor rates,
customer marketing lists or another partner's customer data.

Explicitly excluded from the MVP: partner-owned vehicles, special partner rate
cards, OTA/broker feeds, multi-level commissions and automated payouts. Those
are different business models, not hidden phase-4 requirements.

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

## 10. Revision history and what has shipped

This document is revised in place. Each entry says what changed and why, so a
reader six months out can follow the reasoning without re-deriving it.

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

**Benchmark frozen at fifteen.** A new vendor is added only when it changes a
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
- **Damage log** — schema only, still no UI. Phase 1 in §7.

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
