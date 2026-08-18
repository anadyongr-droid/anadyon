import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { db, req, MARK, TEST_EMAIL, futureDates, cleanup } from "./helpers";

vi.mock("@/lib/mailer", () => ({
  sendMail: async () => ({ data: null, error: null }),
  mailIsRedirected: true,
}));

const { POST } = await import("@/app/api/admin/reservations/route");
const { GET: availability } = await import("@/app/api/admin/vehicles/availability/route");

let carId = "";
const d = futureDates(300);

const check = async (q: Record<string, string>) => {
  const qs = new URLSearchParams(q).toString();
  return (await availability(req(`/api/admin/vehicles/availability?${qs}`, "GET"))).json();
};

async function makeVehicle(over: Record<string, unknown>) {
  const { data, error } = await db.from("vehicles").insert({
    name: `Guard Car ${MARK} ${Math.random().toString(36).slice(2, 7)}`,
    category: "car", pricing_group: "car_a", status: "available",
    transmission: "Manual", turnaround_minutes: 120, ...over,
  }).select("id").single();
  expect(error, `vehicle fixture failed: ${error?.message}`).toBeNull();
  return data!.id as string;
}

describe("phase 4 — booking guards", () => {
  beforeAll(async () => {
    await cleanup();
    carId = await makeVehicle({});
    // One rental in the way, 10:00 → 10:00.
    const { error } = await db.from("reservations").insert({
      vehicle_id: carId, customer_name: `Blocker ${MARK}`, customer_email: TEST_EMAIL,
      pickup_date: d.pickup_date, return_date: d.return_date,
      pickup_time: "10:00", return_time: "10:00",
      rental_days: 3, daily_rate: 30, vehicle_subtotal: 90, total: 90, deposit: 27, balance_due: 63,
      status: "confirmed", notes: `Quote ref: GUARD. ${MARK}`,
    });
    expect(error, `blocker fixture failed: ${error?.message}`).toBeNull();
  });
  afterAll(async () => { await cleanup(); });

  it("reports an outright double-booking", async () => {
    const r = await check({ vehicle_id: carId, pickup_date: d.pickup_date, return_date: d.return_date, pickup_time: "10:00", return_time: "10:00" });
    expect(r.available).toBe(false);
    expect(r.conflict.reason).toBe("overlap");
  });

  it("blocks a same-day handover that ignores the turnaround window", async () => {
    // Returned 10:00, wanted 11:00, 120 minutes to prepare — not ready until 12:00.
    const r = await check({ vehicle_id: carId, pickup_date: d.return_date, return_date: futureDates(305).return_date, pickup_time: "11:00", return_time: "10:00" });
    expect(r.available).toBe(false);
    expect(r.conflict.reason).toBe("turnaround");
    expect(r.conflict.turnaround_minutes).toBe(120);
  });

  it("allows the handover once the turnaround has elapsed", async () => {
    const r = await check({ vehicle_id: carId, pickup_date: d.return_date, return_date: futureDates(305).return_date, pickup_time: "12:00", return_time: "10:00" });
    expect(r.available).toBe(true);
  });

  it("bars a vehicle whose KTEO has lapsed by the pick-up date", async () => {
    const expired = await makeVehicle({ kteo_expiry: "2027-01-01" });
    const r = await check({ vehicle_id: expired, pickup_date: d.pickup_date, return_date: d.return_date, pickup_time: "10:00", return_time: "10:00" });
    expect(r.available).toBe(false);
    expect(r.conflict.reason).toBe("statutory");
    expect(r.conflict.message).toMatch(/KTEO/i);
  });

  it("bars a vehicle whose insurance has lapsed by the pick-up date", async () => {
    const uninsured = await makeVehicle({ insurance_expiry: "2027-01-01" });
    const r = await check({ vehicle_id: uninsured, pickup_date: d.pickup_date, return_date: d.return_date, pickup_time: "10:00", return_time: "10:00" });
    expect(r.available).toBe(false);
    expect(r.conflict.message).toMatch(/insur/i);
  });

  it("bars a vehicle that is off the road", async () => {
    const offRoad = await makeVehicle({ status: "maintenance" });
    const r = await check({ vehicle_id: offRoad, pickup_date: d.pickup_date, return_date: d.return_date, pickup_time: "10:00", return_time: "10:00" });
    expect(r.available).toBe(false);
    expect(r.conflict.reason).toBe("statutory");
  });

  it("refuses to save a reservation that double-books a vehicle", async () => {
    const res = await POST(req("/api/admin/reservations", "POST", {
      vehicle_id: carId, customer_name: `Clash ${MARK}`, customer_email: TEST_EMAIL,
      pickup_date: d.pickup_date, return_date: d.return_date, pickup_time: "10:00", return_time: "10:00",
      rental_days: 3, daily_rate: 30, vehicle_subtotal: 90, extras_subtotal: 0, total: 90,
      status: "pending", notes: `Quote ref: CLASH. ${MARK}`,
    }));
    expect(res.status).toBe(409);
  });

  it("does not stop a cancelled rental from being replaced", async () => {
    const gap = futureDates(400);
    await db.from("reservations").insert({
      vehicle_id: carId, customer_name: `Dead ${MARK}`, customer_email: TEST_EMAIL,
      pickup_date: gap.pickup_date, return_date: gap.return_date, pickup_time: "10:00", return_time: "10:00",
      rental_days: 3, daily_rate: 30, vehicle_subtotal: 90, total: 90, deposit: 27, balance_due: 63,
      status: "cancelled", notes: `Quote ref: DEAD. ${MARK}`,
    });
    const r = await check({ vehicle_id: carId, pickup_date: gap.pickup_date, return_date: gap.return_date, pickup_time: "10:00", return_time: "10:00" });
    expect(r.available).toBe(true);
  });
});
