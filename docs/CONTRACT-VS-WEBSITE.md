# Where the contract, the website and the policies disagree

**Last verified:** 19 September 2026, Codex.

Three documents describe what Anadyon sells, and they do not say the same thing.

1. **The paper rental agreement** signed at the counter — [`contract/TRANSCRIPTION.md`](contract/TRANSCRIPTION.md)
2. **The website terms** — `lib/i18n/content/legal.ts`, `termsEn` / `termsEl`
3. **The insurance policies** — [`INSURANCE-COVER-AND-RESTRICTIONS.md`](INSURANCE-COVER-AND-RESTRICTIONS.md)

`DEFINING-STATEMENTS.md` §10 settles precedence: **the policies are the ground
truth.** Where the website or the contract promises more than the policies
deliver, the page is wrong, not the policy.

Two structural facts frame everything below. Contract article 15 makes the
**Greek text prevail**. And the Intersalonica terms provide that for a rental
business the insurer's recourse runs **only against the driver, provided a valid
rental agreement exists** — so this contract is the document that decides who
pays after an excluded claim, and its accuracy is not a presentational question.

---

## 1. The website promises cover that nothing provides

Website §6 "Insurance" states that **all our rentals include** — as a bulleted
list, no qualification:

> Third party insurance · **Theft insurance** · **Collision Damage Waiver (CDW)**

Against that:

| | Paper contract | Policies |
|---|---|---|
| Third party | Included, statutory limits (art. 8a, 8b) | ✅ €1,300,000 on all three certificates |
| **Theft** | **A paid option** — Theft Waiver, and F.T.P. to remove the excess (art. 8c, 8d) | ❌ **No theft cover on any certificate** |
| **CDW** | **A paid option**, and it leaves a **non-waivable excess** (art. 8a) | ❌ **No collision own-damage on any certificate** |

So the same two products are **included** on the website, **chargeable** on the
contract, and **absent** from the policies. A customer books believing theft and
collision are covered, signs a form saying they are extras, and is covered by
neither unless a policy nobody here has seen says otherwise.

**This is the most serious finding in this document.** Open item **B5** — obtain
the own-damage policy — is what closes the gap on CDW. Theft has no candidate at
all.

## 2. The website says 21 for everything; the contract says 18 for motorbikes

| | Cars | Motorbikes |
|---|---|---|
| **Website** (`DRIVER_AGE_POLICY`) | 21 | **21** |
| **Contract** art. 6.1(a) | above 21 | **above 18** |
| **Greek law** | — | AM 16, A1 18, A2 20 |

**The contract we sign already permits 18 on motorbikes.** The website's blanket
21 is the outlier, and it is stricter than both our own contract and the law.

`DRIVER-AGE-MARKET.md` §7 recommended moving motorbikes to the licence
categories and treated it as a change to be made. It is closer to a change
already half-made: the counter document does it, the website does not.

## 3. The contract requires a year's licence; the website does not

Contract art. 6.1(a): the driver must hold a licence **"for at least one year
prior to the lease."**

Website §1: *"A valid driving licence recognised by the Greek authorities must be
held by the driver."* — no tenure at all.

And Intersalonica **Article 19** charges a **60% loading** for a driver whose
first licence is under twelve months old, with no liability to indemnify if
undeclared. So the rule exists in the contract, is priced by the insurer, and is
**invisible to the customer until they are at the desk**.

This closes open item **N4** from the other direction than expected: we do not
need to decide whether to adopt a licence-tenure rule. We have one. It needs
publishing and enforcing.

## 4. The exclusion list appears nowhere online

The front page, in capitals above the signature:

> **NO INSURANCE COVERS TYRES, MIRRORS, GLASSES, KEYS LOSS OR THEFT AND THE
> INSIDE AND UNDER PART OF THE VEHICLE.**

Article 8 repeats it: no cover for *"the bottom of the Vehicle, wheels, tires,
mirrors, loss or theft of keys, windows and the interior."*

The website's insurance section says nothing about any of this. The customer
meets the exclusion list for the first time on the form they are signing, which
is the worst possible moment.

**The policies agree with the contract here** — glass is absent from all three
certificates. So this is the one case where the fix is purely to publish what is
already true.

## 5. Roadside assistance is promised without qualification

Website §10: *"We provide free 24-hour roadside assistance."*

