# Proposed wording: what the base price includes, and the word "insurance"

**Last verified:** 2 November 2026, Claude. **Draft for Tasos's approval under
`DEFINING-STATEMENTS.md` §13. Nothing here is merged or published.**

**REWRITTEN 2 November after Tasos corrected the premise.** The first version of
this document said theft and CDW were *"not true"* and should be removed from
the included list. **That was wrong.** Tasos: *"this cover is provided by us the
company Anadyon, so the claim is valid indeed."*

So the cover is real — its backing is the company rather than an insurer, which
is a different fact from its absence. §10 anticipated precisely this and called
it *"a perfectly good commercial decision"*. The earlier draft is left in the
git history rather than quietly replaced, because it argued for deleting a true
claim about a real product.

**What survives the correction is narrower and does not depend on who bears the
risk.** Two things, and only one of them needs a decision.

---

## 1. "Theft insurance" is the wrong word — and CDW is already right

§10 is explicit: a product with no policy behind it *"must be labelled as what
it is"*, and the live example *"is not one that may be… described to a customer
as insurance."*

An undertaking Anadyon funds itself is a **waiver**. It is not insurance, and no
insurer stands behind it. A customer reading *"Theft insurance"* reasonably
believes an insurer does — which matters at exactly the moment it goes wrong,
when they discover the promise was the company's and not a policy's.

**Note the asymmetry, because it halves the work.** *"Collision Damage Waiver
(CDW)"* is **already correct** — a waiver is precisely what it is, the term
implies no insurer, and it is the standard industry word. **Only the theft line
needs changing**, and only its noun.

| Where | Now | Proposed |
|---|---|---|
| `legal.ts:56` | `"Theft insurance"` | `"Theft Waiver"` |
| `legal.ts:78` | `"Ασφάλιση κλοπής"` | `"Απαλλαγή κλοπής"` |
| `faq.ts:29` | `"…CDW, Theft insurance, and Third Party insurance."` | `"…CDW, a Theft Waiver, and Third Party insurance."` |
| `faq.ts:57` | `"…Μεικτή Ασφάλεια (CDW), ασφάλεια κλοπής και…"` | `"…Μεικτή Ασφάλεια (CDW), απαλλαγή κλοπής και…"` |

Third-party insurance keeps the word: it **is** insurance, statutory, €1,300,000
on all three certificates.

**This one I would merge on a single word from you.** It makes four strings
accurate, removes nothing a customer has, and changes no price or product.

---

## 2. The website says *included*; the contract *charges*. One of them is wrong

This is the part that is genuinely yours, because it is the operating model.

- **Website §6** lists both with no qualification — *all our rentals include*.
- **The paper contract** sells Theft Waiver and F.T.P. as **paid options**
  (art. 8c, 8d), and CDW as a **paid option leaving a non-waivable excess**
  (art. 8a).

`DEFINING-STATEMENTS.md` §2: *"No fee appears at the desk that was absent from
the quote."* A customer who books believing both are included and is then asked
to pay for them at the counter has met exactly the thing §2 forbids — and it is
the website and the contract disagreeing, not the cover being absent.

**Three lines settle it, and they decide which document changes:**

1. Is CDW/theft **included at no charge**, or a **paid option**?
2. Is there an **excess**, and what is it?
3. What does the **€5.00/day Full Damage Waiver** then buy — the cover itself,
   or the removal of the excess?

**The reading that makes everything coherent** — and it is a guess until you
confirm it, labelled as one per §8 — is: CDW and theft are included with an
excess, and the FDW at €5.00/day removes the excess. That is the standard
industry shape, it fits art. 8a's *non-waivable excess* and it explains what the
FDW is for. If that is right, the honest website wording is *included, subject
to an excess of €X*, and the only error is the missing excess.

**If instead the contract is right and they are paid options**, the website
overstates what the base price buys and the included list is the thing to change.

**If the website is right and the contract is stale**, the printed stock needs
replacing — already open as **W14** for a different error in the same form.

---

## What I am not asking for

Nothing here asks you to change a price, withdraw a product or alter what a
customer is covered for. Item 1 is a noun. Item 2 is a question about which of
two existing documents states the current reality.

## What happens on approval

Both are content changes in `lib/i18n/content/`, covered by `content.test.ts`.
No schema, no migration, no customer data.

**Item 1: say "theft waiver" and I merge it.** **Item 2: answer the three lines
and I will bring you the exact wording before changing anything**, per §13 — a
general instruction to carry on is not approval of a particular wording.
