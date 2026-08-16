-- ============================================================
-- Anadyon Rentals — Migration 001: Full baseline
-- Run once in Supabase SQL Editor
-- ============================================================

-- ─── Core tables ─────────────────────────────────────────────

-- promo_codes must be created BEFORE reservations due to the FK reference
CREATE TABLE IF NOT EXISTS promo_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  description text,
  type text NOT NULL DEFAULT 'percentage' CHECK (type IN ('percentage','fixed')),
  value numeric NOT NULL,
  max_uses integer,
  used_count integer DEFAULT 0,
  expires_at date,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('car','motorbike','bike')),
  pricing_group text NOT NULL CHECK (pricing_group IN ('car_a','car_b','motorbike_a','motorbike_b','bike')),
  plate text,
  make text,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available','maintenance','retired')),
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text DEFAULT 'Mr',
  first_name text,
  last_name text,
  full_name text,         -- derived: first_name || ' ' || last_name, kept for search
  email text,
  phone text,
  phone_alt text,
  nationality text,
  dob date,
  address text,
  city text,
  postal_code text,
  country text,
  passport_number text,
  passport_expiry date,
  driving_licence_number text,
  driving_licence_expiry date,
  driving_licence_country text,
  emergency_contact_name text,
  emergency_contact_phone text,
  preferred_vehicle_category text,
  vat_number text,
  do_not_rent boolean DEFAULT false,
  dnr_reason text,
  notes text,
  last_interaction_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS customers_email_idx ON customers (lower(email)) WHERE email IS NOT NULL;

-- reservations.vehicle_id is nullable: website quotes create pending rows without a vehicle assigned
CREATE TABLE IF NOT EXISTS reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid REFERENCES vehicles(id),            -- NULL for unassigned website quotes
  customer_id uuid REFERENCES customers(id),
  customer_name text NOT NULL,
  customer_first_name text,
  customer_last_name text,
  customer_email text,
  customer_phone text,
  customer_nationality text,
  pickup_date date NOT NULL,
  pickup_time text NOT NULL DEFAULT '09:00',
  return_date date NOT NULL,
  return_time text NOT NULL DEFAULT '09:00',
  pickup_location text,
  dropoff_location text,
  rental_days int NOT NULL,
  daily_rate numeric(10,2) NOT NULL,
  vehicle_subtotal numeric(10,2) NOT NULL,
  gps boolean DEFAULT false,
  baby_seat int DEFAULT 0,
  child_seat int DEFAULT 0,
  fdw boolean DEFAULT false,
  additional_drivers int DEFAULT 0,
  extras_subtotal numeric(10,2) DEFAULT 0,
  total numeric(10,2) NOT NULL,
  deposit numeric(10,2) NOT NULL,
  balance_due numeric(10,2) NOT NULL,
  promo_code_id uuid REFERENCES promo_codes(id),
  discount_amount numeric DEFAULT 0,
  discount_reason text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','active','returned','cancelled','no_show','voided')),
  source text DEFAULT 'admin' CHECK (source IN ('admin','website')),
  notes text,
  -- AADE
  dcl_status text DEFAULT 'not_submitted',
  dcl_mark text,
  -- myDATA invoicing
  invoice_status text DEFAULT 'not_issued',
  invoice_mark text,
  invoice_uid text,
  invoice_auth text,
  invoice_series text,
  invoice_aa integer,
  -- payments
  stripe_payment_intent text,
  deposit_paid_at timestamptz,
  agreement_signed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Unique guard: prevent duplicate AADE invoice submissions
CREATE UNIQUE INDEX IF NOT EXISTS reservations_invoice_mark_idx ON reservations (invoice_mark) WHERE invoice_mark IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS reservations_dcl_mark_idx ON reservations (dcl_mark) WHERE dcl_mark IS NOT NULL;
-- Invoice series/aa uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS reservations_invoice_aa_idx ON reservations (invoice_series, invoice_aa) WHERE invoice_series IS NOT NULL;

