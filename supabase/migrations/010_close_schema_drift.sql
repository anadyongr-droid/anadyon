-- ============================================================================
-- Closes the drift between 001_baseline.sql and the deployed database.
--
-- The baseline declares columns the live database never received. This was
-- first noticed when quote → reservation conversion failed on
-- customer_first_name; a full comparison of every declared column against the
-- live schema then found three more tables in the same state, and four of the
-- resulting queries fail outright today:
--
--   reservations.stripe_payment_intent  — the deposit-link route SELECTs this,
--       so creating a Stripe deposit link fails before it reaches Stripe.
--   reservations.deposit_paid_at        — the Stripe webhook and the success
--       route both write it, so a deposit that IS paid never marks the
--       reservation confirmed. Payment is taken and nothing records it.
--   customers.full_name, dob, do_not_rent, dnr_reason, updated_at
--                                       — the customers list SELECTs all five,
--       so the page errors and the Do Not Rent flag has never functioned.
--   quotes.pricing_group                — selected but absent.
--
-- Types below are copied from the baseline's own declarations rather than
-- chosen, so the deployed schema ends up matching what was designed.
-- ============================================================================

-- Stripe deposit tracking.
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS stripe_payment_intent text;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS deposit_paid_at       timestamptz;

-- Customer record.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS full_name    text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS dob          date;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS do_not_rent  boolean DEFAULT false;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS dnr_reason   text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS updated_at   timestamptz DEFAULT now();

-- Quote pricing group.
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS pricing_group text;

COMMENT ON COLUMN customers.full_name IS
  'Derived from first_name and last_name, kept for search. Falls back to this when the split fields are empty.';
COMMENT ON COLUMN reservations.deposit_paid_at IS
  'Set by the Stripe webhook on checkout.session.completed. Absent from the deployed schema until migration 010, so deposits paid before then were never recorded.';

-- full_name is a search convenience, so populate it from the split fields that
-- are already present rather than leaving the column empty behind the fallback.
UPDATE customers
SET full_name = NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)), '')
WHERE full_name IS NULL
  AND (first_name IS NOT NULL OR last_name IS NOT NULL);

-- do_not_rent is read as a boolean by the customers list; a NULL there would
-- render as neither flagged nor clear.
UPDATE customers SET do_not_rent = false WHERE do_not_rent IS NULL;

NOTIFY pgrst, 'reload schema';
