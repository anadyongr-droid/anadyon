# Pricing integrity, promo ledger, child-seat limit and email workflow stage

Status date: **2026-08-23**
Migration: `20260823170000_promo_ledger_seats_email_kinds.sql`
SQL Editor copy: `supabase/migrations/paste/033_promo_ledger_seats_email_kinds_paste.sql`

## 1. What this release changes

Four related pieces of work, all of which were reachable defects rather than
theoretical ones.

### 1.1 The submitted pricing group is no longer trusted

`lib/vehicleCatalogue.ts` is now the single declaration of every model we rent,
with its vehicle type, pricing group and transmission. It replaces the mapping
that was written out separately in `CarsClient.tsx`, `MotorbikesClient.tsx` and
`BikesClient.tsx` and passed to the booking form, which then submitted the
pricing group back to the server as if it were an input.

`/api/quote` now derives type, group and transmission from the selected model:

- an expensive model submitted alongside a cheap group is priced at its own
  group's rate;
- an **unknown model is refused**, rather than producing a €0 vehicle subtotal
  and an accepted-looking quote;
- a known model with no rate row returns 503 rather than a free rental;
- the stored `selected_model` is the catalogue's spelling, so a near-miss match
  cannot write a variant name.

### 1.2 Promo codes are a formula, and uses are a ledger

`/api/promo/validate` no longer accepts a `total`. It answers with the code's
**type and value**; the deduction is computed against the current subtotal —
in the browser for display, in the database for the figure that is stored.

`BookingForm` keeps the formula rather than an amount, so a percentage code
follows changes to dates, model, FDW, seats and additional drivers instead of
freezing at the value it had when it was entered. A fixed code is capped at the
subtotal, and the total can never go negative.

`clientTotal` is out of the idempotency key. It used to be included, so
altering the submitted total produced a different key for an otherwise
identical request — defeating the replay protection the key exists to provide.

**Promo lifecycle.** `promo_codes.used_count` was incremented the moment a
website request arrived, so a limited code could be exhausted by people who
never paid, and a cancelled booking never gave its use back. The new
`promo_redemptions` ledger holds/redeems/releases instead:

| Point | What happens |
|---|---|
| Website request | Validate only. **No use is consumed.** |
| Quote confirmation sent | `promo_hold` — held until the payment deadline |
| Payment verified | `promo_redeem` — replay-safe, increments `used_count` |
| Deadline lapses, cancelled, voided, no-show | `promo_release` — the use returns |

`promo_uses_remaining` counts redeemed plus unexpired holds, so a lapsed hold
stops blocking the code even before the sweep runs. A redeemed use is never
released — that one was genuinely spent. Re-sending a quote confirmation
extends the existing hold rather than consuming a second use.

`promo_release_expired()` sweeps lapsed holds; wire it into the daily cron if a
tidy ledger matters, but correctness does not depend on it.

### 1.3 Maximum three child seats in total

`baby_seat + child_seat <= 3`, enforced at four boundaries: the public form
(each dropdown offers only what the other leaves), the public API schema, both
admin reservation routes, and check constraints on `quotes` and `reservations`.

Nothing is ever silently reduced — a customer who asks for four seats is told
we cannot fit four.

### 1.4 One audited path for all three customer emails

`booking_email_deliveries.kind` gains `acknowledgment` and
`booking_confirmation`. All three customer workflow emails now create their
audit row before the provider is called and carry the row's id as a Resend tag.

The **stage** shown on the reservation list and in the reservation modal is
*derived* from those rows — `booking_confirmation > quote_confirmation >
acknowledgment` — and is not stored, not editable, and not accepted from any
client. A stage only advances once the provider has actually taken the message:
`pending`, `queued` and `failed` never read as sent.

The delivery condition is shown **beside** the stage, not instead of it, so the
office sees `Booking confirmed — Bounced` rather than being told a customer has
an email that bounced.

Acknowledgment and booking confirmation are once per reservation, enforced by a
partial unique index. `failed` rows are excluded from that index so a message
that could be neither sent nor queued can be retried, while the failed attempt
remains as the record that a confirmation once went missing. Quote confirmations
are deliberately exempt: staff resend them on purpose.

