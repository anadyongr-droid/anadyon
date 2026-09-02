# Driver age limits: what the market does, and what we could change

**Written:** 1 September 2026 · **Requested by:** Tasos, to decide whether to
lower the age limits, buy additional insurance, and charge a surcharge to
younger drivers.

**Last verified:** 2 September 2026, Claude.

---

## 0. How reliable this is — read before quoting any of it

**These figures come from search-engine summaries of competitor pages, not from
pages this agent read.** The environment's egress proxy blocks
`faros-rentals.com` and every other outside domain, so `WebFetch` could not open
a single competitor's terms page. `WebSearch` runs outside the container and
does work, which is why there is anything here at all.

Practical consequence: **treat every competitor figure below as a lead, not as a
fact.** Before any of it reaches a pricing decision or public copy, open the
named page and confirm the number. Anything marked 🔒 is from Greek/EU law or
from this repository and is reliable.

The `docs/` rule that a claim which cannot be checked must be labelled
unverified is why this section is first rather than in a footnote.

---

## 1. What Anadyon does today 🔒

From `lib/rentalPolicy.ts`, which single-sources the rule so the terms page, the
booking modal and the FAQ cannot diverge:

| | Today |
|---|---|
| Minimum age | **21, for every vehicle** — cars, motorbikes and bicycles alike |
| Young-driver band | `21–25` captured on every quote |
| Young-driver surcharge | **Published as "may apply". Not implemented anywhere.** |

That last row is a gap independent of any decision about age limits. The terms,
the booking modal and the FAQ all tell the customer a surcharge *may* apply, the
band is recorded on the quote, and nothing in pricing ever charges it. A search
for `young_driver` across the codebase returns nothing.

---

## 2. Motorbikes: the finding that matters most 🔒

**Greek and EU law already sets the age at which a person may ride what, and it
does so by licence category.** These are not company policies and not
negotiable:

| Category | Vehicle | Minimum age |
|---|---|---:|
| **AM** | mopeds, ≤50cc | **16** |
| **A1** | ≤125cc, ≤11 kW | **18** |
| **A2** | ≤35 kW | **20** |
| **A** | unrestricted | **24** (22 with two years of A2) |

**So Anadyon's blanket 21 is above the legal floor for the two categories it
most likely rents.** A legally licensed 18-year-old holding A1 may ride a 125cc
anywhere in Greece — and is refused by us. A 16-year-old with AM may ride a 50cc
and is refused by us.

This is the cheapest change on the list, because **the state has already done
the competence assessment.** Renting to the age the licence permits is not
lowering a safety bar; it is stopping the application of a second, stricter bar
that nobody asked us to apply.

Reported local practice is consistent with the legal floor rather than with our
21: one Zakynthos operator is reported renting 50cc from 17 and 125cc from 18;
another is reported requiring 21 for 125cc and 27 for 200–400cc — so the market
is not uniform, and some operators are stricter than the law too.

---

## 3. Cars: we are at the market median, not above it

Reported minimum ages for cars, Zakynthos operators:

| Operator | Reported minimum |
|---|---:|
| Top Rentals Zante | 18 |
| Hermes Rentals (Kalamaki) | 20 |
| AutoLux · Autoway · Rent Scooter Car Zante | 21 |
| Smart Rentals | 21 most categories, 23 some, 25 the rest |
| **Anadyon** | **21** 🔒 |

International operators in Greece, reported: **Hertz/Europcar/Alamo at 21 for
mini and economy, 23 or 25 for larger categories.** Europcar reported at a
**€8/day + VAT** surcharge for 21–22 with nothing above 23; Alamo reported at
**€12.40/day** for 21–22 and not applied to mini/economy at all.

**Reading:** at 21 for cars we are exactly where most of the island and most of
the internationals are. We are not losing car business to a stricter policy —
the competitive gap is only at **18–20**, where two named local operators sit
and where the internationals do not go at all.

Near-universal alongside the age: **the licence must have been held for at least
one year.** One operator is reported at six months for EU licences. Anadyon has
no licence-tenure rule at all, which is a *looser* position than the market and
worth a separate look — see §6.

---

## 4. What a surcharge looks like in this market

Reported range for young-driver fees in Greece: **€8–€30 per day**, most
commonly €10–€20, charged per day rather than per rental, and typically applied
to 21–24 and dropped at 23 or 25.

One structural detail worth more than the numbers: **some operators refuse to
sell young drivers the excess-reduction product at all** (Hertz is reported as
not allowing Super CDW for young drivers). That is a different lever from a
surcharge — instead of charging more, they keep the customer's liability high.
Whether to copy that is a real product decision, and it is the less friendly of
the two.

---

## 5. The question this research cannot answer

> **Partly answered, 2 September 2026.** Tasos supplied three policy
> certificates — the car and both motorbikes. They are read in full in
> [`INSURANCE-COVER-AND-RESTRICTIONS.md`](INSURANCE-COVER-AND-RESTRICTIONS.md),
> which is now the reference `DEFINING-STATEMENTS.md` §10 requires published
> wording to follow.
>
> **On age: none of the three carries an age restriction, and none carries a
> minimum licence-holding period.** So our 21 is a commercial choice, not an
> insurer's condition, and the §6 tenure gap below is real. Caveat: these are
> certificates, not terms; each defers its exclusions to a booklet not yet
> supplied, so this is "not on the certificate" rather than "does not exist".
>
> Reading them turned up findings that outrank the age question: **no collision
> own-damage cover on any vehicle, across two insurers**, which is what our
> €12/day Full Damage Waiver is sold against; **no theft cover**; **no roadside
> assistance for 50cc**; and policy terms of one to three months with no
> automatic renewal — the 50cc expires 11 September 2026.

