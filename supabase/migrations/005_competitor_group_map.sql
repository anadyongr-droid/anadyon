-- ============================================================================
-- Maps each competitor's own vehicle category onto our pricing groups.
--
-- Competitors classify differently: Ionian uses plain letters (A, B, C),
-- Motor Club uses ACRISS codes (A-MDMR, B-EDMR). Only a human knows whether
-- their "group C" genuinely competes with our Micra or our i20, so the mapping
-- is stored rather than inferred.
--
-- Keyed on car_group rather than vehicle name: names churn as fleets change,
-- the group code is the stable identifier and covers every car within it.
--
-- pricing_group NULL  = not yet decided
-- pricing_group 'ignore' = deliberately excluded (7-seaters, cabrios, SUVs)
-- ============================================================================

CREATE TABLE IF NOT EXISTS competitor_group_map (
  competitor    text NOT NULL,
  car_group     text NOT NULL,
  pricing_group text,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (competitor, car_group)
);

ALTER TABLE competitor_group_map ENABLE ROW LEVEL SECURITY;
