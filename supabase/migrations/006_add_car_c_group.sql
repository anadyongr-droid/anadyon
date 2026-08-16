-- ============================================================================
-- Adds pricing group 'car_c' for automatic cars.
--
-- Both competitors charge a consistent ~21% premium for an automatic over the
-- equivalent manual, so automatics need their own group: folding them into
-- car_a would either underprice the automatic or drag the manual rates up.
--
-- vehicles.pricing_group and rates.pricing_group both carry a CHECK listing the
-- permitted groups, so both must be widened before any car_c row can be stored.
-- ============================================================================

ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS vehicles_pricing_group_check;
ALTER TABLE vehicles ADD CONSTRAINT vehicles_pricing_group_check
  CHECK (pricing_group IN ('car_a','car_b','car_c','motorbike_a','motorbike_b','bike'));

ALTER TABLE rates DROP CONSTRAINT IF EXISTS rates_pricing_group_check;
ALTER TABLE rates ADD CONSTRAINT rates_pricing_group_check
  CHECK (pricing_group IN ('car_a','car_b','car_c','motorbike_a','motorbike_b','bike'));

NOTIFY pgrst, 'reload schema';
