-- ============================================================================
-- Turnaround time between rentals.
--
-- Availability was decided on dates alone, with strict inequalities, so a car
-- returning on the 20th could be re-let on the 20th and the overlap check saw
-- nothing: return_date > pickup_date is false when the two are equal. A car
-- back at 10:30 could therefore be promised to the next customer at 11:30 —
-- and in practice it still needs cleaning, refuelling and a damage check.
--
-- The window belongs on the vehicle rather than in one global setting because
-- it is genuinely different per category: a bicycle is wiped down and gone, a
-- car is not.
--
-- On the numbers: published figures for a managed rental fleet put a full
-- turnaround near four hours, but most of that is a vehicle queueing between
-- inspection, cleaning and maintenance departments. A direct handover has no
-- such queue, so the relevant figure is the work itself — 30-90 minutes of
-- cleaning plus fuel, damage check and paperwork. 120 minutes for a car is the
-- operator's own figure for this fleet, not an industry benchmark. The scooter
-- and bicycle windows are estimates; no comparable published data exists for
-- either, since the majors do not rent them.
-- ============================================================================

ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS turnaround_minutes integer NOT NULL DEFAULT 120;

COMMENT ON COLUMN vehicles.turnaround_minutes IS
  'Minutes the vehicle is unavailable after a rental ends, for cleaning and preparation. Enforced by the availability check.';

-- Seed by category. Cars keep the 120-minute default.
UPDATE vehicles SET turnaround_minutes = 30
  WHERE pricing_group = 'bike' AND turnaround_minutes = 120;

UPDATE vehicles SET turnaround_minutes = 60
  WHERE pricing_group IN ('motorbike_a','motorbike_b') AND turnaround_minutes = 120;

ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS vehicles_turnaround_minutes_check;
ALTER TABLE vehicles ADD CONSTRAINT vehicles_turnaround_minutes_check
  CHECK (turnaround_minutes >= 0 AND turnaround_minutes <= 1440);

NOTIFY pgrst, 'reload schema';
