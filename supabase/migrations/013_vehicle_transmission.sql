-- ============================================================================
-- Transmission on the vehicle record.
--
-- quotes.transmission records what the customer asked for, but vehicles had no
-- matching column — the fact lived only as a hardcoded string inside the public
-- page components. So nothing could compare the two, and the system was unable
-- to tell that assigning the automatic Peugeot to a manual booking was a
-- substitution at all.
--
-- Transmission is the one attribute a substitution may never cross. Industry
-- practice encodes it in the ACRISS category itself (third letter: A automatic,
-- M manual) precisely because it is not interchangeable: a customer who booked
-- an automatic may be unable to drive a manual at all, and one who booked a
-- manual is usually paying a lower rate to avoid the automatic premium.
--
-- Seeded from the current fleet as the public pages describe it:
--   car_c        Peugeot 107      Automatic
--   car_a, car_b Micra, Panda,
--                Getz, i10, i20   Manual
--   motorbike_*  Kymco scooters   Automatic (twist-and-go)
--   bike         bicycles         not applicable, left NULL
-- ============================================================================

ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS transmission text
  CHECK (transmission IS NULL OR transmission IN ('Manual','Automatic'));

COMMENT ON COLUMN vehicles.transmission IS
  'Manual or Automatic. NULL for bicycles. A reservation may never substitute across transmission types — see lib/substitution.ts.';

UPDATE vehicles SET transmission = 'Automatic'
  WHERE transmission IS NULL AND pricing_group IN ('car_c','motorbike_a','motorbike_b');

UPDATE vehicles SET transmission = 'Manual'
  WHERE transmission IS NULL AND pricing_group IN ('car_a','car_b');

-- Bicycles keep NULL: the concept does not apply, and a placeholder value would
-- make a bicycle look substitutable against a car on transmission grounds.

CREATE INDEX IF NOT EXISTS vehicles_transmission_idx
  ON vehicles (transmission) WHERE transmission IS NOT NULL;

NOTIFY pgrst, 'reload schema';