**What Anadyon's own insurer charges, and what it requires.** That is the
binding constraint on all of the above and it is not on any public page. Nobody
can research it; it takes a call or an email to the broker.

The questions worth putting to them, in this order:

1. **Does the policy currently exclude drivers under 21?** If it does, our 21 is
   not a choice we made and §2 and §3 are moot until that changes.
2. **For motorbikes, does the policy follow licence category or a flat age?** If
   it follows the licence — which would be the natural underwriting position,
   since the licence is the state's competence test — then §2 costs nothing at
   all and is purely a copy change.
3. **What is the loading for 18–20 on cars, per day or as a premium uplift?**
   That number decides whether a car surcharge can be priced profitably against
   the €8–€30 the market charges.
4. **Does the excess change for a young driver, and can they still buy excess
   reduction?** This decides whether we follow the Hertz pattern or the
   surcharge pattern.
5. **Is there a licence-tenure requirement in the policy** (held ≥1 year)? If
   there is, we are currently non-compliant by omission — see §6.

---

## 6. A gap found while doing this, unrelated to age

Anadyon publishes **no minimum licence-holding period**. Almost every operator
found requires the licence to have been held for **at least one year**, and this
is commonly an insurance condition rather than a commercial preference.

If our insurer imposes it and our terms do not state it, then a claim involving
a driver who passed their test last month could be declined on a condition the
customer was never told about. That is worth checking before it is worth
changing.

---

## 7. What this suggests, in the order the value falls

None of this is a decision — the insurer's answers in §5 decide it. This is the
shape the decision is likely to take.

1. **Build the surcharge mechanism regardless.** It is already published as
   applying, the band is already captured, and nothing charges it. That gap
   should close whether or not any age changes, and it is the prerequisite for
   every option below.
2. **Motorbikes: replace the blanket 21 with the licence category.** Largest
   gain, smallest cost, and the safety argument is already made by the state.
   Subject to §5 question 2.
3. **Cars: consider 19 or 20 with a surcharge**, not 18. It picks up the segment
   two local operators serve while staying inside what the internationals treat
   as insurable. Subject to §5 question 3.
4. **Add the licence-tenure rule** if the insurer requires it.

### What it costs us in code

Not much, and it is worth knowing before the decision rather than after.
`lib/rentalPolicy.ts` holds `MIN_DRIVER_AGE`, `YOUNG_DRIVER_BAND` and
`DRIVER_AGE_BANDS`, and the terms, modal and FAQ all derive from them — so the
published wording changes in one place.

The real work is that **a single `MIN_DRIVER_AGE` cannot express "cars from 21,
125cc from 18, 50cc from 16"**. Per-category minimums mean a small structural
change: the constant becomes a lookup by vehicle category, and
`driverAgeBandForDob` needs the category passed in. The bands themselves
(`21–25`, `26–65`, `66+`) are a text column on `quotes` and `reservations`, so
changing the lowest band is a migration, not an edit.

---

## Sources

Search-derived, 1 September 2026. Named here so the next reader can open what
this agent could not.

- [Hertz Greece terms](https://www.hertz.gr/en/car-rental/car-rental-general-terms-conditions/) ·
  [Europcar Greece terms (PDF)](https://www.europcar.fr/files/live/sites/Europcar/files/Conf_email_attachment/CGL_EN_GR.pdf) ·
  [Auto Europe: rental age by country](https://www.autoeurope.com/travel-tips/rental-car-age-requirements/)
- [Faros Rentals, Zakynthos](https://faros-rentals.com/terms-conditions) ·
  [Auto Traffic Rentals, scooters and ATVs](https://www.autotrafficrentals.com/scooters-atvs-terms-and-conditions/) ·
  [1-Way Zakynthos](https://1-way.gr/terms-conditions) ·
  [AutoLux Zakynthos](https://autolux.gr/faq/) ·
  [Hermes Rentals, Kalamaki](https://www.zantehermes.com/terms/) ·
  [Autoway Zante](https://autowayzante.com/faq/) ·
  [Smart Rentals](https://smart-rentals.com/faq/) ·
  [Zante Way Rentals](https://www.zantewayrentals.com/faq.php) ·
  [Famozo Rentals](https://famozorentals.com/scooter-rental-zakynthos/) ·
  [RentBikeCarZante](https://rentbikecarzante.com/en/faq/)
- [Driving licence in Greece (Wikipedia)](https://en.wikipedia.org/wiki/Driving_licence_in_Greece) ·
  [FEMA: European driving licence](https://www.femamotorcycling.eu/consumer-information/european-driving-licence/)
- [Rental Center Crete: insurance types in Greece](https://www.rental-center-crete.com/blog/type-of-insurance-available-when-hiring-a-car-in-greece/) ·
  [Hertz Greece additional coverages](https://www.hertz.gr/en/car-rental/additional-services/additional-coverages/)
