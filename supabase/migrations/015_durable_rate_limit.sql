-- ============================================================================
-- Durable, atomic rate limiting.
--
-- lib/rateLimit.ts counted requests in a per-process Map. Vercel Functions run
-- across instances and regions and are recycled between requests, so each cold
-- start began with an empty counter — a caller hitting the quote endpoint hard
-- enough to matter was very likely to be served by a fresh instance each time.
-- The limit therefore existed in code without existing in practice.
--
-- The rate_limits table has been present since the baseline and was never used.
-- It gains a unique key so a single statement can both increment and decide,
-- which matters more than it looks: a read-then-write from two instances at the
-- same moment lets both through, and that is precisely the traffic a limiter
-- exists to stop.
-- ============================================================================

-- Old rows accumulated with no constraint; collapse duplicates before adding one.
DELETE FROM rate_limits a
USING rate_limits b
WHERE a.key = b.key AND a.ctid < b.ctid;

ALTER TABLE rate_limits DROP CONSTRAINT IF EXISTS rate_limits_key_unique;
ALTER TABLE rate_limits ADD CONSTRAINT rate_limits_key_unique UNIQUE (key);

/**
 * Records one request and reports whether it is within the limit.
 *
 * Deliberately NOT SECURITY DEFINER, and granted to service_role only. The
 * whole point of a limiter is that a caller cannot reach it directly, and a
 * definer function open to anon is the exact fault that was just closed on five
 * other functions.
 *
 * The window is a fixed reset rather than a rolling one: simpler to reason
 * about, and the difference only matters to an attacker timing requests to the
 * boundary, who is bounded by twice the limit either way.
 */
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_key text,
  p_limit int,
  p_window_seconds int
) RETURNS TABLE (allowed boolean, current_count int, resets_at timestamptz)
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count int;
  v_start timestamptz;
BEGIN
  INSERT INTO rate_limits (key, window_start, count)
  VALUES (p_key, now(), 1)
  ON CONFLICT (key) DO UPDATE
  SET
    -- One statement decides expiry and increment together, so two instances
    -- arriving at once cannot both read a stale count and both allow.
    count = CASE
      WHEN rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
      THEN 1 ELSE rate_limits.count + 1 END,
    window_start = CASE
      WHEN rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
      THEN now() ELSE rate_limits.window_start END
  RETURNING rate_limits.count, rate_limits.window_start INTO v_count, v_start;

  RETURN QUERY SELECT
    v_count <= p_limit,
    v_count,
    v_start + make_interval(secs => p_window_seconds);
END;
$$;

REVOKE ALL ON FUNCTION check_rate_limit(text, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION check_rate_limit(text, int, int) TO service_role;

-- Housekeeping: rows outside any plausible window are dead weight. Called from
-- the daily cron rather than on every request, so the hot path stays one write.
CREATE OR REPLACE FUNCTION prune_rate_limits() RETURNS int
LANGUAGE sql
SET search_path = public, pg_temp
AS $$
  WITH deleted AS (
    DELETE FROM rate_limits WHERE window_start < now() - interval '24 hours' RETURNING 1
  ) SELECT count(*)::int FROM deleted;
$$;

REVOKE ALL ON FUNCTION prune_rate_limits() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION prune_rate_limits() TO service_role;

NOTIFY pgrst, 'reload schema';
