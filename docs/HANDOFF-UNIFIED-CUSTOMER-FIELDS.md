# Unified customer fields and mobile booking — handover

Status date: 2026-08-22

## Branch

- Worktree: `work/anadyon-unified-fields`
- Branch: `codex/unified-customer-fields-and-nbg`
- Base: `origin/main` at `4d76f0c` (PR #13 merged)
- No NBG payment code is included; see `docs/NBG-PAYMENTS-INTEGRATION.md`.

## Verified cause

Production has three customer records. All three have SQL NULL for both
`passport_expiry` and `driving_licence_expiry`; zero records contain the
current date. The misleading “today” value is the native browser date picker,
not persisted customer data.

## Changes

- One compact, explicit Day/Month/Year component is shared by:
  - public booking DOB;
  - all reservation views (they already use one ReservationModal component);
  - Customer DOB, passport expiry and licence expiry.
- Blank optional document dates are visibly blank and have an explicit Clear
  action. No date is inferred.
- Public booking now collects optional flight number and stores the normalized
  value in its Quote and automatically-created Reservation.
- Migration 029 synchronizes only mutable customer identity/contact fields
  between Customer, linked Quotes and linked Reservations.
- Flight number synchronizes only within its Quote/Reservation pair because it
  belongs to a trip, not a customer.
- Pricing, dates, vehicles, extras, statuses and payment values remain booking
  snapshots and are never changed by the synchronization triggers.
- Customer PATCH now whitelists editable columns and cannot overwrite stored
  payment-provider metadata that happens to be present in the form payload.

## Database migration

- Tracked migration:
  `supabase/migrations/20260822150000_sync_customer_booking_fields.sql`
- SQL-editor copy:
  `supabase/migrations/paste/029_sync_customer_booking_fields_paste.sql`
- Both are transaction wrapped and end with:
  `REACHED THE END — shared customer fields synchronized`.
- Trigger functions are security-definer with an empty search path and have no
  direct execute grant for public, anon, authenticated or service_role.
- The two files must remain byte-equivalent.

## Verification completed locally

- Full unit suite: 218 passed.
- Migration behavioural tests: customer → all linked records; reservation →
  customer/all linked identity; flight → only its linked booking.
- Production build and TypeScript: passed.
- Translation check: 14/14 Greek pages, no hardcoded translated-component text.
- Static accessibility scan: 28 pages, zero detected violations.
- Chromium browser suite: 16 passed, 2 data-dependent tests skipped because the
  local build used safe placeholder Supabase values.
- The new 320px mobile DOB/flight regression passed.
- `git diff --check`: passed.

## Production sequence

1. Review/merge the PR only after CI is green.
2. Apply migration 029 through the authorized Supabase migration mechanism.
3. Re-run Supabase security and performance advisors.
4. Deploy the merged commit through Vercel.
5. Verify a blank Customer passport/licence expiry displays blank.
6. Edit one linked customer identity field and confirm Customer, Quote and
   Reservation agree.
7. Edit one Reservation flight number and confirm only its linked Quote changes.
8. Submit one controlled website quote with a flight number; confirm one Quote,
   one pending Reservation and one Customer are created/linked, then remove the
   test rows.
9. Review Vercel runtime logs for new errors.

## Safety notes

- Website submissions fill missing master data but must not silently replace
  staff-verified identity/document data for a returning customer.
- Passport and driving-licence fields remain Customer-owned; the public website
  does not collect them.
- Do not deploy guessed NBG Pay or Key2Pay behavior. Bank onboarding and the
  official merchant integration specification are mandatory.

