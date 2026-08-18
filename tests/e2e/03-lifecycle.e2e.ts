import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { db, req, ctx, MARK, TEST_EMAIL, futureDates, cleanup, clockSkewMs } from "./helpers";

const sent: { subject: string; to: string | string[] }[] = [];
vi.mock("@/lib/mailer", () => ({
  sendMail: async (m: { subject: string; to: string | string[] }) => { sent.push(m); return { data: null, error: null }; },
  mailIsRedirected: true,
}));

const { POST } = await import("@/app/api/admin/reservations/route");
const { PATCH, DELETE } = await import("@/app/api/admin/reservations/[id]/route");

let vehicleId = "";
let id = "";
let skew = 0;

async function makeReservation(offset: number, status = "pending") {
  const d = futureDates(offset);
  const res = await POST(req("/api/admin/reservations", "POST", {
    vehicle_id: vehicleId,
    customer_name: `Lifecycle ${MARK}`,
    customer_first_name: "Lifecycle",
    customer_last_name: MARK,
    customer_email: TEST_EMAIL,
    pickup_date: d.pickup_date, return_date: d.return_date,
    pickup_time: "10:00", return_time: "10:00",
    rental_days: 3, daily_rate: 30, vehicle_subtotal: 90, extras_subtotal: 0, total: 90,
    status,
    notes: `Quote ref: LIFECYCLE. ${MARK}`,
  }));
  return (await res.json()).id as string;
}

const move = (to: string, from: string) =>
  PATCH(req(`/api/admin/reservations/${id}`, "PATCH", { status: to, _prev_status: from }), ctx(id));

describe("phase 3 — reservation lifecycle", () => {
  beforeAll(async () => {
    const { data } = await db.from("vehicles").select("id").eq("status", "available").limit(1).single();
    vehicleId = data!.id;
    skew = await clockSkewMs();
    id = await makeReservation(100);
    sent.length = 0;
  });
  afterAll(async () => { await cleanup(); });

  it("pending → confirmed saves and emails the customer", async () => {
    const res = await move("confirmed", "pending");
    expect(res.status).toBe(200);
    const { data } = await db.from("reservations").select("status, updated_at, created_at").eq("id", id).single();
    expect(data!.status).toBe("confirmed");
    // The whole class of bug was a PATCH that returned nothing and changed nothing.
    // Compared in database time; migration 018 removes the need for the offset.
    expect(new Date(data!.updated_at).getTime() + skew).toBeGreaterThanOrEqual(
      new Date(data!.created_at).getTime() - 5
    );
    expect(sent.map((m) => m.subject)).toContain("Your reservation is confirmed — Anadyon Rentals");
  });

  it("confirmed → active tells the customer the vehicle is ready", async () => {
    sent.length = 0;
    expect((await move("active", "confirmed")).status).toBe(200);
    const { data } = await db.from("reservations").select("status").eq("id", id).single();
    expect(data!.status).toBe("active");
    expect(sent.map((m) => m.subject)).toContain("Your vehicle is ready for pick-up — Anadyon Rentals");
  });

  it("active → returned closes the rental quietly", async () => {
    sent.length = 0;
    expect((await move("returned", "active")).status).toBe(200);
    const { data } = await db.from("reservations").select("status").eq("id", id).single();
    expect(data!.status).toBe("returned");
    expect(sent).toHaveLength(0);
  });

  it("refuses a status the schema does not define, as a client error", async () => {
    const res = await move("completed", "returned");
    expect(res.status).toBe(400);
    const { data } = await db.from("reservations").select("status").eq("id", id).single();
    expect(data!.status).toBe("returned");
  });

  it("cancels a confirmed reservation, and does not announce it as a new booking", async () => {
    // Exactly what was reported: cancelling produced "New Reservation" mail to
    // the office and left the reservation showing as confirmed.
    const cancelId = await makeReservation(140, "confirmed");
    sent.length = 0;
    const res = await PATCH(
      req(`/api/admin/reservations/${cancelId}`, "PATCH", { status: "cancelled", _prev_status: "confirmed" }),
      ctx(cancelId)
    );
    expect(res.status).toBe(200);

    const { data } = await db.from("reservations").select("status, updated_at, created_at").eq("id", cancelId).single();
    expect(data!.status).toBe("cancelled");
    // Compared in database time; migration 018 removes the need for the offset.
    expect(new Date(data!.updated_at).getTime() + skew).toBeGreaterThanOrEqual(
      new Date(data!.created_at).getTime() - 5
    );
    expect(sent.some((m) => m.subject.includes("New Reservation"))).toBe(false);
    expect(sent).toHaveLength(0);
  });

  it("frees the vehicle again once cancelled", async () => {
    const d = futureDates(140);
    const res = await POST(req("/api/admin/reservations", "POST", {
      vehicle_id: vehicleId,
      customer_name: `Rebook ${MARK}`, customer_email: TEST_EMAIL,
      pickup_date: d.pickup_date, return_date: d.return_date,
      pickup_time: "10:00", return_time: "10:00",
      rental_days: 3, daily_rate: 30, vehicle_subtotal: 90, extras_subtotal: 0, total: 90,
      status: "pending", notes: `Quote ref: REBOOK. ${MARK}`,
    }));
    expect(res.status).toBe(201);
  });

  it("deletes a reservation outright when asked", async () => {
    const doomed = await makeReservation(200);
    const res = await DELETE(req(`/api/admin/reservations/${doomed}`, "DELETE"), ctx(doomed));
    expect(res.status).toBe(200);
    const { data } = await db.from("reservations").select("id").eq("id", doomed).maybeSingle();
    expect(data).toBeNull();
  });
});
