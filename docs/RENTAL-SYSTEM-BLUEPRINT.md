# Anadyon Rental System — Architecture Blueprint

**Written:** 17 August 2026 · **Revised:** 17 August 2026 (second pass — Wheelsys, IOS Rentals, RentingPilot)
**Purpose:** benchmark the build against the platforms a Greek rental operator
would otherwise buy, state honestly where it falls short, and set the
architecture for closing that gap.

This is a reference document. It records *why* things are built the way they
are, so a decision taken today is not silently reversed in six months. Research
findings are attributed; judgement calls say so.

---

## 1. The benchmark

### 1.1 The direct comparison — Wheelsys

**Wheels Car Rental System (Wheelsys)** is the benchmark that matters most, and
it was not in the first draft of this document. Athens-based, founded 2003,
**1200+ rental operators across 100+ countries**, private-equity backed, roughly
$4.6M ARR. Its client list includes Green Motion and franchises of **Europcar,
Avis, Sixt, Hertz, Budget, Enterprise, Payless and National/Alamo**.

A Greek company, selling to Greek operators, already fiscalised for Greece. This
is the product Anadyon would be buying if it were not being built.

Its stated positioning — *"Sell Online, Book, Rent, Bill, Manage, and Report
from a Single Platform"* — is the shape of the category.

| Wheelsys capability | Anadyon |
|---|---|
| Standard rates, rate plans | ✅ seasonal + duration bands |
| Promotions & upgrades | ✅ promo codes, discount rules |
| **Yield-managed rates** | ❌ |
| **Stop-sells** | ❌ |
| Multi-currency rates | ❌ (EUR only — correct for one island) |
| **Real-time rates to OTAs and brokers** | ❌ direct booking only |
| *"Designed for speed at the counter"*, tablet-friendly | ❌ no counter at all |
| **40+ accounting integrations** | ⚠️ AADE only |
| **Customisable + scheduled email reports** | ❌ |
| **Real-time dashboards, alerts and notifications** | ⚠️ one daily cron |
| **Full card tokenization** (Stripe, Windcave, Worldpay…) | ✅ Stripe, no PAN stored |
| Fiscalization: Greece, Italy, Bulgaria, Turkey, Croatia… | ✅ Greece (AADE myDATA) |
| Franchise management, long-term rental | ❌ not applicable |

**Validation worth noting:** Wheelsys uses *full tokenization* for cards. The
decision to store Stripe references and never a card number is what the market
leader does, not a cautious deviation from it.

### 1.2 The Greek/Italian mid-market — IOS Rentals 4

Directly comparable in market and scale. Four editions by company count
(Standard 2, Business 15, Enterprise unlimited, plus SaaS).

Notable features Anadyon lacks:

- **AADE Digital Client List** — Anadyon already has `dcl_status` and `dcl_mark`
  columns, so this is wired but unproven.
- **Review-triggered coupons** — request a review after a rental, and on a
  minimum score automatically issue a coupon, as a percentage tied to the last
  or next reservation. A retention loop Anadyon has no equivalent of.
- Payment rails: PayPal Checkout, **Nexi XPay**, **myPOS** — both common in
  Greece and neither currently supported.
- Vehicle damages management, multi-company, fast model search.

### 1.3 The adjacent layer — RentingPilot

**Not a rental management system.** It is an AI booking-capture layer designed
to sit in front of an existing website:

- *Cara*, an AI agent answering chat, **WhatsApp** and **voice**, 24/7, in 30+
  languages, converting conversations into structured booking requests
- Website scanning to import fleet, photos and pricing
- **Demand-based rate suggestions requiring owner approval**
- Conversion metrics; EU-hosted, GDPR

Two things are worth taking from it. **WhatsApp and voice capture out of hours**
is a real gap for an island operator whose customers are mid-journey. And its
pricing intelligence is *demand-heuristic* — Anadyon's competitor rate
collection is a stronger input to the same decision, and already built.

