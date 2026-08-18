-- The live `customers` table carries a legacy `name text NOT NULL` column that
-- predates the migration files: 001_baseline.sql defines the table with
-- first_name / last_name / full_name and no `name` at all, and CREATE TABLE IF
-- NOT EXISTS left the older hand-made table untouched.
--
-- Nothing in the application writes `name`, so the constraint rejected every
-- insert. The customers table is empty as a result — not because no customer has
-- ever been recorded, but because recording one has never once succeeded.
--
-- The constraint is dropped rather than the column, so no data is destroyed and
-- the change is reversible. `name` is now unused and can be dropped in a later
-- migration once that is confirmed against any external consumer.

ALTER TABLE customers ALTER COLUMN name DROP NOT NULL;

-- Keeps the legacy column meaningful for anything reading the table directly
-- (a dashboard query, an export) without the application having to know it exists.
CREATE OR REPLACE FUNCTION customers_sync_legacy_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.name IS NULL THEN
    NEW.name := NULLIF(TRIM(COALESCE(NEW.full_name,
                  CONCAT_WS(' ', NEW.first_name, NEW.last_name))), '');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS customers_sync_legacy_name_trg ON customers;
CREATE TRIGGER customers_sync_legacy_name_trg
  BEFORE INSERT OR UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION customers_sync_legacy_name();

COMMENT ON COLUMN customers.name IS
  'Legacy. Superseded by full_name; kept nullable and auto-filled by trigger. Do not write from application code.';
