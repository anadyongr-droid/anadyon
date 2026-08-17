-- ============================================================================
-- SECURITY FIX (CRITICAL) — remove public execute on privileged functions
--
-- 002_lock_down_anon_access.sql removed the anonymous *table* policies but left
-- *function* execute untouched. Postgres grants EXECUTE to PUBLIC on every new
-- function by default, so five SECURITY DEFINER functions — which run with the
-- owner's rights and therefore bypass RLS entirely — stayed callable with the
-- public anon key that ships in the website's JavaScript.
--
-- Verified against the live database on 2026-08-18 using only the anon key:
--
--   claim_dcl_submission      HTTP 200, returned true  ← changed state
--   claim_invoice_submission  HTTP 200, returned true  ← changed state
--   next_invoice_aa           HTTP 200, returned 1     ← leaked the sequence
--   redeem_promo              executed; refused on business logic, not on
--                             permission, so the promo table was reachable
--   book_vehicle              signature not matched by the probe, but carries
--                             the same default grant and inserts reservations
--                             from caller-supplied JSON
--
-- The exposure is worse than a readable table: these bypass reCAPTCHA, the rate
-- limits, the server-side price recalculation and every role check, because
-- they never pass through the application at all.
--
-- Safe to apply. Every caller in the codebase reaches these through
-- supabaseAdmin, which authenticates as service_role and is unaffected by a
-- revoke aimed at PUBLIC, anon and authenticated.
-- ============================================================================

-- PUBLIC first: revoking from anon alone leaves the inherited grant in place,
-- which is exactly how this survived the previous lockdown.
REVOKE ALL ON FUNCTION book_vehicle(uuid, date, date, jsonb, uuid)   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION redeem_promo(text, numeric)                   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION next_invoice_aa(text)                         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION claim_dcl_submission(uuid)                    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION claim_invoice_submission(uuid)                FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION book_vehicle(uuid, date, date, jsonb, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION redeem_promo(text, numeric)                 TO service_role;
GRANT EXECUTE ON FUNCTION next_invoice_aa(text)                       TO service_role;
GRANT EXECUTE ON FUNCTION claim_dcl_submission(uuid)                  TO service_role;
GRANT EXECUTE ON FUNCTION claim_invoice_submission(uuid)              TO service_role;

-- A SECURITY DEFINER function without a fixed search_path can be redirected to
-- attacker-created objects by a caller who controls their own search_path. The
-- functions are pinned so an unqualified name always resolves to the intended
-- table.
ALTER FUNCTION book_vehicle(uuid, date, date, jsonb, uuid) SET search_path = public, pg_temp;
ALTER FUNCTION redeem_promo(text, numeric)                 SET search_path = public, pg_temp;
ALTER FUNCTION next_invoice_aa(text)                       SET search_path = public, pg_temp;
ALTER FUNCTION claim_dcl_submission(uuid)                  SET search_path = public, pg_temp;
ALTER FUNCTION claim_invoice_submission(uuid)              SET search_path = public, pg_temp;

-- Stops the same hole reopening on the next function written. Postgres applies
-- default privileges at creation time, so this governs future functions only —
-- the explicit revokes above are what close the existing ones.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- ─── Verification ────────────────────────────────────────────────────────────
-- With the anon key only, each of these must return 401/403 rather than a value:
--   POST /rest/v1/rpc/next_invoice_aa           {"p_series":"X"}
--   POST /rest/v1/rpc/claim_dcl_submission      {"p_reservation_id":"…"}
--   POST /rest/v1/rpc/claim_invoice_submission  {"p_reservation_id":"…"}
--   POST /rest/v1/rpc/redeem_promo              {"p_code":"X","p_total":1}
-- The admin quote flow must continue to work, because it calls through
-- service_role.

NOTIFY pgrst, 'reload schema';
