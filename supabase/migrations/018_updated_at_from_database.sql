-- `updated_at` was stamped by the application using the Node process clock,
-- while `created_at` defaults to the database clock. The two are not the same
-- clock, so a freshly-edited row could carry an `updated_at` a few milliseconds
-- BEFORE its own `created_at` — which is what the end-to-end run observed.
--
-- It also meant any change made outside the API — a fix applied in the SQL
-- editor, a back-fill script — left `updated_at` stale, so the column could not
-- be trusted to answer "when did this row last change".
--
-- Moving the stamp into the database makes it authoritative and unconditional.
-- The application may keep sending the field; this overrides it.

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reservations_set_updated_at ON reservations;
CREATE TRIGGER reservations_set_updated_at
  BEFORE UPDATE ON reservations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS customers_set_updated_at ON customers;
CREATE TRIGGER customers_set_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
