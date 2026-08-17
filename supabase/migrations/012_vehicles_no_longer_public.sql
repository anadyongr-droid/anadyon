-- ============================================================================
-- SECURITY FIX — withdraw public (anon) read access to vehicles
--
-- 002_lock_down_anon_access.sql deliberately kept `public_read_vehicles`,
-- recording the reason plainly: vehicles held non-sensitive catalogue data
-- already shown on the marketing site — name, category, status, sort order.
-- That was correct for the table as it stood.
--
-- 011_fleet_and_customer_records.sql invalidated it. The table now also holds:
--
--   purchase_price        what was paid for each vehicle
--   insurance_policy_no   the policy number
--   insurance_provider    the insurer
--   odometer_km           mileage
--   kteo_expiry           roadworthiness expiry
--   road_tax_paid_until   circulation tax status
--   plate                 registration
--   vehicle_notes         free text
--
-- The anon key is embedded in the public website's JavaScript, so anything the
-- anon role can read is readable by anyone on the internet. RLS filters ROWS,
-- not COLUMNS — the same lesson 002 was written to record — so a policy that
-- exposes the catalogue exposes the purchase price alongside it.
--
-- Verified before writing this: every query against vehicles lives in
-- app/api/admin/** and uses SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS
-- entirely. The public car, motorbike and bicycle pages render hardcoded lists
-- in their client components and never read this table. Dropping the policy
-- therefore costs the marketing site nothing.
--
-- Confirmed at the time of writing that the sensitive columns were still empty,
-- so nothing had actually been disclosed — the exposure was latent, waiting for
-- the first purchase price to be entered.
-- ============================================================================

DROP POLICY IF EXISTS "public_read_vehicles" ON vehicles;

-- Belt and braces: revoke the table grant as well, so re-adding a policy by
-- hand cannot silently reopen this without the grant being restored too.
REVOKE ALL ON vehicles FROM anon;

ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;

-- The two tables added by 011 are admin-only by nature and never had a public
-- policy; enabling RLS makes that explicit rather than implicit.
ALTER TABLE vehicle_costs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_damages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON vehicle_costs   FROM anon;
REVOKE ALL ON vehicle_damages FROM anon;

-- ─── Verification ────────────────────────────────────────────
-- After applying, with the anon key only, each of these must return zero rows:
--   select * from vehicles;
--   select * from vehicle_costs;
--   select * from vehicle_damages;
-- and the admin fleet screen must continue to work, because the service role
-- is unaffected by RLS.

NOTIFY pgrst, 'reload schema';