### 1.4 The wider field

| System | Position |
|---|---|
| **RENTALL** (Bluebird + Thermeon + Navotar, merged 2024) | consolidated mid-market incumbent |
| **HQ Rental Software** | completeness benchmark for independents |
| **TSD** (Reynolds & Reynolds) | oldest; insurance-replacement and dealer-loaner depth |
| **RentWorks** | reservations, inventory, maintenance, billing |
| **Record360 / ProovStation / Self-Inspection** | specialist condition capture the majors bolt on |

---

## 2. Where Anadyon actually stands

Assessed against the live database on 17 August 2026 — 17 tables, 267 columns.

| Module | Status | Evidence |
|---|---|---|
| Reservations | **at par** | pending → confirmed → active → returned, plus cancelled / no_show / voided |
| Booking engine | **at par** | public quote → email → conversion |
| Rate management | **above par** | seasonal + duration bands, promos, discount rules — **plus live competitor rate collection, which no benchmark system offers** |
| Fleet register | **at par** | 24 columns incl. KTEO, road tax, insurance, service, odometer, acquisition |
| Cost tracking | **at par** | `vehicle_costs`, typed and dated |
| Card handling | **at par** | Stripe tokenization, no PAN — matches Wheelsys |
| Greek fiscalisation | **at par** | AADE myDATA; DCL columns present |
| Damage log | **schema only** | `vehicle_damages` exists; no capture UI |
| **Counter operations** | **absent** | ← largest gap; Wheelsys designs its whole UI around this |
| Condition capture | **absent** | no photos, fuel or odometer at handover |
| Digital agreement | **absent** | no signature, no generated μισθωτήριο |
| Reporting / KPIs | **absent** | no utilisation, no revenue per vehicle |
| Stop-sells | **absent** | cannot withdraw a vehicle from sale for a date range |
| Alerts / dashboards | **weak** | one daily cron against Wheelsys's real-time alerting |
| Accounting integration | **narrow** | AADE only, against 40+ |
| OTA / broker distribution | **absent** | direct booking only — a deliberate position, see §8 |

**Honest summary:** the front of the business is at or above the benchmark —
quoting, seasonal pricing, AADE invoicing, and competitor rate collection that
none of these products offer. **The counter does not exist.** Everything between
"customer arrives" and "vehicle returns" happens on paper.

---

## 3. The counter gap, and why it matters most

Wheelsys advertises *"designed for speed at the counter"* and *"tablet friendly"*
as headline features. Record360 and ProovStation exist as standalone products
serving only this. The reason is disputes: timestamped condition photographs are
what make a damage charge defensible. Without them the operator either absorbs
damage they cannot prove, or charges for damage they cannot evidence.

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

The last line connects to §5: turnaround is not a scheduling nicety, it is the
state the vehicle enters at check-in.

---

## 4. Proposed data model

### 4.1 Already built

```
vehicles            registration, KTEO, road tax, insurance, service,
                    odometer, purchase, turnaround_minutes, transmission
vehicle_costs       typed outlay per vehicle, dated, with period coverage
vehicle_damages     description, severity, repair cost, charged_to_customer,
                    linked reservation, photo
```

### 4.2 To build — the counter

```
rental_handovers
  id, reservation_id, direction ('out' | 'in'),
  occurred_at, staff_name,
  odometer_km, fuel_eighths (0-8, as the gauge reads),
  cleanliness ('clean' | 'acceptable' | 'poor'),
  notes, signature_url, created_at
```

One row per direction. A reservation has at most two, and the difference between
them is the whole story of the rental: distance covered, fuel consumed,
condition changed.

```
handover_photos
  id, handover_id, angle ('front'|'rear'|'left'|'right'|'interior'|'other'),
  photo_url, taken_at
```

Photographs are a table rather than columns because the count varies and angles
must be comparable between out and in. `photo_1..photo_6` would make the
comparison positional and fragile.

