/**
 * The operational day: what is happening, what is late, and what is missing.
 *
 * Built to answer one question for a seasonal employee — *what do I need to do
 * now, and what is wrong?* — without them having to hold the calendar, the
 * inbox, the fleet paperwork and the customer records in their head at once.
 *
 * Everything here is derived. Nothing is stored, so nothing can go stale.
 */

export type Urgency = "critical" | "warning" | "info";

// ── Overdue returns ─────────────────────────────────────────────────────────

export interface ReservationLike {
  id: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
  customer_dob?: string | null;
  customer_id?: string | null;
  status?: string | null;
  pickup_date?: string | null;
  pickup_time?: string | null;
  return_date?: string | null;
  return_time?: string | null;
  pickup_location?: string | null;
  dropoff_location?: string | null;
  flight_number?: string | null;
  vehicle_id?: string | null;
}

/** 'HH:MM' text against a date, matching how reservations store times. */
export function instant(date: string, time?: string | null): Date {
  const m = /^(\d{1,2}):(\d{2})/.exec(time ?? "");
  const h = m ? Number(m[1]) : 9;
  const min = m ? Number(m[2]) : 0;
  return new Date(`${date}T${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}:00`);
}

/**
 * A rental past its return time that has not come back.
 *
 * Only `active` counts. A `confirmed` booking whose dates have passed was a
 * no-show, not an overdue vehicle — treating the two alike would fill the
 * overdue list with bookings that never started, and bury the one car actually
 * missing.
 *
 * A grace period keeps someone stuck in airport traffic off a list meant for
 * vehicles that are genuinely unaccounted for.
 */
export const OVERDUE_GRACE_MINUTES = 60;

export interface Overdue {
  reservation: ReservationLike;
  dueAt: Date;
  minutesLate: number;
  urgency: Urgency;
}

export function findOverdue(
  reservations: ReservationLike[],
  now = new Date(),
  graceMinutes = OVERDUE_GRACE_MINUTES
): Overdue[] {
  const out: Overdue[] = [];
  for (const r of reservations) {
    if (r.status !== "active") continue;
    if (!r.return_date) continue;

    const dueAt = instant(r.return_date, r.return_time);
    const minutesLate = Math.floor((now.getTime() - dueAt.getTime()) / 60_000);
    if (minutesLate <= graceMinutes) continue;

    out.push({
      reservation: r,
      dueAt,
      minutesLate,
      // Past a day it is no longer a late customer, it is a missing vehicle.
      urgency: minutesLate > 24 * 60 ? "critical" : "warning",
    });
  }
  return out.sort((a, b) => b.minutesLate - a.minutesLate);
}

// ── Driving licence ─────────────────────────────────────────────────────────

export interface LicenceHolder {
  driving_licence_number?: string | null;
  driving_licence_expiry?: string | null;
  dob?: string | null;
}

export interface LicenceStatus {
  severity: "expired" | "expires-during" | "tight" | "missing" | "ok";
  message: string;
  /** True where the rental should not proceed without staff intervention. */
  blocks: boolean;
  /** Days between licence expiry and the end of the rental. Negative = expires first. */
  daysAfterReturn: number | null;
}

/**
 * Margin required between the licence expiring and the vehicle coming back.
 *
 * A licence that runs out on the return date leaves no room at all. A rental
 * that overruns by an afternoon, or a customer who asks for two more days —
 * both routine — put the driver on the road unlicensed, and the insurer will
 * take the same view whether or not the overrun was anyone's fault.
 *
 * Seven days covers a short extension and a late return without refusing every
 * licence that happens to expire that season.
 */
export const LICENCE_BUFFER_DAYS = 7;

