-- Ten tables still carry a SELECT grant for `anon` and `authenticated`. No data
-- escapes today — row-level security returns nothing on every one of them — but
-- that is the weaker of the two defences available, and it is the only one they
-- have. `reservations`, `quotes`, `vehicles`, `vehicle_costs` and
-- `vehicle_damages` are already stronger: the grant itself was removed, so the
-- request fails at the privilege check and never reaches a policy.
--
-- The gap matters because the two defences fail differently. A missing grant
-- fails closed no matter what policies exist. A grant plus RLS stays closed only
-- while every policy on the table is correct — so one permissive policy added
-- later for a genuine feature, on any of these tables, silently publishes the
-- lot. `customers` and `emails` hold the personal data; the rest hold commercial
-- terms and internal state that no visitor needs.
--
-- Verified before writing this: the anon key is used in exactly three places
-- (admin login, MFA enrolment, session refresh) and in none of them to read a
-- table. Every page that shows data fetches it through an API route on the
-- service role, so nothing in the site depends on these grants.
--
-- `rates` and `extras_config` are deliberately left readable. They are the
-- public price list.

REVOKE SELECT ON TABLE
  customers,
  emails,
  alert_outbox,
  promo_codes,
  discount_rules,
  system_settings,
  competitor_rates,
  competitor_group_map,
  quote_rate_limits,
  rate_limits
FROM anon, authenticated;

-- New tables inherit the same posture rather than depending on someone
-- remembering to revoke.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT ON TABLES FROM anon, authenticated;
