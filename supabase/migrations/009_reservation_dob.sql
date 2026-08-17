-- ============================================================================
-- Date of birth on reservations.
--
-- The public booking form demands a date of birth and quotes.dob stores it,
-- but reservations had no column for it, so the one record the rental agreement
-- is produced from was the only one without it. A quote converted to a
-- reservation dropped the field on the floor, and a booking taken by phone
-- straight into the admin never captured it at all.
--
-- Note that 001_baseline.sql also declares customers.dob, which the live
-- database does not have — the same drift that left customer_first_name and
-- customer_last_name missing from reservations. The baseline file describes an
-- intended schema, not the deployed one.
--
-- Driver age governs both eligibility and pricing, so this is not a cosmetic
-- gap: it is the field the agreement and any age-based surcharge depend on.
--
-- Nullable on purpose. Staff take bookings over the phone and cannot always get
-- a birth date in the moment; the form marks the reservation incomplete rather
-- than refusing to save it.
-- ============================================================================

ALTER TABLE reservations ADD COLUMN IF NOT EXISTS customer_dob date;

COMMENT ON COLUMN reservations.customer_dob IS
  'Driver date of birth. Required before the rental agreement can be produced; nullable so a phone booking can be saved and completed later.';

-- No backfill. customers has no dob column to copy from, and while quotes does,
-- nothing joins a reservation to the quote it came from except a "Quote ref:"
-- string inside notes. Matching on email instead would attach one quote's birth
-- date to a different booking by the same person, and quotes.dob is text rather
-- than a date, so a malformed value would fail the cast mid-migration.
--
-- Historic reservations therefore show as incomplete, which is accurate: they
-- genuinely have no birth date recorded. Guessing one would be worse than
-- showing the gap.

NOTIFY pgrst, 'reload schema';
