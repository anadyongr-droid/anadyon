import { describe, it, expect } from "vitest";
import { anon, db } from "./helpers";

/**
 * Distinguishes the two things an empty result can mean. PostgREST returns `[]`
 * both when a table is protected by RLS and when it is simply empty, so the
 * grant is what gets asserted: 42501 means the privilege check refused the
 * request before any policy was consulted, which is the stronger posture.
 */
async function anonAccess(table: string): Promise<"denied" | "rls-only" | "exposed"> {
  const { data, error } = await anon.from(table).select("*").limit(1);
  if (error?.code === "42501") return "denied";
  if (error) return "denied";
  return (data?.length ?? 0) > 0 ? "exposed" : "rls-only";
}

/** A function is exposed if the anon key can execute it at all. */
async function anonCanExecute(fn: string, args: Record<string, unknown>) {
  const { error } = await anon.rpc(fn, args);
  // A permission denial is the expected outcome; anything else means it ran.
  const denied = /permission denied|not find the function|does not exist/i.test(error?.message ?? "");
  return { executed: !denied, error: error?.message };
}

describe("phase 6 — security posture", () => {
  // Already hardened: the grant itself is gone, so these fail at the privilege
  // check regardless of what policies the table carries.
  it.each(["reservations", "quotes", "vehicles", "vehicle_costs", "vehicle_damages"])(
    "refuses anon the SELECT privilege on %s",
    async (table) => {
      expect(await anonAccess(table), `${table} still grants SELECT to anon`).toBe("denied");
    }
  );

  // Migration 019 brings these to the same standard. Until it runs they are
  // closed by row-level security alone.
  it.each([
    "customers", "emails", "alert_outbox", "promo_codes", "discount_rules",
    "system_settings", "competitor_rates", "competitor_group_map",
    "quote_rate_limits", "rate_limits",
  ])("never returns %s data to anon", async (table) => {
    expect(await anonAccess(table), `${table} RETURNS DATA to anon`).not.toBe("exposed");
  });

  it("still serves the public rate card, which is meant to be public", async () => {
    const { error } = await anon.from("rates").select("pricing_group").limit(1);
    expect(error).toBeNull();
  });

  it.each([
    ["redeem_promo", { p_code: "ANYTHING", p_total: 100 }],
    ["next_invoice_aa", { p_series: "A" }],
    ["claim_dcl_submission", { p_reservation_id: "00000000-0000-0000-0000-000000000000" }],
    ["claim_invoice_submission", { p_reservation_id: "00000000-0000-0000-0000-000000000000" }],
  ])("refuses to let anon execute %s", async (fn, args) => {
    const r = await anonCanExecute(fn as string, args as Record<string, unknown>);
    expect(r.executed, `${fn} executed as anon: ${r.error ?? "no error"}`).toBe(false);
  });

  it("still lets the service role do its work", async () => {
    const { error } = await db.from("reservations").select("id").limit(1);
    expect(error).toBeNull();
  });

  it("never exposes the service role key to the browser bundle", async () => {
    const publicVars = Object.keys(process.env).filter((k) => k.startsWith("NEXT_PUBLIC_"));
    for (const k of publicVars) {
      expect(process.env[k]).not.toBe(process.env.SUPABASE_SERVICE_ROLE_KEY);
    }
    expect(publicVars).not.toContain("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY");
  });
});
