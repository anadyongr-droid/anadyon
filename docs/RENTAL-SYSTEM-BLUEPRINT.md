# Anadyon Rental System — Architecture Blueprint

**Written:** 17 August 2026
**Purpose:** benchmark the system against the platforms a rental business of this
size would otherwise buy, state honestly where it falls short, and set the
architecture for closing that gap.

This is a reference document. It records *why* things are built the way they
are, so a decision taken today is not silently reversed in six months. Where a
claim comes from research it is attributed; where it is a judgement call it says
so.

---

## 1. The benchmark

The systems an independent operator would realistically be compared against:

| System | Position |
|---|---|
| **RENTALL** (Bluebird + Thermeon + Navotar, merged 2024) | the consolidated mid-market incumbent |
| **HQ Rental Software** | the completeness benchmark for independents — counter management, booking engine, maintenance scheduling |
| **TSD** (Reynolds & Reynolds) | oldest in the category; insurance-replacement and dealer-loaner depth |
| **RentWorks** | reservations, inventory, maintenance, billing |
| **Record360 / ProovStation / Self-Inspection** | the specialist condition-capture layer the majors bolt on |

Their **common module set** — the definition of "at par":

1. Reservations and a booking engine
2. Fleet register with statutory dates and maintenance scheduling
3. Counter operations: check-out and check-in with condition capture
4. Damage lifecycle with photographic evidence
5. Billing, deposits and ancillary charges
6. Customer records with document capture
7. Reporting: utilisation, revenue per vehicle, maintenance cost

---

## 2. Where Anadyon actually stands

Assessed against the live database on 17 August 2026 — 17 tables, 267 columns.

| Module | Status | Evidence |
|---|---|---|
| Reservations | **at par** | full lifecycle: pending → confirmed → active → returned, plus cancelled / no_show / voided |
| Booking engine | **above par** | public quote → email → conversion, with client-side pricing and seasonal rate bands |
| Rate management | **above par** | seasonal bands, duration bands, promo codes, discount rules — plus live competitor rate collection, which none of the benchmark systems include |
| Fleet register | **now at par** | 24 columns incl. KTEO, road tax, insurance, service, odometer, acquisition |
| Cost tracking | **now at par** | `vehicle_costs`, typed and dated per outlay |
| Damage log | **schema only** | `vehicle_damages` exists; no capture UI yet |
| Check-out / check-in | **absent** | ← the largest single gap |
| Condition capture | **absent** | no photo evidence, no fuel, no odometer at handover |
| Digital agreement | **absent** | no signature, no generated μισθωτήριο |
| Reporting / KPIs | **absent** | no utilisation, no revenue per vehicle |
| Customer records | **above par** | 39 columns incl. passport, licence, expiry dates, DNR flag |
| Accounting integration | **above par** | AADE myDATA invoicing — a Greek requirement the international systems do not cover |

**Honest summary:** the front of the business — quoting, pricing, booking,
invoicing — is at or above the benchmark. The *counter* is not built at all.
Everything between "customer arrives" and "vehicle returns" happens on paper.

---

## 3. The counter gap, and why it matters most

Every benchmark system treats check-out and check-in as the operational spine,
and the specialist vendors exist solely to serve it. The reason is disputes:
condition capture with timestamped photographs is what makes a damage charge
defensible. Without it, the operator absorbs damage they cannot prove, or
charges for damage they cannot evidence — both expensive.

**The workflow the benchmark implements:**

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

That last line is where item 5 already connects: turnaround is not a scheduling
nicety, it is the state the vehicle enters at check-in.

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
  odometer_km, fuel_level (0-8 eighths, as the gauge reads),
  cleanliness ('clean' | 'acceptable' | 'poor'),
  notes, signature_url,
  created_at
```

One row per direction. A reservation therefore has at most two, and the
difference between them is the whole story of the rental: distance covered, fuel
consumed, condition change.

```
handover_photos
  id, handover_id, angle ('front'|'rear'|'left'|'right'|'interior'|'other'),
  photo_url, taken_at