CREATE TABLE IF NOT EXISTS quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref text UNIQUE NOT NULL,
  title text,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text NOT NULL,
  mobile_tel text,
  landline_tel text,
  dob text,
  address text,
  postal_code text,
  city text,
  country text,
  vehicle_type text NOT NULL,
  selected_model text,
  pricing_group text,
  pickup_location text,
  dropoff_location text,
  pickup_date date NOT NULL,
  pickup_time text,
  dropoff_date date NOT NULL,
  dropoff_time text,
  driver_age text,
  transmission text,
  baby_seat int DEFAULT 0,
  child_seat int DEFAULT 0,
  fdw boolean DEFAULT false,
  additional_drivers int DEFAULT 0,
  rental_days int,
  daily_rate numeric(10,2),
  vehicle_subtotal numeric(10,2),
  extras_subtotal numeric(10,2),
  total numeric(10,2),
  deposit numeric(10,2),
  balance_due numeric(10,2),
  promo_code text,
  discount_amount numeric DEFAULT 0,
  comments text,
  customer_id uuid REFERENCES customers(id),
  expires_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pricing_group text NOT NULL CHECK (pricing_group IN ('car_a','car_b','motorbike_a','motorbike_b','bike')),
  season_name text NOT NULL,
  season_months int[] NOT NULL,
  rate_1_2 numeric(10,2) NOT NULL,
  rate_3_6 numeric(10,2) NOT NULL,
  rate_7plus numeric(10,2) NOT NULL,
  updated_at timestamptz DEFAULT now(),
  UNIQUE (pricing_group, season_name)
);

CREATE TABLE IF NOT EXISTS extras_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  daily_rate numeric(10,2) NOT NULL,
  enabled boolean DEFAULT true,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS discount_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('early_bird','min_stay','full_payment','age_surcharge')),
  threshold integer NOT NULL,
  discount_type text NOT NULL CHECK (discount_type IN ('percentage','fixed','surcharge')),
  value numeric NOT NULL,
  pricing_group text,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- ─── Email Intelligence ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gmail_message_id text UNIQUE NOT NULL,
  gmail_thread_id text NOT NULL,
  sender_name text,
  sender_email text NOT NULL,
  subject text,
  body_text text,
  received_at timestamptz NOT NULL,
  -- Claude classification
  category text,    -- Reservation, Cancellation, General, Internal
  greek_summary text,
  urgency int,       -- 1=low 2=medium 3=high (immediate alert)
  reservation_date text,
  suggested_action text,
  -- Thread state
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','replied','closed','spam')),
  customer_id uuid REFERENCES customers(id),
  alerted boolean DEFAULT false,
  -- Meta
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS emails_thread_idx ON emails (gmail_thread_id);
CREATE INDEX IF NOT EXISTS emails_status_idx ON emails (status, received_at);
CREATE INDEX IF NOT EXISTS emails_urgency_idx ON emails (urgency, status);

-- Alert outbox — ensures each alert fires exactly once
CREATE TABLE IF NOT EXISTS alert_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,   -- e.g. "watchdog:thread:GMAIL_THREAD_ID" or "briefing:2026-08-15"
  payload text NOT NULL,
  sent_at timestamptz,
  error text,
  created_at timestamptz DEFAULT now()
);

-- System settings — stores Gmail OAuth tokens etc.
CREATE TABLE IF NOT EXISTS system_settings (
  key text PRIMARY KEY,
  value text,
  updated_at timestamptz DEFAULT now()
);

-- Rate limits (simple sliding window per IP)
CREATE TABLE IF NOT EXISTS rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  window_start timestamptz NOT NULL DEFAULT now(),
  count int NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS rate_limits_key_idx ON rate_limits (key, window_start);

