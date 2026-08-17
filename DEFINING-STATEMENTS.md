# What defines the Anadyon website and rental system

Principles the build is held to. They exist so a future change can be judged
against something stated, rather than against whoever happens to be reviewing.
Referenced by the audit report.

---

## 1. Photo quality is balanced against download speed, not sacrificed to it

The fleet is the product, and a soft or muddy vehicle photograph costs a booking
that a fast page never wins back. Source images are kept at a resolution that
still looks right on a retina screen; the saving comes from delivering them
well — AVIF first, correctly sized per breakpoint — rather than from degrading
the originals.

**In practice:** sources at ~1600px, encoded at quality 82. Every `<Image>`
declares the width it actually occupies, so a 288px card is never sent a
1600px file. Measured: 56KB AVIF against 141KB JPEG for the same photograph.

## 2. The website is user-friendly and transparent

Prices include what the customer will pay. No fee appears at the desk that was
absent from the quote. Extras are itemised, the deposit is shown as a figure
rather than a percentage to work out, and the terms are linked from the point
of decision rather than buried.

## 3. Dark mode is a supported theme, not an accident

Both themes are designed. Fixed-brand surfaces — the orange navigation band,
the white call-to-action buttons, the cookie overlay — stay deliberately
constant across themes; everything else adapts.

## 4. The public site and the rental system collect the same data

**Whatever the customer is asked for, the rental system can hold and staff can
enter — and the reverse.** A field collected on a quote that the reservation
cannot store is a dead end: the data is gathered, shown to the customer, and
then silently dropped at conversion.

Parity is about *what* is collected, not *how strictly*:

- The **public form is a gate.** It refuses an incomplete booking, because
  there is nobody to chase the missing detail afterwards.
- The **rental system is a workbench.** Staff take bookings by phone, mid-
  conversation, with a customer reading out a passport. It holds the same
  fields but allows the non-essential ones to be completed later — and names
  what is still missing rather than letting the gap go unnoticed.

The two also *behave* alike where the customer would notice: the same calendar,
the same half-hour time options, the same field labels. A reservation staff
enter should be one the customer could have made themselves.

**Minimum to save a reservation:** vehicle, dates, times, first name, surname,
email, phone, and a total that is not zero by accident.
**Deferrable:** date of birth, nationality, flight number.

## 5. Pricing is calculated in one place

All price calculation happens client-side in the booking form. The API formats
and emails the values it is given and never recalculates them, so there is no
second implementation to drift out of step with the first.

## 6. Customer data is not exposed by default

Tables are never granted to the anonymous role. Row-level security filters
rows, not columns, so a readable table is a readable table — the protection has
to be that the anonymous key cannot reach it at all.

## 7. Claims about the system are verified, not assumed

Schema questions are answered against the live database, DNS against live
resolvers, vendor behaviour against vendor documentation, performance against
measurement. Anything that cannot be checked is labelled unverified rather than
filled in.
