import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { db, req, ctx, MARK, TEST_EMAIL, futureDates, cleanup } from "./helpers";

const sent: { subject: string; to: string | string[] }[] = [];
vi.mock("@/lib/mailer", () => ({
  sendMail: async (m: { subject: string; to: string | string[] }) => { sent.push(m); return { data: null, error: null }; },
  mailIsRedirected: true,
}));

const { POST } = await import("@/app/api/admin/reservations/route");
const { PATCH, GET } = await import("@/app/api/admin/reservations/[id]/route");

let vehicleId = "";
const d = futureDates(10);

const booking = (over: Record<string, unknown> = {}) => ({
  vehicle_id: vehicleId,
  customer_name: `Conversion ${MARK}`,
  customer_first_name: "Conversion",
  customer_last_name: MARK,
  customer_email: TEST_EMAIL,
  customer_phone: "+306900000001",
  pickup_date: d.pickup_date,
  return_date: d.return_date,
  pickup_time: "10:00",
  return_time: "10:00",
  pickup_location: "Anadyon Office",
  dropoff_location: "Anadyon Office",
  rental_days: 3,
  daily_rate: 30,
  vehicle_subtotal: 90,
  extras_subtotal: 0,
  total: 90,
  status: "pending",
  notes: `Quote ref: TESTREF. ${MARK}`,
  ...over,
});

describe("phase 2 — quote to reservation conversion", () => {
  beforeAll(async () => {
    const { data } = await db.from("vehicles").select("id").eq("status", "available").limit(1).single();
    vehicleId = data!.id;
    sent.length = 0;
  });
  afterAll(async () => { await cleanup(); });

  it("creates a reservation and alerts the office once", async () => {
    const res = await POST(req("/api/admin/reservations", "POST", booking()));
    expect(res.status).toBe(201);
    const row = await res.json();
    expect(row.id).toBeTruthy();
    expect(sent.filter((m) => m.subject.includes("New Reservation"))).toHaveLength(1);
  });

  it("derives deposit and balance on the server, not from the client", async () => {
    sent.length = 0;
    const res = await POST(req("/api/admin/reservations", "POST",
      booking({ total: 200, deposit: 1, balance_due: 1, pickup_date: futureDates(20).pickup_date, return_date: futureDates(20).return_date })));
    const row = await res.json();
    expect(row.deposit).toBeCloseTo(60, 2);
    expect(row.balance_due).toBeCloseTo(140, 2);
  });

  it("edits an existing reservation instead of creating a second one", async () => {
    // The reported fault: a converted quote re-opened, saved, and silently
    // duplicated because the form was handed no reservation id.
    sent.length = 0;
    const dd = futureDates(30);
    const created = await (await POST(req("/api/admin/reservations", "POST",
      booking({ pickup_date: dd.pickup_date, return_date: dd.return_date })))).json();

    const before = await db.from("reservations").select("id").ilike("customer_name", `%${MARK}%`);
    sent.length = 0;

    const patched = await PATCH(
      req(`/api/admin/reservations/${created.id}`, "PATCH", { status: "confirmed", _prev_status: "pending" }),
      ctx(created.id)
    );
    expect(patched.status).toBe(200);

    const after = await db.from("reservations").select("id").ilike("customer_name", `%${MARK}%`);
    expect(after.data!.length).toBe(before.data!.length);
    expect(sent.some((m) => m.subject.includes("New Reservation"))).toBe(false);
  });

  it("carries the quote reference into the reservation notes so the two stay linked", async () => {
    const { data } = await db.from("reservations").select("notes").ilike("customer_name", `%${MARK}%`).limit(1).single();
    expect(data!.notes).toContain("Quote ref:");
  });

  it("reads a reservation back with its vehicle joined", async () => {
    const { data } = await db.from("reservations").select("id").ilike("customer_name", `%${MARK}%`).limit(1).single();
    const res = await GET(req(`/api/admin/reservations/${data!.id}`, "GET"), ctx(data!.id));
    const row = await res.json();
    expect(res.status).toBe(200);
    expect(row.vehicles?.name).toBeTruthy();
  });
});
