import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

export const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export const anon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } }
);

/** Every row this suite creates carries this marker so cleanup can be exact. */
export const MARK = "ZZTEST";
export const TEST_EMAIL = "automated.zztest@example.invalid";

/**
 * Test bookings sit a year out. A date in the live season could collide with a
 * genuine reservation in the overlap check, or worse, make a real vehicle look
 * unavailable to a real customer.
 */
export function futureDates(offsetDays = 0) {
  const start = new Date("2027-06-01T00:00:00Z");
  start.setUTCDate(start.getUTCDate() + offsetDays);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 3);
  return { pickup_date: start.toISOString().slice(0, 10), return_date: end.toISOString().slice(0, 10) };
}

/**
 * Routes read `req.nextUrl` and the forwarding headers, so these have to be
 * NextRequests rather than plain Requests.
 */
export function req(url: string, method: string, body?: unknown, ip = "203.0.113.99") {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": ip,
      "x-vercel-forwarded-for": ip,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
}

export const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

/** Waits for work registered through the test implementation of Next `after`. */
export async function flushAfterTasks() {
  const key = Symbol.for("anadyon.e2e.afterTasks");
  const tasks = (globalThis as typeof globalThis & {
    [key]?: Set<Promise<unknown>>;
  })[key];
  if (!tasks?.size) return;
  await Promise.all([...tasks]);
}

/** Removes every row this suite created, in dependency order. */
export async function cleanup() {
  const { data: res } = await db.from("reservations").select("id").ilike("customer_name", `%${MARK}%`);
  const ids = (res ?? []).map((r) => r.id);
  if (ids.length) {
    await db.from("documents").delete().in("reservation_id", ids);
    await db.from("reservations").delete().in("id", ids);
  }
  await db.from("quotes").delete().ilike("last_name", `%${MARK}%`);
  await db.from("customers").delete().ilike("last_name", `%${MARK}%`);
  await db.from("vehicles").delete().ilike("name", `%${MARK}%`);
  return ids.length;
}

/**
 * The Node process clock and the Postgres clock are not the same clock. Until
 * migration 018 moves the `updated_at` stamp into the database, a row written by
 * the API carries an application timestamp while `created_at` carries a database
 * one, and the two can disagree by tens of milliseconds in either direction.
 *
 * Measuring the offset lets the timestamp assertions stay meaningful now and
 * remain correct once the trigger makes them agree exactly.
 */
export async function clockSkewMs(): Promise<number> {
  const probe = `SKEW-${Date.now()}`;
  const before = Date.now();
  const { data } = await db.from("quotes").insert({ ref: probe, last_name: `Skew ${MARK}` }).select("created_at").single();
  const after = Date.now();
  await db.from("quotes").delete().eq("ref", probe);
  if (!data) return 0;
  const dbTime = new Date(data.created_at).getTime();
  const localMid = (before + after) / 2;
  return dbTime - localMid; // positive when the database clock runs ahead
}
