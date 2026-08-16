-- ============================================================================
-- SECURITY FIX — remove public (anon) access to customer data
--
-- The anon key is embedded in the public website's JavaScript, so anything the
-- anon role can read is readable by anyone on the internet. RLS filters ROWS,
-- not COLUMNS, so a policy meant to expose "availability" exposed every column
-- of every reservation.
--
-- Verified exposed before this migration, using only the public anon key:
--   reservations  — customer_name, customer_email, customer_phone,
--                   customer_nationality, totals, invoice fields
--   quotes        — first_name, last_name, email, dob, address, postal_code,
--                   city, country, mobile_tel, landline_tel
--   promo_codes   — every active discount code (SUMMER10, SUMMER20)
--   rate_limits   — FOR ALL, so anon could reset its own rate-limit rows
--   quotes/reservations INSERT — anon could write rows directly, bypassing
--                   server-side pricing, validation and reCAPTCHA
--
-- Safe to apply: every application read/write goes through app/api/** using
-- SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS entirely. No client-side code
-- imports the browser Supabase client for data (only admin auth pages use it).
-- ============================================================================

-- ─── Reservations: no public access at all ───────────────────
DROP POLICY IF EXISTS "public_read_reservations_availability" ON reservations;
DROP POLICY IF EXISTS "public_insert_reservations" ON reservations;

-- ─── Quotes: contained full identity documents worth of PII ──
DROP POLICY IF EXISTS "public_read_quotes_by_ref" ON quotes;
DROP POLICY IF EXISTS "public_insert_quotes" ON quotes;

-- ─── Promo codes: enumerable discount codes ──────────────────
DROP POLICY IF EXISTS "public_read_promo_codes" ON promo_codes;

-- ─── Rate limits: anon could clear its own throttle records ──
DROP POLICY IF EXISTS "public_rate_limits" ON rate_limits;

-- ─── Quote lookup throttle: created by hand, ensure RLS on ───
-- Service role bypasses RLS, so no policy is needed for the app to work.
ALTER TABLE IF EXISTS quote_rate_limits ENABLE ROW LEVEL SECURITY;

-- Deliberately KEPT public — non-sensitive catalogue data already shown on the
-- marketing site: public_read_vehicles, public_read_rates, public_read_extras.

-- ─── Verification ────────────────────────────────────────────
-- Run as anon (or from the browser console on the live site); each must be 0:
--   select count(*) from reservations;
--   select count(*) from quotes;
--   select count(*) from promo_codes;
