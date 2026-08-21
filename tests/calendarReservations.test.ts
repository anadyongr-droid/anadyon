import { describe, expect, it } from "vitest";
import { unallocatedCalendarReservations } from "@/lib/calendarReservations";

describe("calendar reservation allocation", () => {
  const reservations = [
    { id: "website-pending", vehicle_id: null, pickup_date: "2026-08-25", return_date: "2026-08-30" },
    { id: "allocated", vehicle_id: "vehicle-1", pickup_date: "2026-08-25", return_date: "2026-08-30" },
    { id: "outside-view", vehicle_id: null, pickup_date: "2026-09-10", return_date: "2026-09-12" },
  ];

  it("shows every unallocated reservation that intersects the visible calendar", () => {
    expect(unallocatedCalendarReservations(reservations, "2026-08-21", "2026-08-31"))
      .toEqual([reservations[0]]);
  });

  it("does not duplicate an allocated reservation in the unallocated section", () => {
    expect(unallocatedCalendarReservations(reservations, "2026-08-21", "2026-08-31"))
      .not.toContain(reservations[1]);
  });
});
