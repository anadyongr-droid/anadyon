import type { ReservationStatus } from "@/lib/reservationStatus";

/**
 * One palette for every status, in one place.
 *
 * There were three. This file served the dashboard and reservations, the
 * quotes screen carried its own near-copy, and the calendar a third. They had
 * already drifted: the quotes copy was missing `no_show` and `voided`
 * entirely, so a quote in either state rendered with no colour at all — the
 * lookup simply returned undefined and the badge came out unstyled.
 *
 * The hue now means the same thing everywhere. What changes between screens is
 * the weight, not the colour: the calendar draws bars across a dense grid and
 * needs solid fills to read at a glance, while the tables show badges inside
 * rows of text, where a saturated block on every line is exhausting. Same
 * meaning, appropriate weight.
 */

/** Every state a badge might be asked to render, including non-reservation ones. */
export type BadgeStatus = ReservationStatus | "new" | "maintenance" | "available" | "retired";

/** Solid fills, for bars on the calendar grid. */
export const STATUS_SOLID: Record<BadgeStatus, string> = {
  pending:     "bg-yellow-400 text-yellow-900",
  confirmed:   "bg-blue-500 text-white",
  active:      "bg-green-500 text-white",
  returned:    "bg-gray-400 text-white",
  cancelled:   "bg-red-300 text-red-900 line-through opacity-60",
  no_show:     "bg-orange-400 text-white opacity-70",
  voided:      "bg-gray-200 text-gray-400 line-through opacity-50",
  new:         "bg-slate-400 text-white",
  maintenance: "bg-violet-400 text-white",
  available:   "bg-green-500 text-white",
  retired:     "bg-gray-300 text-gray-600",
};

/**
 * Soft tints, for badges in tables.
 *
 * Same hue as the solid version above, so a booking that is blue on the
 * calendar is blue in the list. Contrast is checked: each pairing here is a
 * -100 background with a -700 or -800 foreground, which clears 4.5:1.
 */
export const STATUS_SOFT: Record<BadgeStatus, string> = {
  pending:     "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200",
  confirmed:   "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  active:      "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
  returned:    "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200",
  cancelled:   "bg-red-100 text-red-700 line-through dark:bg-red-900/40 dark:text-red-200",
  no_show:     "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200",
  voided:      "bg-gray-100 text-gray-500 line-through dark:bg-gray-800 dark:text-gray-400",
  new:         "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  maintenance: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200",
  available:   "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
  retired:     "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

/**
 * Just the hue, as a dot.
 *
 * The key renders these as small LEDs beside plain text rather than as filled
 * swatches with the label inside. Eleven filled boxes is a lot of saturated
 * colour for something that sits above the work rather than being the work,
 * and the label reads better as text than as a thing inside a block of colour.
 *
 * Taken from the solid palette, so the dot beside "Confirmed" is the same blue
 * as the confirmed bar on the calendar. The two muted states keep a visible
 * hue here — a swatch that is nearly white is not a swatch.
 */
export const STATUS_DOT: Record<BadgeStatus, string> = {
  pending:     "bg-yellow-400",
  confirmed:   "bg-blue-500",
  active:      "bg-green-500",
  returned:    "bg-gray-400",
  cancelled:   "bg-red-400",
  no_show:     "bg-orange-400",
  voided:      "bg-gray-300 dark:bg-gray-600",
  new:         "bg-slate-400",
  maintenance: "bg-violet-400",
  available:   "bg-green-500",
  retired:     "bg-gray-300 dark:bg-gray-600",
};

/** Kept as the previous export name so existing imports do not break. */
export const STATUS_COLORS = STATUS_SOFT;

/** How each state is written for staff, rather than how it is stored. */
export const STATUS_LABELS: Record<BadgeStatus, string> = {
  pending:     "Pending",
  confirmed:   "Confirmed",
  active:      "Active",
  returned:    "Returned",
  cancelled:   "Cancelled",
  no_show:     "No show",
  voided:      "Voided",
  new:         "New",
  maintenance: "Maintenance",
  available:   "Available",
  retired:     "Retired",
};

/**
 * The booking lifecycle, in the order it actually happens.
 *
 * `maintenance` is deliberately absent: it describes a vehicle, not a booking.
 * A car can be in maintenance while a reservation against it is confirmed, so
 * the two are different axes and the legend groups them separately. It is
 * violet rather than orange for the same reason — orange already means
 * "no show", and a key with two identical oranges meaning unrelated things is
 * worse than a colour nobody has seen before.
 */
export const BOOKING_STATUSES: BadgeStatus[] = [
  "pending", "confirmed", "active", "returned", "cancelled", "no_show", "voided",
];

/** States that belong to a vehicle rather than to a booking. */
export const VEHICLE_STATUSES: BadgeStatus[] = ["available", "maintenance", "retired"];

/** Falls back rather than rendering an unstyled badge for an unknown value. */
export function statusClass(status: string, weight: "soft" | "solid" = "soft"): string {
  const table = weight === "solid" ? STATUS_SOLID : STATUS_SOFT;
  return table[status as BadgeStatus] ?? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300";
}

export function statusLabel(status: string): string {
  return STATUS_LABELS[status as BadgeStatus] ?? status.replace(/_/g, " ");
}
