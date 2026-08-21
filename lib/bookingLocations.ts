/**
 * Canonical locations used in website bookings and the administration system.
 *
 * `value` is persisted to the database and used in customer communications.
 * `translationKey` is only for the public-facing label.
 */
export const BOOKING_LOCATIONS = [
  { value: "Zakynthos Airport", translationKey: "loc.airport" },
  { value: "Zakynthos Port", translationKey: "loc.port" },
  { value: "Anadyon Office", translationKey: "loc.office" },
] as const;

export const BOOKING_LOCATION_VALUES = BOOKING_LOCATIONS.map(({ value }) => value);

export const DEFAULT_PUBLIC_BOOKING_LOCATION = "Zakynthos Airport";
export const DEFAULT_ADMIN_BOOKING_LOCATION = "Anadyon Office";
