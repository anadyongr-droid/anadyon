import { describe, it, expect } from "vitest";
import { db, cleanup, MARK } from "./helpers";

describe("phase 0 — baseline and safety rig", () => {
  it("reaches the live project with a service-role key", async () => {
    const { error } = await db.from("reservations").select("id").limit(1);
    expect(error).toBeNull();
  });

  it("starts from a clean slate (no leftover test rows)", async () => {
    await cleanup();
    const { data } = await db.from("reservations").select("id").ilike("customer_name", `%${MARK}%`);
    expect(data).toEqual([]);
  });

  it("has mail redirection armed, so no office inbox can be hit", async () => {
    expect(process.env.MAIL_REDIRECT_TO).toBe("a.maroudas@gmail.com");
    const { mailIsRedirected } = await import("@/lib/mailer");
    expect(mailIsRedirected).toBe(true);
  });

  it("records the live counts this run must return to", async () => {
    const counts: Record<string, number | null> = {};
    for (const t of ["reservations", "quotes", "customers", "vehicles"]) {
      const { count } = await db.from(t).select("*", { count: "exact", head: true });
      counts[t] = count;
    }
    console.log("  BASELINE", JSON.stringify(counts));
    expect(counts.vehicles).toBeGreaterThan(0);
  });
});
