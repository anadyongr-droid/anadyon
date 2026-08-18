import { describe, it, expect } from "vitest";
import { db, anon, cleanup, MARK, futureDates } from "./helpers";

/**
 * Go-live readiness. Each check probes for the effect of a migration rather than
 * for the migration record, so it is true of the database as it actually stands.
 *
 * These are expected to fail until the pending migrations are applied; that is
 * the report, not a defect in the tests.
 */
const results: { item: string; ok: boolean; detail: string }[] = [];

async function record(item: string, probe: () => Promise<{ ok: boolean; detail: string }>) {
  let r: { ok: boolean; detail: string };
  try { r = await probe(); } catch (e) { r = { ok: false, detail: String(e) }; }
  results.push({ item, ...r });
  return r;
}

describe("phase 7 — go-live readiness", () => {
  it("015 — durable rate limiting is installed", async () => {
    const r = await record("015 durable rate limit", async () => {
      const { error } = await db.rpc("check_rate_limit", { p_key: `probe-${MARK}`, p_limit: 1000, p_window_seconds: 60 });
      const missing = /Could not find the function/i.test(error?.message ?? "");
      return { ok: !missing, detail: missing ? "check_rate_limit absent — lib/rateLimit.ts fails open, quote endpoint unthrottled" : "present" };
    });
    expect(r.ok, r.detail).toBe(true);
  });

  it("017 — a customer can be created without the legacy name column", async () => {
    const r = await record("017 customers.name nullable", async () => {
      const probe = await db.from("customers")
        .insert({ first_name: "Ready", last_name: `Probe ${MARK}`, full_name: `Ready Probe ${MARK}` })
        .select("id, name").single();
      if (probe.data) await db.from("customers").delete().eq("id", probe.data.id);
      return {
        ok: !probe.error,
        detail: probe.error ? `blocked — ${probe.error.message}` : `ok, legacy name auto-filled as "${probe.data?.name}"`,
      };
    });
    expect(r.ok, r.detail).toBe(true);
  });

  it("018 — updated_at is stamped by the database", async () => {
    const r = await record("018 updated_at trigger", async () => {
      // Probes a row of its own. An earlier version of this check wrote a stale
      // timestamp onto a real reservation, which had to be repaired by hand.
      const { data: vehicle } = await db.from("vehicles").select("id").limit(1).single();
      if (!vehicle) return { ok: false, detail: "no vehicle available to probe" };
      const d = futureDates(900);
      const { data: made, error: makeErr } = await db.from("reservations").insert({
        vehicle_id: vehicle.id, customer_name: `Readiness ${MARK}`,
        pickup_date: d.pickup_date, return_date: d.return_date,
        pickup_time: "10:00", return_time: "10:00",
        rental_days: 3, daily_rate: 1, vehicle_subtotal: 3, total: 3, deposit: 1, balance_due: 2,
        status: "pending", notes: `Quote ref: READINESS. ${MARK}`,
      }).select("id").single();
      if (makeErr || !made) return { ok: false, detail: `probe row could not be created — ${makeErr?.message}` };

      // A deliberately wrong timestamp: the trigger must overwrite it.
      const { data: patched } = await db.from("reservations")
        .update({ updated_at: "2000-01-01T00:00:00.000Z" })
        .eq("id", made.id).select("updated_at").single();
      await db.from("reservations").delete().eq("id", made.id);

      const overridden = patched?.updated_at !== undefined && new Date(patched.updated_at).getFullYear() > 2020;
      return { ok: overridden, detail: overridden ? "trigger overrides client value" : "client value accepted verbatim — timestamps can precede created_at" };
    });
    expect(r.ok, r.detail).toBe(true);
  });

  it("019 — anon holds no SELECT grant on the internal tables", async () => {
    const r = await record("019 residual anon grants", async () => {
      const still: string[] = [];
      for (const t of ["customers", "emails", "alert_outbox", "promo_codes", "discount_rules",
                       "system_settings", "competitor_rates", "competitor_group_map",
                       "quote_rate_limits", "rate_limits"]) {
        const { error } = await anon.from(t).select("*").limit(1);
        if (error?.code !== "42501") still.push(t);
      }
      return { ok: still.length === 0, detail: still.length ? `still granted to anon: ${still.join(", ")}` : "all revoked" };
    });
    expect(r.ok, r.detail).toBe(true);
  });

  it("leaves no test data behind", async () => {
    const removed = await cleanup();
    for (const t of ["reservations", "quotes", "customers", "vehicles"] as const) {
      const col = t === "reservations" ? "customer_name" : t === "vehicles" ? "name" : "last_name";
      const { data } = await db.from(t).select("id").ilike(col, `%${MARK}%`);
      expect(data, `${t} still holds test rows`).toEqual([]);
    }
    console.log(`\n  cleaned ${removed} test reservation(s)`);
    console.table(results);
  });
});