-- Progressive lockout for public quote lookups (/api/quote/[ref]).
-- Created by hand in production before this baseline existed; recorded here so
-- a rebuild from migrations does not silently disable the lockout.
CREATE TABLE IF NOT EXISTS quote_rate_limits (
  ip text PRIMARY KEY,
  fail_count int NOT NULL DEFAULT 0,
  blocked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS quote_rate_limits_blocked_idx ON quote_rate_limits (blocked_until);

-- ─── RLS — enable on all tables ──────────────────────────────

ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE extras_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE discount_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS automatically — all admin API routes use service role.
-- Anon role gets minimal read access for the public website only.

-- Public website needs: rates, extras_config, vehicles (availability check)
CREATE POLICY "public_read_rates" ON rates FOR SELECT TO anon USING (true);
CREATE POLICY "public_read_extras" ON extras_config FOR SELECT TO anon USING (true);
CREATE POLICY "public_read_vehicles" ON vehicles FOR SELECT TO anon USING (status = 'available');

-- Quotes: anon can insert (website form) and read their own by ref (public quote page)
CREATE POLICY "public_insert_quotes" ON quotes FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "public_read_quotes_by_ref" ON quotes FOR SELECT TO anon USING (true);

-- Reservations: anon can insert (website quote creates pending row) and read for conflict check
CREATE POLICY "public_insert_reservations" ON reservations FOR INSERT TO anon WITH CHECK (source = 'website');
CREATE POLICY "public_read_reservations_availability" ON reservations FOR SELECT TO anon
  USING (status NOT IN ('cancelled','voided','no_show'));

-- Promo codes: anon can read to validate
CREATE POLICY "public_read_promo_codes" ON promo_codes FOR SELECT TO anon USING (active = true);

-- Rate limits: anon can insert/update for rate limiting
CREATE POLICY "public_rate_limits" ON rate_limits FOR ALL TO anon USING (true) WITH CHECK (true);

-- ─── Atomic DB functions ──────────────────────────────────────

-- Atomically checks vehicle availability and creates a reservation in one transaction.
-- Returns the new reservation id, or raises an exception if there's a conflict.
CREATE OR REPLACE FUNCTION book_vehicle(
  p_vehicle_id uuid,
  p_pickup_date date,
  p_return_date date,
  p_data jsonb,
  p_exclude_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_conflict_id uuid;
  v_new_id uuid;
BEGIN
  -- Lock the vehicle row to prevent concurrent bookings
  PERFORM id FROM vehicles WHERE id = p_vehicle_id FOR UPDATE;

  -- Check for overlapping reservations
  SELECT id INTO v_conflict_id
  FROM reservations
  WHERE vehicle_id = p_vehicle_id
    AND status NOT IN ('cancelled','voided','no_show')
    AND pickup_date < p_return_date
    AND return_date > p_pickup_date
    AND (p_exclude_id IS NULL OR id != p_exclude_id)
  LIMIT 1;

  IF v_conflict_id IS NOT NULL THEN
    RAISE EXCEPTION 'CONFLICT:vehicle already booked for those dates';
  END IF;

  INSERT INTO reservations
  SELECT gen_random_uuid(), (p_data->>'vehicle_id')::uuid, (p_data->>'customer_id')::uuid,
    p_data->>'customer_name', p_data->>'customer_first_name', p_data->>'customer_last_name',
    p_data->>'customer_email', p_data->>'customer_phone', p_data->>'customer_nationality',
    (p_data->>'pickup_date')::date, p_data->>'pickup_time', (p_data->>'return_date')::date,
    p_data->>'return_time', p_data->>'pickup_location', p_data->>'dropoff_location',
    (p_data->>'rental_days')::int, (p_data->>'daily_rate')::numeric,
    (p_data->>'vehicle_subtotal')::numeric,
    (p_data->>'gps')::boolean, (p_data->>'baby_seat')::int, (p_data->>'child_seat')::int,
    (p_data->>'fdw')::boolean, (p_data->>'additional_drivers')::int,
    (p_data->>'extras_subtotal')::numeric, (p_data->>'total')::numeric,
    (p_data->>'deposit')::numeric, (p_data->>'balance_due')::numeric,
    (p_data->>'promo_code_id')::uuid,
    COALESCE((p_data->>'discount_amount')::numeric, 0), p_data->>'discount_reason',
    COALESCE(p_data->>'status', 'pending'), COALESCE(p_data->>'source', 'admin'),
    p_data->>'notes', 'not_submitted', NULL, 'not_issued', NULL, NULL, NULL, NULL, NULL,
    NULL, NULL, NULL, now(), now()
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

-- Atomically redeems a promo code: validates, increments used_count, returns discount.
-- Raises exception if invalid/expired/exhausted.
CREATE OR REPLACE FUNCTION redeem_promo(
  p_code text,
  p_total numeric
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_promo promo_codes%ROWTYPE;
  v_discount numeric;
BEGIN
  SELECT * INTO v_promo
  FROM promo_codes
  WHERE active = true AND lower(code) = lower(trim(p_code))
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROMO_INVALID:Invalid or expired promo code';
  END IF;

  IF v_promo.expires_at IS NOT NULL AND v_promo.expires_at < CURRENT_DATE THEN
    RAISE EXCEPTION 'PROMO_EXPIRED:This promo code has expired';
  END IF;

  IF v_promo.max_uses IS NOT NULL AND v_promo.used_count >= v_promo.max_uses THEN
    RAISE EXCEPTION 'PROMO_EXHAUSTED:This promo code has reached its usage limit';
  END IF;

  UPDATE promo_codes SET used_count = used_count + 1 WHERE id = v_promo.id;

  v_discount := CASE
    WHEN v_promo.type = 'percentage' THEN round((p_total * v_promo.value / 100)::numeric, 2)
    ELSE round(v_promo.value::numeric, 2)
  END;

  RETURN jsonb_build_object(
    'id', v_promo.id,
    'code', v_promo.code,
    'discount_amount', v_discount,
    'discount_type', v_promo.type,
    'value', v_promo.value,
    'description', v_promo.description
  );
END;
$$;

-- Returns the next available invoice serial number for a given series, with a lock.
CREATE OR REPLACE FUNCTION next_invoice_aa(p_series text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_next int;
BEGIN
  -- Lock all rows with this series to prevent concurrent numbering
  PERFORM id FROM reservations WHERE invoice_series = p_series FOR UPDATE;

  SELECT COALESCE(MAX(invoice_aa), 0) + 1
  INTO v_next
  FROM reservations
  WHERE invoice_series = p_series AND invoice_mark IS NOT NULL;

  RETURN v_next;
END;
$$;

-- ─── Idempotency guards ───────────────────────────────────────

-- Marks a reservation as "dcl_submitting" atomically; returns false if already submitted/in-progress.
CREATE OR REPLACE FUNCTION claim_dcl_submission(p_reservation_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_status text;
BEGIN
  SELECT dcl_status INTO v_status FROM reservations WHERE id = p_reservation_id FOR UPDATE;
  IF v_status IN ('submitted','submitting') THEN
    RETURN false;
  END IF;
  UPDATE reservations SET dcl_status = 'submitting' WHERE id = p_reservation_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION claim_invoice_submission(p_reservation_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_status text;
BEGIN
  SELECT invoice_status INTO v_status FROM reservations WHERE id = p_reservation_id FOR UPDATE;
  IF v_status IN ('issued','issuing') THEN
    RETURN false;
  END IF;
  UPDATE reservations SET invoice_status = 'issuing' WHERE id = p_reservation_id;
  RETURN true;
END;
$$;

-- ─── Supabase Storage — reservation-documents ─────────────────
-- Create this bucket manually in the Supabase dashboard:
--   Name: reservation-documents
--   Public: false
-- Then add this Storage policy via the dashboard or SQL:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('reservation-documents', 'reservation-documents', false)
--   ON CONFLICT DO NOTHING;
