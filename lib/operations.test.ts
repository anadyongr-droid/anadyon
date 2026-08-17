import { describe, it, expect } from "vitest";
import { findOverdue, licenceStatus, serviceStatus, dayEvents } from "./operations";

const NOW = new Date("2026-08-17T14:00:00");

const res = (o: Partial<Parameters<typeof findOverdue>[0][number]> = {}) => ({
  id: "r1", customer_name: "A. Tester", status: "active",
  pickup_date: "2026-08-14", pickup_time: "09:00",
  return_date: "2026-08-17", return_time: "10:00",
  ...o,
});

describe("overdue returns", () => {
  it("flags an active rental past its return time", () => {
    const out = findOverdue([res()], NOW);
    expect(out).toHaveLength(1);
    expect(out[0].minutesLate).toBe(240);
    expect(out[0].urgency).toBe("warning");
  });

  it("does not flag within the grace period", () => {
    // Due 13:30, now 14:00 — half an hour late, inside the hour's grace.
    expect(findOverdue([res({ return_time: "13:30" })], NOW)).toHaveLength(0);
  });

  it("escalates to critical past a day", () => {
    const out = findOverdue([res({ return_date: "2026-08-15", return_time: "10:00" })], NOW);
    expect(out[0].urgency).toBe("critical");
  });

  it("ignores a confirmed booking whose dates passed — that is a no-show, not a missing car", () => {
    // The distinction matters: lumping them together buries the one vehicle
    // genuinely unaccounted for under bookings that never started.
    expect(findOverdue([res({ status: "confirmed" })], NOW)).toHaveLength(0);
  });

  it.each(["returned", "cancelled", "voided", "no_show"])("ignores %s", (status) => {
    expect(findOverdue([res({ status })], NOW)).toHaveLength(0);
  });

  it("sorts the latest first", () => {
    const out = findOverdue(
      [res({ id: "a", return_time: "12:00" }), res({ id: "b", return_date: "2026-08-15" })],
      NOW
    );
    expect(out.map(o => o.reservation.id)).toEqual(["b", "a"]);
  });
});

describe("driving licence", () => {
  const pickup = new Date("2026-08-20T09:00:00");

  it("blocks a licence that expired before pick-up", () => {
    const s = licenceStatus({ driving_licence_number: "X1", driving_licence_expiry: "2026-08-01" }, pickup);
    expect(s.severity).toBe("expired");
    expect(s.blocks).toBe(true);
    expect(s.message).toMatch(/insurance would not cover/i);
  });

  it("does not block one expiring soon but still valid at pick-up", () => {
    const s = licenceStatus({ driving_licence_number: "X1", driving_licence_expiry: "2026-09-05" }, pickup);
    expect(s.severity).toBe("expiring");
    expect(s.blocks).toBe(false);
  });

  it("treats valid on the day of pick-up as valid", () => {
    const s = licenceStatus({ driving_licence_number: "X1", driving_licence_expiry: "2026-08-20" }, pickup);
    expect(s.blocks).toBe(false);
  });

  it("reports missing rather than blocking when nothing is recorded", () => {
    const s = licenceStatus({}, pickup);
    expect(s.severity).toBe("missing");
    expect(s.blocks).toBe(false);
  });

  it("judges against pick-up, not today", () => {
    // Valid today, lapsed by collection.
    const today = new Date("2026-08-17T00:00:00");
    const later = new Date("2026-10-01T09:00:00");
    const licence = { driving_licence_number: "X1", driving_licence_expiry: "2026-09-01" };
    expect(licenceStatus(licence, today).blocks).toBe(false);
    expect(licenceStatus(licence, later).blocks).toBe(true);
  });
});

describe("service due by distance", () => {
  it("reports overdue past the interval", () => {
    const s = serviceStatus({ odometer_km: 21_000, service_interval_km: 10_000, last_service_km: 10_000 });
    expect(s.severity).toBe("overdue");
    expect(s.kmRemaining).toBe(-1000);
  });

  it("warns within the window", () => {
    const s = serviceStatus({ odometer_km: 19_800, service_interval_km: 10_000, last_service_km: 10_000 });
    expect(s.severity).toBe("due-soon");
    expect(s.kmRemaining).toBe(200);
  });

  it("infers from the interval when no last-service reading exists", () => {
    // 24,500 km on a 10,000 interval → assume serviced at 20,000, due at 30,000.
    const s = serviceStatus({ odometer_km: 24_500, service_interval_km: 10_000 });
    expect(s.kmRemaining).toBe(5_500);
    expect(s.severity).toBe("ok");
  });

  it("is unknown without an odometer or interval", () => {
    expect(serviceStatus({ service_interval_km: 10_000 }).severity).toBe("unknown");
    expect(serviceStatus({ odometer_km: 5_000 }).severity).toBe("unknown");
  });
});

describe("the day's events", () => {
  const today = new Date("2026-08-17T08:00:00");

  it("interleaves collections and returns in clock order", () => {
    // Staff work a clock, not two lists — a 10:00 return followed by a 10:30
    // collection is exactly where a turnaround gets missed.
    const events = dayEvents([
      { id: "a", status: "confirmed", pickup_date: "2026-08-17", pickup_time: "10:30" },
      { id: "b", status: "active", return_date: "2026-08-17", return_time: "10:00" },
      { id: "c", status: "confirmed", pickup_date: "2026-08-17", pickup_time: "09:00" },
    ], today);
    expect(events.map(e => [e.kind, e.reservation.id])).toEqual([
      ["pickup", "c"], ["return", "b"], ["pickup", "a"],
    ]);
  });

  it("omits cancelled and no-show bookings", () => {
    const events = dayEvents([
      { id: "x", status: "cancelled", pickup_date: "2026-08-17", pickup_time: "09:00" },
      { id: "y", status: "no_show", pickup_date: "2026-08-17", pickup_time: "10:00" },
    ], today);
    expect(events).toHaveLength(0);
  });

  it("omits a collection already picked up", () => {
    const events = dayEvents([
      { id: "z", status: "active", pickup_date: "2026-08-17", pickup_time: "09:00" },
    ], today);
    expect(events.filter(e => e.kind === "pickup")).toHaveLength(0);
  });

  it("ignores other days", () => {
    const events = dayEvents([
      { id: "t", status: "confirmed", pickup_date: "2026-08-18", pickup_time: "09:00" },
    ], today);
    expect(events).toHaveLength(0);
  });
});
