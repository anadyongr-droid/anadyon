-- The live reservations.status check constraint accepts only five values:
-- pending, confirmed, active, returned, cancelled.
--
-- The admin form has always offered seven. Selecting `voided` or `no_show` and
-- saving produced "new row for relation reservations violates check constraint
-- reservations_status_check" — two of the seven options in the dropdown could
-- never be saved.
--
-- 001_baseline.sql declares the full set, so this is the same drift that left a
-- legacy NOT NULL `name` on customers: the live table predates the migration
-- files and CREATE TABLE IF NOT EXISTS never reconciled it. The migration files
-- describe the schema that was intended, not the schema that exists.
--
-- Both values are load-bearing elsewhere. The overlap check in the reservations
-- API and the availability endpoint both exclude
-- ("cancelled","voided","no_show") when deciding whether a vehicle is free — so
-- until now those two exclusions could never match anything, and a vehicle held
-- by a no-show stayed blocked with no way to release it except cancelling.

ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_status_check;

ALTER TABLE reservations ADD CONSTRAINT reservations_status_check
  CHECK (status IN ('pending','confirmed','active','returned','cancelled','no_show','voided'));

NOTIFY pgrst, 'reload schema';