**Fuel in eighths:** what the gauge shows and what staff can read without
arithmetic. A percentage invites false precision and argument.

### 4.3 To build — stop-sells

```
vehicle_blocks
  id, vehicle_id, starts_on, ends_on,
  reason ('maintenance'|'kteo'|'insurance_lapsed'|'sold'|'owner_use'|'other'),
  notes, created_at
```

Wheelsys calls this **stop-sells**, and Anadyon has no equivalent: a vehicle can
only be withdrawn by changing its status, which removes it from *every* date
rather than a period. Statutory expiry should generate one of these
automatically — a vehicle past KTEO is not merely inadvisable to rent, its
insurance is void.

### 4.4 To build — derived reporting

No new tables. Every figure is computed, so it cannot go stale:

| Metric | Computation | Benchmark |
|---|---|---|
| **Utilisation** | rental days ÷ available days | >70% healthy, 70–85% target |
| **RevPAV** | revenue ÷ available vehicle days | the primary revenue KPI |
| **Average rental length** | mean `rental_days` | trend, not target |
| **Turnaround achieved** | check-in → next check-out | against `turnaround_minutes` |
| **Maintenance ratio** | `vehicle_costs` ÷ revenue | should stay under 15% |
| **Margin per vehicle** | revenue − all costs | the number the fleet is judged on |

Utilisation must exclude days a vehicle was retired, in maintenance or blocked —
otherwise a car off the road drags the average down and hides the performance of
the ones actually working.

---

## 5. Operational mechanics

### 5.1 Built

**Turnaround.** Availability compares full timestamps and adds each vehicle's
turnaround window to the end of every rental before measuring overlap. 120
minutes for cars, 60 for scooters, 30 for bicycles — the operator's figures for
this fleet, not an industry benchmark. A true double-booking and a too-short gap
are reported differently.

**Substitution.** Three rules, matching ACRISS practice: transmission is never
crossed (checked first, and inferred from the model where the quote states no
preference); an upgrade is free; a downgrade needs consent and a lower price.
Cross-family swaps are refused outright.

### 5.2 To build

**Statutory gating.** KTEO, road tax and insurance expiry each carry a fine, and
KTEO expiry voids insurance. A vehicle past expiry must not be assignable — this
should raise a `vehicle_block`, not merely a warning.

**Maintenance blocking.** A vehicle in `maintenance` is currently still
selectable.

**Service due by distance.** `service_interval_km` and `odometer_km` exist; once
check-in records the odometer, service due becomes calculable rather than a date
someone remembers.

**Overdue returns.** A reservation past its return time with no check-in is the
most time-critical state in a rental business, and nothing surfaces it.

**Alerting.** Wheelsys ships real-time dashboards and a notification system.
Anadyon has one daily cron. Expiry, overdue return and service due should reach
staff when they happen.

---

## 6. Greek-specific obligations

Not covered by the international systems, and the reason a Greek product like
Wheelsys or IOS Rentals wins locally:

- **AADE myDATA** — invoice transmission. Built.
- **AADE Digital Client List** — `dcl_status` / `dcl_mark` present; IOS Rentals
  markets this explicitly, so it is table stakes locally.
- **KTEO** — roadworthiness. Expiry voids insurance, so it gates rental.
- **Τέλη κυκλοφορίας** — circulation tax, annual, due each December.
- **Μισθωτήριο συμβόλαιο** — the rental agreement. Personal insurance takes
  effect only on the renter's signature, which makes signature capture a legal
  requirement rather than a convenience.

---

## 7. Build order

Sequenced by operational risk.

