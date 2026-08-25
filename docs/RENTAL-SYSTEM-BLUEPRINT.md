# Anadyon Rental System — Architecture Blueprint

**Written:** 17 August 2026 · **Revised twice the same day** — second pass added
Wheelsys, IOS Rentals, RentingPilot; third pass added Coastr, RentSyst, Rent
Centric, TSD, RENTALL. · **25 August 2026** — added §1.6, the local field: the
two competitors we track both run on EzCar.

**Purpose:** benchmark the build against the platforms a Greek rental operator
would otherwise buy, state honestly where it falls short, and set the
architecture for closing that gap.

A reference document. It records *why* things are built the way they are, so a
decision taken today is not silently reversed in six months. Research findings
are attributed; judgement calls say so.

---

## 1. The field

Eleven systems examined. They divide into four distinct positions, and knowing
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
direct. Worth building; see the deferred list in §7.

**Source:** [ezcar.gr software page](https://www.ezcar.gr/en-software.php) ·
[ezcar.eu](https://www.ezcar.eu/) · tenant paths in `lib/competitorRates.ts`.

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
  id, reservation_id, direction ('out' | 'in'),
  occurred_at, staff_name,
  odometer_km, fuel_eighths (0-8, as the gauge reads),
  cleanliness ('clean' | 'acceptable' | 'poor'),
  notes, signature_url, created_at

handover_photos
  id, handover_id, angle ('front'|'rear'|'left'|'right'|'interior'|'other'),
  photo_url, taken_at
```

One handover row per direction; a reservation has at most two, and the
difference between them is the whole story of the rental — distance, fuel,
condition.

Photographs are a table rather than columns because the count varies and angles
must be comparable between out and in. `photo_1..photo_6` would make the
comparison positional and fragile.

**Fuel in eighths:** what the gauge shows and what staff read without
arithmetic. A percentage invites false precision and argument.

**Built for a tablet, not a desktop.** Rent Centric's "Mobile Agent App" and
Wheelsys's tablet-friendly counter both exist because this is done standing next
to a car, not at a desk.

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

`customers` carries **both `licence_number` and `driving_licence_number`**. One
is redundant; which one the code writes needs establishing before either is
trusted for licence verification.

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
| **1** | Fleet screen — statutory dates with expiry warnings, cost entry, damage log, margin per vehicle | data exists and is invisible; expiry carries fines and voids insurance |
| **2** | Check-out / check-in with odometer, fuel, condition photos — tablet-first | the category's centre of gravity; source of every damage dispute |
| **3** | Stop-sells + statutory gating + licence expiry | prevents renting an uninsured vehicle or to an invalid licence |
| **4** | Digital agreement and signature | legally required for the insurance clause |
| **5** | Reporting — utilisation, RevPAV, margin per vehicle | needs phase 2 data to mean anything |
| **6** | Alerts and daily plan — expiry, overdue return, service due | cheap once the data exists |

### Deferred, worth revisiting

- **Partner / affiliate channel** (EzCar, §1.6) — hotel and agency accounts with
  live availability, booking on the guest's behalf, commission tracking and a
  monthly statement. The one capability the *local* competition has and we do
  not, and distribution rather than a feature on this island. Reuse the
  existing role model rather than inventing a second one.
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

See `DEFINING-STATEMENTS.md`. The two bearing most here:

- **The public site and the rental system collect the same data.** A field
  collected on a quote the reservation cannot store is a dead end.
- **Claims are verified, not assumed.** Schema against the live database, DNS
  against live resolvers, vendor behaviour against vendor documentation.

TSD's own phrasing is the third, and worth adopting: an agreement that can be
produced with required fields missing is a **liability**, not a convenience.

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
