-- ============================================================================
-- Competitor rate observations.
--
-- Stores what competitors quote, exactly as they report it. Their own category
-- code (car_group, e.g. "A", "B", "C") is kept verbatim; the mapping onto our
-- pricing_group is deliberately left NULL until a human decides which of their
-- vehicles genuinely competes with ours. Guessing that mapping would produce a
-- comparison that looks authoritative and is quietly wrong.
--
-- Admin-only: no anon policy. All access is server-side via the service role.
-- ============================================================================

CREATE TABLE IF NOT EXISTS competitor_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  competitor        text NOT NULL,           -- slug, e.g. 'ionianrentals'
  competitor_label  text NOT NULL,           -- display name
  source            text NOT NULL DEFAULT 'ezcar',

  -- What was searched
  pickup_date       date NOT NULL,
  return_date       date NOT NULL,
  duration_days     int  NOT NULL,
  duration_band     text NOT NULL,           -- '1_2' | '3_6' | '7plus'
  pickup_location   text,

  -- What they returned, verbatim
  vehicle_name      text NOT NULL,
  manufacturer      text,
  car_group         text,                    -- competitor's own category code
  transmission      text,
  category          text,

  -- Prices as quoted
  price_per_day     numeric,
  total_price       numeric,
  original_price    numeric,                 -- pre-discount, when shown
  currency          text NOT NULL DEFAULT 'EUR',

  -- Our mapping, assigned later via the mapping screen
  pricing_group     text,

  scraped_at        timestamptz NOT NULL DEFAULT now(),

  -- Re-scraping the same search must update in place, not duplicate
  UNIQUE (competitor, pickup_date, duration_days, vehicle_name)
);

CREATE INDEX IF NOT EXISTS competitor_rates_lookup_idx
  ON competitor_rates (competitor, pickup_date, duration_band);
CREATE INDEX IF NOT EXISTS competitor_rates_group_idx
  ON competitor_rates (pricing_group, duration_band);

ALTER TABLE competitor_rates ENABLE ROW LEVEL SECURITY;
