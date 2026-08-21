import { describe, expect, it } from "vitest";
import {
  BOOKING_LOCATIONS,
  BOOKING_LOCATION_VALUES,
  DEFAULT_ADMIN_BOOKING_LOCATION,
  DEFAULT_PUBLIC_BOOKING_LOCATION,
} from "@/lib/bookingLocations";

describe("booking locations", () => {
  it("uses the same three canonical stored values everywhere", () => {
    expect(BOOKING_LOCATION_VALUES).toEqual([
      "Zakynthos Airport",
      "Zakynthos Port",
      "Anadyon Office",
    ]);
    expect(BOOKING_LOCATIONS.map((location) => location.value)).toEqual(BOOKING_LOCATION_VALUES);
  });

  it("keeps public and administration defaults in the canonical list", () => {
    expect(BOOKING_LOCATION_VALUES).toContain(DEFAULT_PUBLIC_BOOKING_LOCATION);
    expect(BOOKING_LOCATION_VALUES).toContain(DEFAULT_ADMIN_BOOKING_LOCATION);
  });
});