| Phase | Scope | Rationale |
|---|---|---|
| **1** | Fleet screen — statutory dates with expiry warnings, cost entry, damage log, margin per vehicle | data exists and is invisible; expiry carries fines and voids insurance |
| **2** | Check-out / check-in with odometer, fuel, condition and photos | largest gap; source of every damage dispute |
| **3** | Stop-sells + statutory gating | prevents renting a vehicle that is uninsured |
| **4** | Digital agreement and signature | legally required for the insurance clause |
| **5** | Reporting — utilisation, RevPAV, margin | needs phase 2 data to mean anything |
| **6** | Alerts — expiry, overdue return, service due | cheap once the data exists |

### Deferred, worth revisiting

- **Review-triggered coupons** (IOS Rentals) — a retention loop with no
  equivalent here.
- **WhatsApp / out-of-hours capture** (RentingPilot) — genuinely relevant to an
  island operator whose customers are mid-journey.
- **Nexi XPay / myPOS** — Greek payment rails both comparables support.

---

## 8. Deliberately not built

Recorded so these stay decisions rather than omissions:

- **Card numbers are never stored.** Stripe references, brand and last four
  only — which is what Wheelsys does. The line between PCI DSS SAQ-A and SAQ-D.
- **Profitability is never stored.** Revenue minus costs, both of which move.
- **OTA and broker distribution.** Wheelsys's real-time feeds to OTAs are its
  strongest commercial feature, and are deliberately not replicated: broker
  channels bring volume at commission and price pressure, against a direct
  booking engine that keeps the margin. Revisit only if direct demand stalls.
- **Multi-currency, franchise, long-term rental.** Wheelsys features answering
  problems a 29-vehicle single-island operator does not have.
- **GPS tracking.** Cost without a question it answers, at this fleet size.
- **AI damage detection.** Timestamped photographs already make a charge
  defensible; automated detection adds cost and its own dispute surface.
- **Server-side price recalculation.** Pricing is computed once, client-side.

---

## 9. Standing principles

See `DEFINING-STATEMENTS.md`. The two bearing most on this document:

- **The public site and the rental system collect the same data.** A field
  collected on a quote the reservation cannot store is a dead end.
- **Claims are verified, not assumed.** Schema against the live database, DNS
  against live resolvers, vendor behaviour against vendor documentation.

---

## Sources

**Wheelsys:** [wheelsys.com](https://wheelsys.com/) ·
[Auto Rental News directory](https://www.autorentalnews.com/auto-rental-news-solution-directory/companies/wheels-car-rental-system) ·
[Halcyon Equity Partners portfolio](https://halcyonequitypartners.com/portfolio-archive/wheelsys/) ·
[Carcloud integration](https://www.autorentalnews.com/10243208/carcloud-com-wheelsys-boost-online-access-for-car-rental-customers)

**IOS Rentals 4:** [isopensource.com](https://www.isopensource.com/news/ios-rentals-4.html)

**RentingPilot:** [rentingpilot.com](https://rentingpilot.com)

**Wider field:** [RENTALL consolidation](https://fleets.levyelectric.com/blog/best-car-rental-car-sharing-software) ·
[HQ Rental / Navotar / TSD comparison](https://www.myhospitalnow.com/blog/top-10-car-rental-management-software-features-pros-cons-comparison/)

**Counter workflow:** [Record360 checklist](https://record360.com/blog/what-to-check-when-renting-a-car-an-inspection-checklist/) ·
[ProovStation](https://proovstation.com/industries/rental) ·
[Alpha Software damage forms](https://www.alphasoftware.com/blog/car-rental-damage-form-examples-templates)

**KPIs:** [Nomora fleet reporting](https://www.nomora.io/blog/fleet-reporting-car-rental-maximize-utilization-profit) ·
[Worco revenue management](https://www.worco.io/blog/car-rental-revenue-management-strategies/) ·
[Camasys KPI guide](https://www.camasys.com/posts/must-track-kpis-for-car-rental-success)

**Greek obligations:** [ΕΕΑ](https://www.eea.gr/arthra-eea/pos-mporo-na-idryso-etaireia-enoikiasis-aytokiniton/) ·
[EUGO](https://eugo.gov.gr/services/226431)