```

Photographs are a separate table rather than columns because the count varies
and the angles must be comparable between out and in. Storing them as
`photo_1..photo_6` would make the comparison positional and fragile.

**Why fuel in eighths:** it is what the gauge shows and what staff can read
without arithmetic. A percentage invites false precision and disagreement.

### 4.3 To build — derived reporting

No new tables. Every figure below is computed from existing rows, so it cannot
go stale:

| Metric | Computation | Benchmark |
|---|---|---|
| **Utilisation** | rental days ÷ available days | >70% healthy, 70–85% target |
| **RevPAV** | revenue ÷ available vehicle days | the primary revenue KPI |
| **Average rental length** | mean `rental_days` | trend, not target |
| **Turnaround achieved** | check-in → next check-out | against `turnaround_minutes` |
| **Maintenance ratio** | `vehicle_costs` ÷ revenue | should stay under 15% |
| **Margin per vehicle** | revenue − all costs | the number the fleet is judged on |

Utilisation must exclude days a vehicle was `retired` or in `maintenance`,
otherwise a car off the road drags the fleet average down and hides the
performance of the cars actually working.

---

## 5. Operational mechanics (item 5)

### 5.1 Turnaround — built

Availability compares full timestamps and adds each vehicle's turnaround window
to the end of every rental before measuring overlap. 120 minutes for cars, 60
for scooters, 30 for bicycles — the operator's figures for this fleet, not an
industry benchmark. A true double-booking and a too-short gap are reported
differently: the first is impossible, the second is the operator's judgement.

### 5.2 Substitution — built

Three rules, matching ACRISS practice:

- **Transmission is never crossed.** Checked first and independently of
  category. Where a quote states no preference, the expectation is derived from
  the model chosen — someone who picked a Fiat Panda picked a manual car.
- **An upgrade is free.** Higher category at the quoted price, no permission.
- **A downgrade needs consent and a lower price.** Asks once rather than
  blocking; that conversation happens on the phone.
- Cross-family swaps (a scooter for a car) are refused outright.

### 5.3 To build

**Statutory date alerts.** KTEO, road tax and insurance expiry each carry a fine
and, for KTEO, void insurance cover. The fleet screen must surface these before
they lapse, and a vehicle past expiry should not be assignable to a new
reservation at all.

**Maintenance blocking.** A vehicle in `maintenance` status is currently still
selectable. It should be refused, with the reason stated.

**Service due by distance.** `service_interval_km` and `odometer_km` exist; once
check-in records the odometer, service due becomes calculable rather than a date
someone remembers to update.

**Overdue returns.** A reservation past its return time with no check-in is the
single most time-critical state in a rental business, and nothing currently
surfaces it.

---

## 6. Greek-specific obligations

These are not covered by any international system and are genuine
differentiators for this build:

- **AADE myDATA** — invoice transmission. Already built.
- **KTEO** — roadworthiness. Expiry voids insurance, so it gates rental.
- **Τέλη κυκλοφορίας** — circulation tax, annual, due each December for the
  following year.
- **Μισθωτήριο συμβόλαιο** — the rental agreement. Personal insurance takes
  effect only on the renter's signature, which makes signature capture a legal
  requirement rather than a convenience.

---

## 7. Build order

Sequenced by operational risk, not by ease.

| Phase | Scope | Rationale |
|---|---|---|
| **1** | Fleet screen — statutory dates with expiry warnings, cost entry, damage log, margin per vehicle | the data exists and is invisible; expiry dates carry fines |
| **2** | Check-out / check-in with odometer, fuel, condition and photos | the largest gap, and the source of every damage dispute |
| **3** | Digital agreement and signature | legally required for the personal-insurance clause |
| **4** | Reporting — utilisation, RevPAV, margin | needs phase 2 data to be meaningful |
| **5** | Alerts — expiry, overdue return, service due | cheap once the data exists |

---

## 8. Deliberately not built

Recorded so these are decisions rather than omissions:

- **Card numbers are never stored.** Stripe references, brand and last four
  only. This is the line between PCI DSS SAQ-A and SAQ-D, and SAQ-D is an audit
  obligation no business this size should take on.
- **Profitability is never a stored column.** It is revenue minus costs, both of
  which move; a stored figure becomes a second source of truth that goes stale.
- **GPS tracking.** Offered by every benchmark system. For a fleet of 29 on one
  island it is cost without a question it answers.
- **AI damage detection.** The specialist vendors' headline feature. Photographs
  with timestamps already make a charge defensible; automated detection adds
  cost and a dispute surface of its own.
- **Server-side price recalculation.** Pricing is computed once, client-side.
  A second implementation would drift from the first.

---

## 9. Standing principles

See `DEFINING-STATEMENTS.md`. The two that bear most on this document:

- **The public site and the rental system collect the same data.** A field
  collected on a quote that the reservation cannot store is a dead end.
- **Claims are verified, not assumed.** Schema against the live database, DNS
  against live resolvers, vendor behaviour against vendor documentation.

---

## Sources

Benchmark systems: [RENTALL / Bluebird consolidation](https://fleets.levyelectric.com/blog/best-car-rental-car-sharing-software) ·
[HQ Rental, Navotar, RentWorks, TSD comparison](https://www.myhospitalnow.com/blog/top-10-car-rental-management-software-features-pros-cons-comparison/)

Counter workflow and condition capture: [Record360 inspection checklist](https://record360.com/blog/what-to-check-when-renting-a-car-an-inspection-checklist/) ·
[ProovStation rental inspection](https://proovstation.com/industries/rental) ·
[Alpha Software damage forms](https://www.alphasoftware.com/blog/car-rental-damage-form-examples-templates)

KPIs: [Nomora fleet reporting](https://www.nomora.io/blog/fleet-reporting-car-rental-maximize-utilization-profit) ·
[Worco revenue management](https://www.worco.io/blog/car-rental-revenue-management-strategies/) ·
[Camasys KPI guide](https://www.camasys.com/posts/must-track-kpis-for-car-rental-success)

Greek obligations: [ΕΕΑ — ίδρυση εταιρείας ενοικίασης](https://www.eea.gr/arthra-eea/pos-mporo-na-idryso-etaireia-enoikiasis-aytokiniton/) ·
[EUGO — αναγγελία λειτουργίας](https://eugo.gov.gr/services/226431)
