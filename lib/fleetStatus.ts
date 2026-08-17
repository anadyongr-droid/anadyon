/**
 * Statutory and servicing status for a vehicle.
 *
 * Three dates on a Greek rental vehicle carry consequences, and they are not
 * equal in severity:
 *
 *   KTEO      roadworthiness. Driving past expiry is an offence AND voids
 *             insurance cover — so an expired KTEO does not merely warrant a
 *             warning, it means the vehicle must not leave the yard.
 *   Insurance obvious, and the same absolute bar.
 *   Road tax  τέλη κυκλοφορίας. A fine, not a prohibition — expensive but the
 *             vehicle is still legally insured and drivable.
 *
 * The distinction matters: conflating them would either block a rental that is
 * merely going to cost a fine, or let out a vehicle with no cover.
 */

export type Severity = "expired" | "due-soon" | "ok" | "unknown";

export interface DateStatus {
  key: string;
  label: string;
  date: string | null;
  severity: Severity;
  /** Negative once past. */
  daysRemaining: number | null;
  /** True where expiry means the vehicle must not be rented at all. */
  blocksRental: boolean;
  message: string;
}

/** Warn this far ahead. A KTEO booking needs lead time; a tax payment does not. */
const WARN_DAYS: Record<string, number> = {
  kteo_expiry: 30,
  insurance_expiry: 30,
  road_tax_paid_until: 14,
  next_service_due: 14,
  driving_licence_expiry: 30,
};

/**
 * Whole days between two dates, counted from local midnight.
 *
 * `new Date()` carries a time, so an un-normalised subtraction makes "expires
 * today" read as expired from mid-morning onwards, and shifts every count by
 * one for part of the day. Both sides are floored to local midnight first, so
 * the answer is the same whenever during the day it is asked.
 */
function daysBetween(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function statusFor(
  key: string,
  label: string,
  value: string | null | undefined,
  blocksRental: boolean,
  today: Date
): DateStatus {
  if (!value) {
    return {
      key, label, date: null, severity: "unknown", daysRemaining: null, blocksRental,
      message: `${label} not recorded`,
    };
  }

  const due = new Date(`${value}T00:00:00`);
  if (Number.isNaN(due.getTime())) {
    return { key, label, date: value, severity: "unknown", daysRemaining: null, blocksRental,
      message: `${label} unreadable` };
  }

  const remaining = daysBetween(today, due);
  const warnAt = WARN_DAYS[key] ?? 30;

  if (remaining < 0) {
    return {
      key, label, date: value, severity: "expired", daysRemaining: remaining, blocksRental,
      message: blocksRental
        ? `${label} expired ${Math.abs(remaining)} days ago — do not rent this vehicle`
        : `${label} expired ${Math.abs(remaining)} days ago`,
    };
  }
  if (remaining <= warnAt) {
    return {
      key, label, date: value, severity: "due-soon", daysRemaining: remaining, blocksRental,
      message: remaining === 0 ? `${label} expires today` : `${label} expires in ${remaining} days`,
    };
  }
  return { key, label, date: value, severity: "ok", daysRemaining: remaining, blocksRental,
    message: `${label} valid` };
}

export interface VehicleDates {
  kteo_expiry?: string | null;
  insurance_expiry?: string | null;
  road_tax_paid_until?: string | null;
  next_service_due?: string | null;
}

/** Every tracked date for one vehicle, worst first. */
export function vehicleDateStatuses(v: VehicleDates, today = new Date()): DateStatus[] {
  const order: Record<Severity, number> = { expired: 0, "due-soon": 1, unknown: 2, ok: 3 };
  return [
    // Expiry voids insurance cover, so these two bar the vehicle outright.
    statusFor("kteo_expiry", "KTEO", v.kteo_expiry, true, today),
    statusFor("insurance_expiry", "Insurance", v.insurance_expiry, true, today),
    // A fine, not a prohibition.
    statusFor("road_tax_paid_until", "Road tax", v.road_tax_paid_until, false, today),
    statusFor("next_service_due", "Service", v.next_service_due, false, today),
  ].sort((a, b) => order[a.severity] - order[b.severity]);
}

/**
 * Whether a vehicle may be rented at all, and why not.
 *
 * Deliberately stricter than the date list: a vehicle in maintenance or retired
 * is unavailable regardless of its paperwork.
 */
export function rentalBar(
  v: VehicleDates & { status?: string | null },
  today = new Date()
): { barred: boolean; reason: string } {
  if (v.status === "retired") return { barred: true, reason: "Vehicle is retired" };
  if (v.status === "maintenance") return { barred: true, reason: "Vehicle is in maintenance" };

  const blocking = vehicleDateStatuses(v, today)
    .filter(s => s.blocksRental && s.severity === "expired");

  if (blocking.length) {
    return {
      barred: true,
      reason: blocking.map(s => `${s.label} expired`).join(" and ") + " — insurance cover is void",
    };
  }
  return { barred: false, reason: "" };
}

/** Worst severity across a vehicle, for the list view's single indicator. */
export function worstSeverity(v: VehicleDates, today = new Date()): Severity {
  const all = vehicleDateStatuses(v, today);
  if (all.some(s => s.severity === "expired")) return "expired";
  if (all.some(s => s.severity === "due-soon")) return "due-soon";
  if (all.every(s => s.severity === "unknown")) return "unknown";
  return "ok";
}

// ── Margin ──────────────────────────────────────────────────────────────────

export interface MarginInput {
  /** Sum of `total` across the vehicle's non-cancelled reservations. */
  revenue: number;
  /** Sum of `amount` across vehicle_costs. */
  costs: number;
  /** Repair costs from vehicle_damages not charged to the customer. */
  absorbedDamage: number;
}

export interface Margin {
  revenue: number;
  costs: number;
  margin: number;
  /** Null rather than zero when there is no revenue — a percentage of nothing misleads. */
  marginPct: number | null;
  /** Costs as a share of revenue. Benchmark: maintenance should stay under 15%. */
  costRatio: number | null;
}

export function computeMargin({ revenue, costs, absorbedDamage }: MarginInput): Margin {
  const total = costs + absorbedDamage;
  const margin = revenue - total;
  return {
    revenue: Math.round(revenue * 100) / 100,
    costs: Math.round(total * 100) / 100,
    margin: Math.round(margin * 100) / 100,
    marginPct: revenue > 0 ? Math.round((margin / revenue) * 1000) / 10 : null,
    costRatio: revenue > 0 ? Math.round((total / revenue) * 1000) / 10 : null,
  };
}
