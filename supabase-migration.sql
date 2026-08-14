-- ============================================================
-- Anadyon Rentals — Full Schema Migration
-- Run this once in Supabase SQL Editor
-- ============================================================

-- 1. Customers (CRM)
CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text,
  phone text,
  nationality text,
  dob date,
  do_not_rent boolean DEFAULT false,
  dnr_reason text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS customers_email_idx ON customers (lower(email)) WHERE email IS NOT NULL;

-- 2. Promo codes
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

-- 3. Discount rules
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

-- 4. Add columns to reservations
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES customers(id);
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS promo_code_id uuid REFERENCES promo_codes(id);
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS discount_amount numeric DEFAULT 0;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS discount_reason text;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS dcl_status text DEFAULT 'not_submitted';
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS dcl_mark text;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS agreement_signed_at timestamptz;

-- 5. Add columns to quotes
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES customers(id);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS promo_code text;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS discount_amount numeric DEFAULT 0;

-- 6. Enable RLS policies for new tables (service role bypasses RLS automatically)
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE discount_rules ENABLE ROW LEVEL SECURITY;

-- Done!
