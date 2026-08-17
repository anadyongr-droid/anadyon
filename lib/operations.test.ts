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

describe("driving licence — measured against the RETURN, not the pick-up", () => {
  const licence = (expiry: string) => ({ driving_licence_number: "X1", driving_licence_expiry: expiry });
  const returnOn = (d: string) => new Date(`${d}T10:00:00`);

  it("REGRESSION: blocks a licence valid at pick-up but expired by the return", () => {
    // The whole point. Collect on the 20th, return on the 27th, licence dies on
    // the 24th — legal on day one, uninsured for the last three days. The
    // earlier version checked pick-up only and waved this through.
    const s = licenceStatus(licence("2026-08-24"), returnOn("2026-08-27"));
    expect(s.blocks).toBe(true);
    expect(s.severity).toBe("expires-during");
    expect(s.message).toMatch(/uninsured for part of the rental/i);
  });

  it("blocks when the licence expires on the very day of return", () => {
    // No margin at all: an afternoon's delay puts them on the road unlicensed.
    const s = licenceStatus(licence("2026-08-27"), returnOn("2026-08-27"));
    expect(s.blocks).toBe(true);
    expect(s.daysAfterReturn).toBe(0);
    expect(s.message).toMatch(/late return/i);
  });

  it("warns but does not block inside the buffer", () => {
    // Covers the rental as booked, so it is not refused — but it cannot absorb
    // an extension, which is the common request.
    const s = licenceStatus(licence("2026-08-30"), returnOn("2026-08-27"));
    expect(s.severity).toBe("tight");
    expect(s.blocks).toBe(false);
    expect(s.daysAfterReturn).toBe(3);
    expect(s.message).toMatch(/cannot be extended/i);
  });

  it("passes with clear margin beyond the buffer", () => {
    const s = licenceStatus(licence("2027-05-01"), returnOn("2026-08-27"));
    expect(s.severity).toBe("ok");
    expect(s.blocks).toBe(false);
  });

  it("takes the buffer as a parameter", () => {
    // Same licence, same rental, different appetite for risk.
    const l = licence("2026-09-03"); // 7 days after a 27 Aug return
    expect(licenceStatus(l, returnOn("2026-08-27"), 7).severity).toBe("tight");
    expect(licenceStatus(l, returnOn("2026-08-27"), 3).severity).toBe("ok");
    expect(licenceStatus(l, returnOn("2026-08-27"), 30).severity).toBe("tight");
  });

  it("reports missing rather than blocking when nothing is recorded", () => {
    const s = licenceStatus({}, returnOn("2026-08-27"));
    expect(s.severity).toBe("missing");
    expect(s.blocks).toBe(false);
  });

  it("reports missing when a number is held but no expiry", () => {
    const s = licenceStatus({ driving_licence_number: "X1" }, returnOn("2026-08-27"));
    expect(s.severity).toBe("missing");
    expect(s.blocks).toBe(false);
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
