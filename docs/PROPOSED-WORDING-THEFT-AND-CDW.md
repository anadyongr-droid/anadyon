# Proposed wording: theft and CDW are not included

**Last verified:** 2 November 2026, Claude. **Draft for Tasos's approval under
`DEFINING-STATEMENTS.md` §13. Nothing here is merged or published.**

Raised to the top on 2 November, when Tasos confirmed the website **still takes
bookings** through the closed season. Until then this sat behind W11–W13 as
"before reopening". It is not: a customer booking this week reads it.

## What the site says now — four strings, two files, two languages

W11 only ever covered the Terms. The same claim is also in the **FAQ**, which is
read more than the Terms are.

| Where | Current text |
|---|---|
| `lib/i18n/content/legal.ts:56` | `["Third party insurance", "Theft insurance", "Collision Damage Waiver (CDW)"]` |
| `lib/i18n/content/legal.ts:78` | `["Ασφάλιση αστικής ευθύνης προς τρίτους", "Ασφάλιση κλοπής", "Μεικτή Ασφάλεια (CDW)"]` |
| `lib/i18n/content/faq.ts:29` | *"Our standard fees include Collision Damage Waiver (CDW), Theft insurance, and Third Party insurance."* |
| `lib/i18n/content/faq.ts:57` | *"Οι βασικές τιμές μας περιλαμβάνουν Μεικτή Ασφάλεια (CDW), ασφάλεια κλοπής και ασφάλιση αστικής ευθύνης προς τρίτους."* |

## Why it is wrong, and the part that does not depend on an open question

**Two independent reasons, and the second needs nothing resolved first.**

1. **No certificate provides either.** `INSURANCE-COVER-AND-RESTRICTIONS.md`
   records it from the contracts rather than by inference: both ΙΜΙ 2840
   policies cover **only** forest fire, flood and earthquake. No general own
   damage. **Theft has no candidate policy at all.**
2. **The paper contract sells both as paid options** — Theft Waiver and F.T.P.
   (art. 8c, 8d), and CDW with a **non-waivable excess** (art. 8a).

So the website says *included in standard fees* and the contract the customer
signs at the desk **charges for them**. That contradiction is internal to our
own documents and is true whatever the insurance position turns out to be.

**The one genuinely open thread, and it does not block this.** B5 records that
Tasos confirmed on 2 September that own-damage cover **exists**, though the
policy has never been seen here. If it surfaces it could change what may be said
about **CDW**. It cannot rescue **theft**, which has no candidate, and it cannot
make either "included" while the contract charges for them. Flagged per §8 so
the draft is not read as settling B5.

## Option A — minimal: stop claiming it

Remove theft and CDW from both lists. Say nothing further.

- EN list → `["Third party insurance"]`
- EL list → `["Ασφάλιση αστικής ευθύνης προς τρίτους"]`
- EN FAQ → *"Our standard fees include Third Party insurance, as required by Greek law."*
- EL FAQ → *"Οι βασικές τιμές μας περιλαμβάνουν ασφάλιση αστικής ευθύνης προς τρίτους, όπως απαιτεί ο νόμος."*

**For:** the smallest possible change, nothing new to approve, removes the false
claim today. **Against:** §10 says where cover is absent the wording *"says so
plainly rather than going quiet"*. This goes quiet.

## Option B — §10-compliant: say what is and is not covered

Option A's four edits, plus one short paragraph in each language.

> **EN.** Third party insurance is included, as Greek law requires. **Damage to
> the rented vehicle and theft of it are not insured.** You remain responsible
> for them under the rental agreement. A **Full Damage Waiver** is available at
> **€5.00 per day**: it is Anadyon's own undertaking to waive that
> responsibility, not an insurance policy.

> **EL.** Η ασφάλιση αστικής ευθύνης προς τρίτους περιλαμβάνεται, όπως απαιτεί ο
> ελληνικός νόμος. **Οι ζημιές στο ενοικιαζόμενο όχημα και η κλοπή του δεν
> καλύπτονται από ασφάλιση.** Την ευθύνη φέρετε εσείς, βάσει του μισθωτηρίου.
> Διατίθεται **Full Damage Waiver** με **5,00 € την ημέρα**: πρόκειται για δική
> μας δέσμευση παραίτησης από την απαίτηση, όχι για ασφαλιστήριο συμβόλαιο.

**For:** a customer learns the real position before paying, which is what §10
asks. **Against:** it is more to approve, and the last sentence touches **N1** —
whether the FDW is a priced self-insurance product or is withdrawn/repriced,
which is Tasos's open decision. Approving B does not settle N1; it only
describes the product as it is sold today at the verified €5.00.

## Recommendation

**Option B**, and the last sentence is the reason. The waiver is already sold at
€5.00/day against no own-damage cover on any vehicle inspected — §10 says that
may be a perfectly good commercial decision, but *"not one that may be made
silently, priced by accident, or described to a customer as insurance."*
Option A leaves a customer able to believe the waiver is insurance; B does not.

**If B is too much to decide now, A is strictly better than today** and can be
merged while B is considered. The false claim going is the urgent half.

## What happens on approval

The four strings and the paragraph are a content change in
`lib/i18n/content/`, covered by `content.test.ts`. No schema, no migration, no
customer data. **Approve by naming A or B; I will not merge either without
that**, per §13: a general instruction to carry on is not approval of a
particular wording.
