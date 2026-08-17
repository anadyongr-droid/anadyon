-- ============================================================================
-- Indexes on foreign keys that had none.
--
-- Supabase's performance advisor flags these because Postgres does not index a
-- foreign key automatically — only the primary key it points at. Every join
-- from a customer to their history, and every reservation lookup by vehicle,
-- was a sequential scan.
--
-- It does not show yet: the tables hold tens of rows, and a scan of 29 vehicles
-- is faster than an index lookup. It shows the season a customer has forty
-- reservations behind them and the Today screen joins across all of it.
--
-- The advisor also reports "unused index" warnings elsewhere. Those are not
-- acted on: the database has had no realistic traffic, so an index appearing
-- unused today says nothing about whether it earns its place in August.
-- ============================================================================

-- Customer history: every one of these is read when a customer record is opened.
CREATE INDEX IF NOT EXISTS reservations_customer_id_idx ON reservations (customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS quotes_customer_id_idx       ON quotes       (customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS emails_customer_id_idx       ON emails       (customer_id) WHERE customer_id IS NOT NULL;

-- The fleet ledger sums a vehicle's reservations; the availability check reads
-- them by vehicle and date together, so that pair is indexed as a pair.
CREATE INDEX IF NOT EXISTS reservations_vehicle_id_idx      ON reservations (vehicle_id);
CREATE INDEX IF NOT EXISTS reservations_vehicle_dates_idx   ON reservations (vehicle_id, pickup_date, return_date);

-- Promo redemption counts usage per code.
CREATE INDEX IF NOT EXISTS reservations_promo_code_id_idx ON reservations (promo_code_id) WHERE promo_code_id IS NOT NULL;

-- The Today screen filters live reservations by date window and status; the
-- partial index keeps cancelled and voided rows out of the index entirely,
-- which is most of the table by the end of a season.
CREATE INDEX IF NOT EXISTS reservations_active_dates_idx
  ON reservations (return_date, pickup_date)
  WHERE status NOT IN ('cancelled', 'voided', 'no_show');

NOTIFY pgrst, 'reload schema';
