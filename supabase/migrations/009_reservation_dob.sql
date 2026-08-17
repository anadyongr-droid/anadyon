-- ============================================================================
-- Date of birth on reservations.
--
-- The public booking form demands a date of birth, quotes.dob stores it, and
-- customers.dob stores it — but reservations had no column for it, so the one
-- record the rental agreement is produced from was the only one without it.
-- A quote converted to a reservation dropped the field on the floor, and a
-- booking taken by phone straight into the admin never captured it at all.
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

-- Backfill from the linked customer where one exists, so historic reservations
-- inherit a birth date already on file rather than showing as incomplete.
UPDATE reservations r
SET customer_dob = c.dob
FROM customers c
WHERE r.customer_id = c.id
  AND r.customer_dob IS NULL
  AND c.dob IS NOT NULL;

NOTIFY pgrst, 'reload schema';
