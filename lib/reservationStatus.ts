/**
 * The reservation lifecycle, in one place.
 *
 * This list and the database CHECK constraint must agree. They did not: the
 * form offered `voided` and `no_show`, the live constraint accepted neither,
 * and selecting either produced a raw Postgres error on save. Migration 020
 * widened the constraint; the end-to-end suite now asserts every value here is
 * actually writable, so the two cannot drift apart again unnoticed.
 */
export const RESERVATION_STATUSES = [
  "pending",
  "confirmed",
  "active",
  "returned",
  "cancelled",
  "no_show",
  "voided",
] as const;

export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

/** Statuses that release the vehicle: it is no longer held by this booking. */
export const RELEASING_STATUSES: ReservationStatus[] = ["cancelled", "voided", "no_show"];

/** Statuses that still hold the vehicle and count against availability. */
export const HOLDING_STATUSES: ReservationStatus[] = RESERVATION_STATUSES.filter(
  (s) => !RELEASING_STATUSES.includes(s)
);
