-- ============================================================================
-- Repairs the quote → reservation conversion, and adds a flight number.
--
-- 001_baseline.sql declares reservations.customer_first_name and
-- customer_last_name, and create_reservation() reads both out of its JSON
-- payload — but the live table never got them, so it carries customer_name
-- alone. The admin form posts the whole form object, so every conversion died
-- on "Could not find the 'customer_first_name' column of 'reservations' in the
-- schema cache". This brings the live table back in line with the baseline
-- rather than deleting the fields, because quotes and customers already store
-- the name split in two and the reservation is what joins them up.
--
-- flight_number goes on both tables: it is captured at quote time and has to
-- survive conversion. Arrivals drive airport handovers, so staff need it on
-- the reservation, not only on the quote it came from.
-- ============================================================================

ALTER TABLE reservations ADD COLUMN IF NOT EXISTS customer_first_name text;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS customer_last_name  text;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS flight_number       text;

ALTER TABLE quotes       ADD COLUMN IF NOT EXISTS flight_number       text;

-- Split the existing single-field names so historic reservations are not left
-- blank in a form that now shows the two fields separately. Everything before
-- the first space is the given name; anything after it is the surname, which
-- keeps multi-part surnames ("van der Berg", "Papadopoulos Rizos") intact.
-- A single-word name leaves the surname NULL rather than duplicating it.
UPDATE reservations
SET
  customer_first_name = COALESCE(customer_first_name, split_part(customer_name, ' ', 1)),
  customer_last_name  = COALESCE(customer_last_name,
                                 NULLIF(regexp_replace(customer_name, '^\S+\s*', ''), ''))
WHERE customer_name IS NOT NULL
  AND (customer_first_name IS NULL OR customer_last_name IS NULL);

-- Reservations reached through the airport need the flight to be findable.
CREATE INDEX IF NOT EXISTS reservations_flight_number_idx
  ON reservations (flight_number)
  WHERE flight_number IS NOT NULL;

NOTIFY pgrst, 'reload schema';