But the Euroins car policy limits assistance to **motorcycles over 50cc**, and
neither Intersalonica motorbike certificate lists roadside assistance among its
insured risks at all. The **50cc — the cheapest and most-rented category — has
none.**

The contract's front page has a "Road assistance" field, so the counter can
record it per rental. The website states it as universal.

## 6. Personal accident: three different numbers

| Source | Amount |
|---|---|
| Contract art. 8(e) | **€15,000**, a paid option (PAI), and *"the driver and the rest of authorised drivers are not covered"* without it |
| Euroins car certificate | €5,000, included |
| Both motorbike certificates | **Nothing** |
| Website | Not mentioned |

Where the €15,000 product sits is unknown — possibly a separate PAI policy not
supplied. Until it is, the contract offers a figure the certificates do not show.

## 7. The counter and the website sell different products

| Product | Paper form | `extras_config` |
|---|---|---|
| C.D.W. | ✅ | ❌ |
| F.D.W. | ✅ | ✅ |
| P.A.I. | ✅ | ❌ |
| F.T.P. (theft) | ✅ | ❌ |
| Delivery / collection | ✅ | ❌ (website: free in hours, €20 outside) |
| Additional driver | ✅ | ✅ |
| A.S.C. (airport tax) | ✅ | ❌ |
| Fuel, Damage charge | ✅ | ❌ |
| Baby seat / child seat | ❌ | ✅ |
| GPS | ❌ | ✅ |
| Insurance surcharge (under 23) | ❌ | ✅ |

Neither list contains the other. A booking made online and a booking made at the
desk are priced from different menus.

Note also **KLM ALLOWANCE** with KM in / out / driven / charged on the form,
against website §5: *"Unlimited mileage applies to all rentals."* Either the
mileage fields are vestigial or the website overstates the position.

## 8. The data-protection clause is a decade out of date

Contract art. 16 grounds the customer's rights in **Law 2472/1997**. That statute
was repealed; **GDPR (Regulation 2016/679)** and **Law 4624/2019** govern.

Worse than the stale citation: the clause has the Lessee **agree to the use of
their personal data for direct advertising and direct marketing** as part of
signing the rental. Bundled, non-severable consent of that kind is not valid
consent under GDPR — it is neither freely given nor specific, and it is not
separable from the contract the customer had to sign to get the keys.

The website's privacy notice is by contrast current, and cites Art. 6(1)(b) for
contract performance. **The paper form is the liability here, not the site.**

## 9. Smaller defects in the printed contract

- **Article 4(f) cross-references "Article 10 … (Insurance Coverage)".** Insurance
  is article 8; article 10 is Ownership. The maintained printable template now
  says Article 8; existing printed stock still needs replacement before use.
- **Article 15** gives exclusive jurisdiction to the Zakynthos courts. For
  consumers domiciled elsewhere in the EU, an exclusive jurisdiction clause of
  this kind is of doubtful enforceability. **Counsel's question, not ours** —
  added to `GATE-0-QUESTIONS.md` territory rather than decided here.
- **Article 12.3** keeps all prepaid rent on early termination as a "fair and
  reasonable penal clause". The website's §8 cancellation terms are far softer —
  free more than 24 hours ahead, otherwise one day's charge. The two documents
  describe different cancellation regimes.

---

## What to change, in order of exposure

| # | Change | Where | Blocked on |
|---|---|---|---|
| 1 | Stop describing theft and CDW as included | Website §6 | Nothing — the policies already settle it |
| 2 | Publish the exclusion list (tyres, glass, mirrors, keys, underside, interior) | Website §6 | Nothing |
| 3 | Qualify roadside assistance by category, or drop "free 24-hour" | Website §10 | Nothing |
| 4 | Publish the one-year licence rule, and check it at the counter | Website §1, check-out | W10 |
| 5 | Align motorbike minimum age — 18 on the website, or 21 in the contract | Both | A decision: which is right |
| 6 | Replace article 16 with a GDPR clause, and unbundle marketing consent | Contract | Counsel |
| 7 | Replace printed stock with the corrected Article 8 template | Contract | Tasos / next print run |
| 8 | Reconcile the two product menus | `extras_config` / form | A decision |
| 9 | Reconcile the cancellation regimes | Both | A decision |

Items 1–3 remain open pending Tasos's approval of customer-facing wording.
Item 7 is corrected in the maintained template but still needs the physical
stock replaced. Items 5, 8 and 9 are commercial choices. Item 6 needs counsel.