function wholeDaysBetween(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/**
 * Licence state across a whole rental, measured against the RETURN date.
 *
 * Checking the pick-up date alone was wrong: the customer drives on the last day
 * too. A licence valid at collection and expired by the return means an
 * uninsured driver for part of the rental — and the earlier version would have
 * waved that through.
 *
 * Renting against an expired licence is an insurance problem rather than a
 * paperwork one: cover is written on the basis that the driver is licensed.
 * This is the cheap half of the live verification the larger systems sell — it
 * catches a licence that has plainly run out without calling any authority.
 */
export function licenceStatus(
  c: LicenceHolder,
  /** The end of the rental. A pick-up date may be passed for a quick sanity check. */
  returnAt: Date = new Date(),
  bufferDays: number = LICENCE_BUFFER_DAYS
): LicenceStatus {
  const number = String(c.driving_licence_number ?? "").trim();
  const expiry = String(c.driving_licence_expiry ?? "").trim();

  if (!number && !expiry) {
    return { severity: "missing", message: "No driving licence recorded", blocks: false, daysAfterReturn: null };
  }
  if (!expiry) {
    return { severity: "missing", message: "Licence number held, but no expiry date", blocks: false, daysAfterReturn: null };
  }

  const due = new Date(`${expiry}T00:00:00`);
  if (Number.isNaN(due.getTime())) {
    return { severity: "missing", message: "Licence expiry unreadable", blocks: false, daysAfterReturn: null };
  }

  const daysAfterReturn = wholeDaysBetween(returnAt, due);

  if (daysAfterReturn < 0) {
    return {
      severity: "expires-during",
      message: `Driving licence expires ${Math.abs(daysAfterReturn)} ${Math.abs(daysAfterReturn) === 1 ? "day" : "days"} before the vehicle is due back — the driver would be uninsured for part of the rental`,
      blocks: true,
      daysAfterReturn,
    };
  }
  if (daysAfterReturn === 0) {
    return {
      severity: "expires-during",
      message: "Driving licence expires on the day the vehicle is due back — a late return would leave the driver unlicensed",
      blocks: true,
      daysAfterReturn,
    };
  }
  if (daysAfterReturn <= bufferDays) {
    return {
      severity: "tight",
      // Not blocked: the licence does cover the rental as booked. But it cannot
      // absorb an extension, which is the common request.
      message: `Driving licence expires ${daysAfterReturn} ${daysAfterReturn === 1 ? "day" : "days"} after the return — the rental cannot be extended, and a delay would leave the driver unlicensed`,
      blocks: false,
      daysAfterReturn,
    };
  }
  return { severity: "ok", message: "Licence valid", blocks: false, daysAfterReturn };
}

// ── Service due by distance ─────────────────────────────────────────────────

export interface Serviceable {
  odometer_km?: number | null;
  service_interval_km?: number | null;
  /** Odometer reading at the last service; falls back to interval arithmetic. */
  last_service_km?: number | null;
  next_service_due?: string | null;
}

export interface ServiceStatus {
  severity: "overdue" | "due-soon" | "ok" | "unknown";
  message: string;
  kmRemaining: number | null;
}

/** Warn within this distance of the interval. */
export const SERVICE_WARN_KM = 500;

/**
 * Distance to the next service.
 *
 * A date alone is a poor proxy: a car doing airport runs all August reaches its
 * interval in weeks, while the same car in October may not reach it at all.
 * This becomes properly useful once check-in records the odometer at every
 * return — until then it reflects whatever was last entered by hand, which is
 * still better than a date somebody has to remember to update.
 */
export function serviceStatus(v: Serviceable): ServiceStatus {
  const odo = v.odometer_km;
  const interval = v.service_interval_km;

  if (odo == null || interval == null || interval <= 0) {
    return { severity: "unknown", message: "No odometer or service interval recorded", kmRemaining: null };
  }

  // Without a recorded last-service reading, assume services have been kept to
  // the interval and measure from the most recent multiple.
  const lastServiceKm = v.last_service_km ?? Math.floor(odo / interval) * interval;
  const dueAt = lastServiceKm + interval;
  const remaining = dueAt - odo;

  if (remaining <= 0) {
    return { severity: "overdue", message: `Service overdue by ${Math.abs(remaining)} km`, kmRemaining: remaining };
  }
  if (remaining <= SERVICE_WARN_KM) {
    return { severity: "due-soon", message: `Service due in ${remaining} km`, kmRemaining: remaining };
  }
  return { severity: "ok", message: `Service due in ${remaining} km`, kmRemaining: remaining };
}

// ── The day ─────────────────────────────────────────────────────────────────

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export interface DayEvent {
  kind: "pickup" | "return";
  at: Date;
  reservation: ReservationLike;
}

/**
 * Today's collections and returns in time order, interleaved.
 *
 * Interleaved deliberately: staff work a clock, not two separate lists, and a
 * return at 10:00 followed by a collection at 10:30 is the moment a turnaround
 * gets missed.
 */
export function dayEvents(reservations: ReservationLike[], today = new Date()): DayEvent[] {
  const events: DayEvent[] = [];
  const live = (s?: string | null) => s !== "cancelled" && s !== "voided" && s !== "no_show";

  for (const r of reservations) {
    if (!live(r.status)) continue;
    if (r.pickup_date) {
      const at = instant(r.pickup_date, r.pickup_time);
      if (sameDay(at, today) && r.status !== "active" && r.status !== "returned") {
        events.push({ kind: "pickup", at, reservation: r });
      }
    }
    if (r.return_date) {
      const at = instant(r.return_date, r.return_time);
      if (sameDay(at, today) && r.status !== "returned") {
        events.push({ kind: "return", at, reservation: r });
      }
    }
  }
  return events.sort((a, b) => a.at.getTime() - b.at.getTime());
}