### 1.5 Internal alerts no longer reply to the customer

`/api/quote` set `replyTo: <customer email>` on the internal office
notification, so a staff member hitting Reply wrote to the customer. Removed.
Replies stay internal; a labelled **Compose email to customer** link makes
contacting them a deliberate click. The Contact form's own Reply-To behaviour is
intentional and unchanged.

## 2. Deployment gate

**Do not merge before the database step.** The application expects
`promo_redemptions`, the new email kinds and the seat constraints to exist.

### Step 1 — run the preflight, read-only

The migration adds check constraints to two live tables and **will refuse to
apply** if any existing row breaches them. Run this first in the Supabase SQL
Editor and read the result:

```sql
select 'quotes' as table_name,
       count(*) filter (where coalesce(baby_seat,0) + coalesce(child_seat,0) > 3) as over_limit,
       count(*) filter (where coalesce(baby_seat,0) < 0 or coalesce(child_seat,0) < 0) as negative,
       max(coalesce(baby_seat,0) + coalesce(child_seat,0)) as worst_total
  from public.quotes
union all
select 'reservations',
       count(*) filter (where coalesce(baby_seat,0) + coalesce(child_seat,0) > 3),
       count(*) filter (where coalesce(baby_seat,0) < 0 or coalesce(child_seat,0) < 0),
       max(coalesce(baby_seat,0) + coalesce(child_seat,0))
  from public.reservations;
```

If `over_limit` and `negative` are both **0** on both rows, continue.

If either is non-zero, list the offending rows and decide case by case — these
are real customer requests:

```sql
select id, ref, baby_seat, child_seat, created_at
  from public.quotes
 where coalesce(baby_seat,0) + coalesce(child_seat,0) > 3
    or coalesce(baby_seat,0) < 0 or coalesce(child_seat,0) < 0
 order by created_at desc;
```

Do **not** bulk-trim quantities to make the migration pass. Contact the
customer, or record the agreed arrangement, before changing what they asked for.

### Step 2 — apply the migration

1. Supabase production → **SQL Editor**.
2. Run the whole of
   `supabase/migrations/paste/033_promo_ledger_seats_email_kinds_paste.sql`.
3. Confirm the final result reads:

   `REACHED THE END — promo ledger, child-seat limit, email kinds`

4. Merge the PR and wait for the Production deployment to be Ready.

### Step 3 — verify in production

- Submit one controlled website request with a promo code. Confirm the quote
  stores the correct price, and that `promo_codes.used_count` **has not**
  moved and `promo_redemptions` is still empty for it.
- Send the quote confirmation. Confirm a `held` row now exists with
  `expires_at` matching the payment deadline.
- Pay the deposit. Confirm the row becomes `redeemed` and `used_count`
  increments by exactly one.
- Cancel a different held booking and confirm its row becomes `released` and
  the code becomes available again.
- Check the reservation list shows the customer email stage, and that a
  reservation whose confirmation bounced reads `Booking confirmed — Bounced`.

## 3. Verification completed before release

Recorded against the branch, not inferred:

- 322 unit, regression and migration tests pass, including 11 PGlite cases that
  execute the real migration and its byte-identical paste copy.
- TypeScript passes.
- ESLint reports zero errors.
- Production build passes.
- Translation, accessibility, SEO and Playwright suites pass.
- `npm audit` reports zero vulnerabilities.
- CodeQL: the **policy check** was confirmed green, not merely the analysis job.
  See the rule in `HANDOFF-CODEX-2026-08-23.md` §12 — a successful workflow run
  is not evidence the findings are clear.

## 4. Things deliberately not done

- `promo_release_expired()` is not yet wired into the daily cron. Availability
  is already correct without it because `promo_uses_remaining` ignores expired
  holds; the sweep only tidies state.
- The website still does not ask for passport or licence details, and this
  release does not change that.
- `promo_codes.used_count` is kept in step by the ledger for continuity with
  existing admin screens, but the ledger is the authority. Do not reintroduce
  logic that reads `used_count` to decide availability.
