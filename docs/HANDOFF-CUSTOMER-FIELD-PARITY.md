# Customer field parity — handover

Status date: 2026-08-22

## Purpose

This is a narrowly scoped corrective release for website-created quotes and
their automatically-created pending reservations. It fixes three verified
issues without changing pricing, allocation, locations or document data.

1. The API passed `customer_name` but omitted `customer_first_name` and
   `customer_last_name` from the reservation JSON. The admin reservation form
   reads the separate fields, so a customer could appear nameless there.
2. SQL NULL document dates were passed directly into native HTML date inputs.
   A browser could retain or show a misleading date. Missing values must be
   displayed as blank; there is no evidence those dates were stored wrongly.
3. The atomic booking function linked the customer but did not populate an
   otherwise blank customer DOB from the website quote.

## Branch and scope

- Worktree: `work/anadyon-security-canonical-host`
- Branch: `codex/customer-field-parity`
- Base: `origin/main` at `f95c389` when work began.
- Keep this release separate from H1 and any pricing work.
- Do not add passport or driving-licence fields to the public website: they are
  intentionally collected by staff after documents are presented.

## Code changes

- `app/api/quote/route.ts`: includes first and last name in every new
  operational reservation payload.
- `app/admin/components/CustomerModal.tsx`: renders nullable DOB, passport
  expiry and licence expiry fields with a blank controlled date input.
- `lib/bookingFields.ts`: shared `dateInputValue` helper.
- `lib/bookingFields.test.ts` and `lib/quoteBooking.test.ts`: regression tests.
- `app/quote/page.tsx` and `app/el/quote/page.tsx`: a small pre-existing App
  Router production-build fix. The English page default export incorrectly
  accepted a `locale` prop; locale now derives from the route, and the Greek
  wrapper no longer passes a non-PageProps prop.

## Database migration

`supabase/migrations/20260822010000_customer_field_parity.sql` is transaction
safe and has the matching SQL-editor file:
`supabase/migrations/paste/028_customer_field_parity_paste.sql`.

It creates an internal trigger that fills `customers.dob` only if it is blank,
and backfills linked quotes/reservations/customers only where identity/DOB
fields are blank. It never overwrites existing values and never creates or
changes passport/licence data. Malformed historical DOB text is ignored rather
than causing a booking or migration failure.

## Release/verification sequence

1. Run the unit tests, type check, lint, build and `git diff --check`.
2. Review the exact migration and paste files together; they must stay in sync.
3. Apply the migration once to the production Supabase project using the
   authorized migration mechanism. Confirm the `REACHED THE END — customer
   field parity` result.
4. Verify only counts/field presence, without exposing customer PII:
   - linked web reservations with blank first/last name or DOB;
   - linked customers with a quote DOB but blank customer DOB;
   - document date fields were not changed by this release.
5. Commit/push this branch, open/review PR, merge only when checks are green.
   The Vercel production deployment then carries the API/UI change.
6. Create one controlled new web quote and confirm: its reservation shows
   first name, surname and DOB; linked customer has DOB; blank passport and
   licence expiry inputs display blank.

## Safety boundaries

- No migration is related to vehicle allocation, pricing or H1.
- Do not set a missing passport or licence expiry to the booking date, current
  date, or any inferred value.
- Existing staff-entered customer master values take precedence over the web
  request snapshot.
- Do not merge/deploy a failed build, or make an unreviewed direct edit to the
  database.

## Final status log

### 2026-08-22 — completed before website deployment

- Production migration `customer_field_parity` was applied successfully through
  the authorized Supabase connection.
- Before the migration, the database had two linked reservations needing the
  identity/DOB backfill and three linked customers with a quote DOB but a blank
  customer DOB. No document fields were selected, changed or inferred.
- After the migration: **0** linked reservations remain missing those fields;
  **0** linked customers remain in that specific incomplete state.
- The `sync_web_quote_customer_dob` trigger is active on `quotes`; neither
  `anon` nor `authenticated` can execute its internal function directly.
- Focused regressions: **10 passed**. Full unit suite: **213 passed**.
- TypeScript passed. Touched-file lint passed; the full lint run has 22 existing
  warnings and no errors.
- `git diff --check` passed. A production Webpack compilation and type check
  passed; its local page-data phase requires environment variables that are not
  stored in this worktree, and completes with non-secret placeholders.
- The release still needs commit/push, PR/CI review, merge, Vercel production
  deployment and the single controlled browser verification in step 6 above.
