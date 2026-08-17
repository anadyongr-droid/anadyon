-- ============================================================================
-- Fleet and customer records.
--
-- vehicles held ten columns — enough to rent a car, not enough to run one. A
-- rental fleet is a set of assets with renewal dates, running costs and a
-- margin, and none of that was recorded anywhere. Fleet software tracks the
-- same handful of things across every product: statutory renewal dates,
-- service intervals, odometer, damage history, and cost against revenue.
--
-- Greek equivalents used throughout: KTEO is the roadworthiness test (the MOT),
-- and τέλη κυκλοφορίας is the annual circulation tax, paid in December for the
-- year ahead. Both are per-vehicle statutory dates that carry a fine when
-- missed, which is why they get columns rather than living in notes.
--
-- Two things are deliberately NOT stored:
--
--   Profitability. It is derived — revenue from reservations, costs from
--   vehicle_costs — so a stored figure would be a second source of truth that
--   silently goes stale the moment either side changes.
--
--   Card numbers. See the customers section below.
-- ============================================================================

-- ── Fleet: statutory dates, servicing, acquisition ──────────────────────────

ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS registration_date     date;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS road_tax_paid_until   date;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS kteo_expiry           date;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS insurance_provider    text;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS insurance_policy_no   text;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS insurance_expiry      date;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS last_service_date     date;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS next_service_due      date;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS service_interval_km   integer;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS odometer_km           integer;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS purchase_date         date;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS purchase_price        numeric(10,2);
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS vehicle_notes         text;

COMMENT ON COLUMN vehicles.kteo_expiry IS
  'KTEO roadworthiness certificate expiry. Driving past it is an offence and voids insurance cover.';
COMMENT ON COLUMN vehicles.road_tax_paid_until IS
  'Circulation tax (τέλη κυκλοφορίας) paid through this date. Charged annually, due in December for the following year.';

-- ── Running costs, one row per outlay ───────────────────────────────────────
--
-- Kept as rows rather than as running totals on vehicles so that a figure can
-- be corrected, attributed to a date, and explained. A single "total_costs"
-- column would answer "how much" but never "on what".

CREATE TABLE IF NOT EXISTS vehicle_costs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id  uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  cost_type   text NOT NULL CHECK (cost_type IN
                ('road_tax','insurance','kteo','service','repair','damage','tyres','cleaning','other')),
  amount      numeric(10,2) NOT NULL CHECK (amount >= 0),
  incurred_on date NOT NULL DEFAULT CURRENT_DATE,
  -- Covers the period this outlay buys, so an annual premium can be spread
  -- across the season it actually protects rather than landing in one month.
  period_start date,
  period_end   date,
  supplier    text,
  invoice_ref text,
  notes       text,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vehicle_costs_vehicle_idx ON vehicle_costs (vehicle_id, incurred_on DESC);
CREATE INDEX IF NOT EXISTS vehicle_costs_type_idx    ON vehicle_costs (cost_type);

-- ── Damage log ──────────────────────────────────────────────────────────────
--
-- Separate from costs because a damage has a lifecycle a cost does not: it is
-- noticed, attributed to a rental, charged or absorbed, then repaired. Linking
-- the reservation is what makes it possible to say whether a deposit should
-- have been withheld.

CREATE TABLE IF NOT EXISTS vehicle_damages (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id     uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  -- Nullable: damage is sometimes found on a vehicle sitting idle, with no
  -- rental to attribute it to.
  reservation_id uuid REFERENCES reservations(id) ON DELETE SET NULL,
  reported_on    date NOT NULL DEFAULT CURRENT_DATE,
  description    text NOT NULL,
  severity       text NOT NULL DEFAULT 'minor' CHECK (severity IN ('minor','moderate','major')),
  repair_cost    numeric(10,2) CHECK (repair_cost IS NULL OR repair_cost >= 0),
  charged_to_customer boolean DEFAULT false,
  repaired_on    date,
  photo_url      text,
  notes          text,
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vehicle_damages_vehicle_idx     ON vehicle_damages (vehicle_id, reported_on DESC);
CREATE INDEX IF NOT EXISTS vehicle_damages_open_idx        ON vehicle_damages (vehicle_id) WHERE repaired_on IS NULL;
CREATE INDEX IF NOT EXISTS vehicle_damages_reservation_idx ON vehicle_damages (reservation_id) WHERE reservation_id IS NOT NULL;

-- ── Customers: attribution and card handling ────────────────────────────────

ALTER TABLE customers ADD COLUMN IF NOT EXISTS referral_source text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS referral_detail text;

COMMENT ON COLUMN customers.referral_source IS
  'How the customer found Anadyon. Free text rather than a constrained list so the desk can record what was actually said; the admin form offers the common options.';

-- Card details are NEVER stored. These hold Stripe references only.
--
-- A payment method is created in Stripe's own hosted fields, so the card number
-- reaches Stripe directly and never touches this application, its logs or this
-- database. What is kept is an opaque identifier that authorises a future
-- charge but reveals nothing and is worthless if exfiltrated.
--
-- This is the difference between PCI DSS SAQ-A — the shortest questionnaire,
-- for merchants who never handle card data — and SAQ-D, which is an audit
-- obligation no small rental business should take on. Storing a PAN here would
-- move Anadyon into that category on the day it was written.
--
-- The last four digits and brand are safe to keep: they are not card data under
-- PCI, and staff need something to say on the phone other than an opaque id.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS stripe_customer_id       text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS stripe_payment_method_id text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS card_brand               text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS card_last4               text CHECK (card_last4 IS NULL OR card_last4 ~ '^[0-9]{4}$');
ALTER TABLE customers ADD COLUMN IF NOT EXISTS card_exp_month           smallint CHECK (card_exp_month IS NULL OR card_exp_month BETWEEN 1 AND 12);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS card_exp_year            smallint;

COMMENT ON COLUMN customers.stripe_payment_method_id IS
  'Stripe payment method reference. NEVER store a card number, CVV or full expiry here — the PAN must not touch this database. Brand and last4 only, for staff to identify the card in conversation.';

CREATE INDEX IF NOT EXISTS customers_stripe_idx ON customers (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS customers_referral_idx ON customers (referral_source) WHERE referral_source IS NOT NULL;

NOTIFY pgrst, 'reload schema';
