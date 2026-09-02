# What the fleet is actually insured for

**Read from the policy documents, 2 September 2026.** Three certificates
supplied by Tasos, covering one car and two motorbikes across two insurers.
This document is the reference for what may be offered, promised and published.
`DEFINING-STATEMENTS.md` §10 makes that binding.

**Last verified:** 2 September 2026, Claude — including the renewed 125 certificate.

**Scope caveat, stated once and applying throughout.** All three documents are
**certificates** — the schedule of what is covered, for how much, at what
premium. None of them is the terms. Each defers its exclusions to an attached
booklet (Euroins §4.3; Intersalonica "Γενικοί, Ειδικοί και Προαιρετικών
Καλύψεων", published at intersalonica.gr) that was not supplied. So this
document is authoritative about **what is covered** and silent about **what is
excluded beyond the statutory exclusions of Law 489/1976**. Where it says a
restriction is absent, that means absent *from the certificate*.

---

## 1. The three policies

| | Car | Motorbike 125 | Motorbike 50 |
|---|---|---|---|
| **Plate** | ΙΟΖ4176 | ΖΒΒ 0565 | ΗΒΙ 1560 |
| **Vehicle** | Hyundai i20, 2010 | KYMCO Agility City 125, 2023 | Changzhou/Kwang 50cc, 2023 |
| **Insurer** | **Euroins** Α.Ε. (Greek branch) | **Intersalonica** Α.Ε.Γ.Α. | **Intersalonica** Α.Ε.Γ.Α. |
| **Policy no.** | 9190600829 | **217443636** | 217444452 |
| **Broker** | K. Express Μ. ΕΠΕ (ΖΑΚ/93) | K. Express / Brokers Union | K. Express / Brokers Union |
| **Use class** | Ε.Ι.Χ. ΕΝ. PROMO | 970 — ΕΙΧ ΜΟΤ/ΤΑ **ΕΝΟΙΚΙΑΖ** | 830 — ΕΙΧ ΜΟΤ/ΤΟ **ΕΝΟΙΚΙΑ** |
| **Cover from** | 04/07/2026 | **11/06/2026** | 11/06/2026 |
| **Cover to** | **04/10/2026** | **11/09/2026** | **11/09/2026** |
| **Term** | 3 months | 3 months | 3 months |
| **Premium** | €82.76 | €54.00 | €41.00 |

Insured party is **ΑΝΑΔΥΩΝ Ι.Κ.Ε**, ΑΦΜ 800569811, on all three.

### Renewals

Tasos confirmed on 2 September 2026 that he handles the renewals directly, and
supplied the current 125 certificate — policy **217443636**, replacing the
September 2025 copy that had been the only evidence held. It was a stale copy,
not an uninsured bike.

**Both motorbikes now expire on the same day, 11 September 2026**, and the car
three weeks later. Expiry is no longer tracked in this document: it belongs in
the vehicle record, where `lib/fleetStatus.ts` warns 30 days ahead and the
availability check refuses to rent a lapsed vehicle. See open item **F1** —
the machinery exists and is inert until the dates are entered.

All three carry the same statutory warning: under Law 4261/2014 art. 169 there
is **no automatic renewal**, the premium must be paid **before** expiry, and
non-payment dissolves the policy **with no notice given**. Intersalonica adds
that on a new policy cover starts **one hour after** payment.

---

## 2. Age and licence restrictions — the question asked

**There is no age restriction in any of the three certificates. There is no
minimum licence-holding period in any of them either.**

Searched all three for age words, numeric thresholds and young-driver phrasing.
Nothing in any document.

> **Answered 2 September 2026 by Tasos:** renters **are** covered as unnamed
> drivers (old item B1), and there **is** own-damage cover on the fleet that has
> not yet been shown to this project (old item B3). Both are recorded on his
> word; neither document has been seen here. §4.1 is revised accordingly.

**What follows from that:**

- **Our minimum age of 21 is our own commercial choice, not an insurer's
  condition** — as far as the certificates show. `DRIVER-AGE-MARKET.md` §2
  records that Greek law already sets motorbike minimums by licence category
  (AM 16, A1 18, A2 20, A 24), so the blanket 21 sits above the legal floor for
  the two categories we most likely rent.
- **The under-23 insurance surcharge is a commercial charge, not a pass-through.**
  No young-driver loading appears anywhere in these documents. It must not be
  described internally or publicly as recovering an insurer's charge until the
  terms booklet or the broker confirms one exists.
- **The absence of a licence-tenure rule cuts the other way from the market.**
  `DRIVER-AGE-MARKET.md` §6 found nearly every competitor requires the licence
  to have been held a year, commonly as an insurance condition. Ours do not
  state one — which is a looser position, not a safer one, until the booklet is
  read.

### Named drivers

All three certificates have named-driver slots. On all three, **Driver 1 is the
same person** (b. 16/12/1974; licence 13/05/1998 on the car, 13/10/1998 on the
125, 23/05/1998 on the 50) and the remaining slots are blank.

Both motorbike policies are written under a **rental use class** — 970 and 830,
both ΕΝΟΙΚΙΑΖΟΜΕΝΟ — and the car's roadside assistance line is tagged
(ENOIKIAZOMENA). So the fleet is plainly insured *for renting*, and renters are
almost certainly covered as unnamed drivers.

**"Almost certainly" is not adequate here**, because the downside is that no
rental is covered at all. One explicit written confirmation from the broker
closes it. This is the single highest-value question in this document.

---

## 2b. The statutory floor — what the law excludes, whatever the booklet says

Researched 2 September 2026 from Greek law and case law, **not** from the terms
booklets, which could not be obtained (see §7).

This matters because **both certificates incorporate it by explicit reference.**
Euroins §2.1 and the Intersalonica ΓΕΝΙΚΕΣ ΕΞΑΙΡΕΣΕΙΣ §1 each say the same thing:
for the compulsory cover, the exclusions are those of Law 489/1976 — codified as
**Presidential Decree 237/1986** — plus any future statutory ones.

### The three exclusions, and the fact that there are only three

Article **6β** of PD 237/1986 excludes from compulsory motor liability cover
damage caused by:

1. a driver **lacking the driving licence required by law** for the category of
   vehicle;
2. a driver **under the influence of alcohol, toxic substances or drugs**,
   contrary to article 42 of the Highway Code (ΚΟΚ);
3. a person who **acquired the vehicle through a criminal act** — theft, robbery
   or self-help.

**These three are περιοριστικές — exhaustive.** The Supreme Court (Άρειος Πάγος)
held in **ΑΠ 1893/2024** that no further exclusion is permissible on compulsory
cover, not even one argued from the good-faith provision of Civil Code art. 288.

### What that gives us, and what it does not

**It answers half of the age question without the booklets.** On the compulsory
third-party cover, **an insurer cannot impose a driver-age exclusion** — the list
is closed, and age is not on it. A contractual "we do not cover under-25s" clause
could not bite on compulsory liability.

**But exclusion 1 is precisely the motorbike-age problem, and it is severe.** A
renter riding a 125 on an AM licence, or with no valid A1 at all, sits squarely
inside a statutory exclusion. So **verifying the licence category against the
machine is a condition of cover, not counter etiquette** — and it is the
strongest argument yet for §7's recommendation to rent motorbikes to the age the
licence permits rather than to a blanket 21: the licence is what the statute
tests, so the licence is what we must check either way.

**It does not reach the optional covers.** Euroins §2.2 and the Intersalonica
ΓΕΝΙΚΕΣ ΕΞΑΙΡΕΣΕΙΣ §2 both extend "every additional exclusion contained in the
attached terms" to the **non-compulsory** covers. Legal protection, accident
care, roadside assistance and any own-damage product can therefore carry
exclusions the statute would not permit on liability — including, in principle,
an age one. That is what the booklets would tell us, and why §7 still matters.

### The open legal question, which is counsel's and not ours

Article 6β is written as an exclusion, but the compulsory-insurance scheme also
protects the injured third party. Whether, in practice, the insurer **refuses to
pay at all** or **pays the victim and then recovers from us or the driver**
(δικαίωμα αναγωγής) was not settled by this research, and the difference is the
whole exposure: in the second case an excluded claim becomes a debt owed by
Anadyon rather than a loss borne by the victim.

Recorded as unverified and added to the questions for counsel in
[`GATE-0-QUESTIONS.md`](GATE-0-QUESTIONS.md). Do not act on either reading until
it is answered.

---

## 3. What is covered, side by side

Sums insured in euros. **—** means the cover is absent from that policy.

| Cover | Car | 125 | 50 |
|---|---:|---:|---:|
| Third-party bodily injury, per victim | 1,300,000 | 1,300,000 | 1,300,000 |
| Third-party property damage, per event | 1,300,000 | 1,300,000 | 1,300,000 |
| Damage caused by an uninsured vehicle | 6,000 | 6,000 | 6,000 |
| Own damage where a *known* third party is solely at fault | — | 6,000 | 6,000 |
| Liability between vehicles of the same owner | — | 3,500 | 3,500 |
| Own damage — forest fire | — | 2,000 | 1,000 |
| Own damage — flood | — | 2,000 | 1,000 |
| Own damage — earthquake | — | — | 1,000 |
| Legal protection | 3,000 | 10,000 | 10,000 |
| Legal advice | 600 | — | — |
| Driver personal accident | 5,000 | — | — |
| Accident care (Φροντίδα Ατυχήματος) | yes | yes | yes |
| Roadside assistance | yes* | — | — |
| **Deductibles (απαλλαγές)** | none stated | 0.00 | 0.00 |

\* The car's roadside assistance is limited to vehicles up to 3.5 tonnes and 3
metres high, without dual rear wheels, **and to motorcycles over 50cc**.

---

## 4. What is *not* covered, on any vehicle

This is the section that should drive product decisions.

### 4.1 There is no collision own-damage cover anywhere in the fleet

Own damage appears only in these forms:

- **Natural perils only** — forest fire, flood, and (50cc only) earthquake,
  capped at €1,000–€2,000.
- **Recovery, not indemnity** — "restoration of property damage to the insured
  vehicle from an accident with the exclusive fault of a *known* third-party
  vehicle", €6,000. This pays when someone else is provably and solely to
  blame and can be identified. It is a subrogation shortcut. **It does not pay
  when our renter is at fault, and it does not pay for a single-vehicle
  accident.**

A renter who drops the scooter on a bend, or reverses the i20 into a wall, is
covered by **nothing**.

**On these three certificates, therefore, nothing pays for our own vehicle when
our renter damages it.**

> **Revised 2 September 2026.** The earlier version of this section concluded
> that the Full Damage Waiver was *entirely self-insured*. **Tasos has confirmed
> that own-damage cover on the fleet does exist** and simply was not among the
> documents supplied. That conclusion is therefore **withdrawn**, and the
> paragraph above is narrowed to what these three certificates actually show.
>
> What is *not* yet answered is what that cover pays, what it excludes, and what
> excess it carries — and the FDW we sell at €12/day is a promise pitched against
> exactly those terms. Until the policy is seen, no accurate FDW wording can be
> written, which is why open item **W2** (bringing published content in line with
> the policies) is blocked on obtaining it rather than on drafting.

The question that remains for the broker is no longer whether cover exists, but
its shape: **which policy carries own damage, what is the excess, and is the
excess different for a young driver?**

### 4.2 Theft is not covered on any vehicle

No κλοπή cover on any of the three. A stolen scooter is a total uninsured loss.

### 4.3 Fire is not covered, except forest fire

General fire (πυρός) is absent. Only *forest* fire appears, capped at €1,000–2,000.

### 4.4 Glass is not covered

The car policy discusses glass breakage only conditionally — "if included in the
policy" — and it is not in the schedule. The motorbike policies do not mention it.

### 4.5 The 50cc has no roadside assistance

The car's assistance clause covers motorcycles **over** 50cc, and neither
motorbike policy lists roadside assistance among its insured risks at all. So
the cheapest and most-rented category on the fleet has none.

### 4.6 Personal accident cover exists only on the car

€5,000 for the driver on the i20; nothing on either motorbike — the vehicles on
which a rider is far more likely to be hurt.

---

## 5. What this means for the site and the system

Concrete, checkable consequences. Each is a task, not an observation.

| # | Finding | What has to change |
|---|---|---|
| 1 | No own-damage cover behind FDW | Decide whether FDW is a priced self-insurance product or is withdrawn/repriced. Either way its published wording must be exact about what it waives. |
| 2 | Theft not covered | Nothing on the site may imply theft protection. The rental agreement must say the renter is liable for theft, if that is the position. |
| 3 | 50cc has no roadside assistance | Any unqualified roadside-assistance promise is wrong for 50cc. Qualify it by category or remove it. |
| 4 | No insurer age rule found | Age limits are ours to set commercially. The under-23 surcharge stands, but not as a pass-through. |
| 5 | No licence-tenure rule found | Either adopt one deliberately (the market standard is one year) or record that we deliberately have none. |
| 6 | Policies are 1–3 months, no auto-renewal | **The code for this already exists** — `vehicles.insurance_expiry` and `kteo_expiry`, 30-day warnings, and a hard bar in the availability check measured against the pick-up date. It does nothing until the dates are recorded, because an unrecorded date reads as `unknown` and `unknown` does not bar. Open item F1. |
| 7 | Renters as unnamed drivers unconfirmed | Blocking question for the broker. |

Items 1, 2 and 3 are **content correctness** problems: the site may currently
promise things the policies do not deliver. Item 6 is a **functionality** gap.

---

## 6. Questions for the broker, in priority order

1. **Send the own-damage policy.** Which policy carries it, what does it cover,
   **what is the excess**, and does the excess change for a young driver? The
   FDW wording cannot be written without this. (§4.1)
2. **Send the terms booklets.** Euroins *Βιβλίο Όρων Ασφάλισης*; for
   Intersalonica the document appears to be
   [ΕΙΔΙΚΕΣ ΔΙΑΤΑΞΕΙΣ ΚΛΑΔΟΥ ΑΣΤΙΚΗΣ ΕΥΘΥΝΗΣ, έκδοση ΙΖ, in force 10/07/2024](https://www.intersalonica.gr/media/m2lluzgn/%CE%AD%CE%BA%CE%B4%CE%BF%CF%83%CE%B7-%CE%B9z-%CE%BC%CE%B5-%CE%B9%CF%83%CF%87%CF%8D-%CE%B1%CF%80%CF%8C-10072024.pdf).
   Per §2b these can only add exclusions to the **optional** covers — but that is
   where any age condition would live.
3. Is theft cover available on the fleet, and at what premium? (§4.2)
4. If we rent motorbikes to the age the licence permits (A1 at 18, AM at 16),
   does cover follow the licence category or a flat age? §2b makes the statutory
   answer clear; this asks whether the optional covers agree.

**Answered on 2 September and dropped from this list:** renters are covered as
unnamed drivers; own-damage cover exists; Tasos handles renewals directly.

---

## 7. Why the booklets are still not read

Attempted 2 September 2026. **Both insurers' websites are blocked by this
session's network egress policy** — `www.euroins.gr` and `www.intersalonica.gr`
each return HTTP 403 at the proxy tunnel, to both `curl` and the fetch tool. The
policy was not worked around.

What the attempt did produce is the likely Intersalonica document and its exact
URL, linked in §6 question 2 — so downloading it is now one click for anyone on
an unrestricted connection, rather than a search.

**The block is not specific to insurers.** Probing showed `en.wikipedia.org`,
`dora.dev`, `cognitect.com` and `www.lawspot.gr` all refused identically, while
`github.com` and `code.claude.com` connected. The environment runs at the
**Trusted** access level — package registries, GitHub and cloud SDKs only.

**If that is to change** (open item B0), the recommendation is **Custom** with an
explicit list, not **Full**. `AGENTS.md` states that the boundary which actually
holds is credentials and environment separation; an agent that reads untrusted
third-party documents and runs with repository access is exactly the process for
which unrestricted egress is worth not granting. A named list gets the same work
done. A starting list for this project:

```text
euroins.gr
*.euroins.gr
intersalonica.gr
*.intersalonica.gr
*.frame.claudeusercontent.com
supabase.com
*.supabase.com
nextjs.org
docs.stripe.com
developer.mozilla.org
www.lawspot.gr
nomikovima.dsa.gr
www.areiospagos.gr
```

`*.frame.claudeusercontent.com` is not optional if agents are to read published
artifacts — the docs are explicit that artifact content is fetched from that
host, and omitting it silently breaks it.

The Euroins booklet is referenced from
`euroins.gr/individual-clients/view/passenger-cars`, per the footer of the car
certificate itself.

**Nothing in §2b came from those booklets.** It came from the statute and from
ΑΠ 1893/2024, which is why it is stated with confidence while §7 stays open.

## Sources

The three certificates supplied by Tasos on 2 September 2026: Euroins
9190600829 (ΙΟΖ4176), Intersalonica 217443636 (ΖΒΒ 0565, replacing the expired 216929749 copy) and Intersalonica
217444452 (ΗΒΙ 1560). Read directly, not summarised from search. The statutory analysis in §2b is
from PD 237/1986 art. 6β and ΑΠ 1893/2024. Related:
[`DRIVER-AGE-MARKET.md`](DRIVER-AGE-MARKET.md) for what competitors do and what
Greek law requires.
