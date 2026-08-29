import { describe, expect, it } from "vitest";
import { calendarRowCells, unallocatedCalendarReservations } from "@/lib/calendarReservations";

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

describe("a vehicle's row always fills the calendar exactly", () => {
  const days = (from: string, n: number) => {
    const [y, mo, d] = from.split("-").map(Number);
    return Array.from({ length: n }, (_, i) => {
      const dt = new Date(y, mo - 1, d + i);
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    });
  };
  const columns = (cells: ReturnType<typeof calendarRowCells>) =>
    cells.reduce((n, c) => n + (c.kind === "bar" ? c.span : 1), 0);

  const view = days("2026-08-28", 7); // 28 Aug … 3 Sep
  const RUNNING = { vehicle_id: "v1", pickup_date: "2026-08-25", return_date: "2026-08-28" };
  const NEW = { vehicle_id: "v1", pickup_date: "2026-08-29", return_date: "2026-08-30" };

  /**
   * The algorithm this replaced, kept so the test above is known to
   * discriminate rather than merely to pass. It decided each column with two
   * independent predicates and emitted nothing for a covered day whose bar had
   * not rendered — which is every day of a rental that began before the view.
   */
  function previousAlgorithm(reservations: typeof RUNNING[], dateRange: string[]): number {
    let cols = 0;
    for (const day of dateRange) {
      const res = reservations.find((r) => r.pickup_date <= day && r.return_date >= day);
      if (res && res.pickup_date === day) {
        const endIdx = dateRange.findIndex((d) => d > res.return_date);
        cols += (endIdx === -1 ? dateRange.length : endIdx) - dateRange.indexOf(day);
        continue;
      }
      if (res) continue;   // emitted no <td> at all
      cols += 1;
    }
    return cols;
  }

  it("the previous algorithm lost a column, which is what moved the booking", () => {
    // Asserted first and deliberately: without this, the invariant below could
    // pass against an implementation that never had the fault.
    expect(previousAlgorithm([RUNNING, NEW], view)).toBe(view.length - 1);
  });

  it("emits exactly one column per visible day, with a rental already running", () => {
    expect(columns(calendarRowCells([RUNNING, NEW], view))).toBe(view.length);
  });

  it("puts the new booking on its own pick-up date, not a day earlier", () => {
    const cells = calendarRowCells([RUNNING, NEW], view);
    let column = 0;
    for (const cell of cells) {
      if (cell.kind === "bar" && cell.reservation.pickup_date === NEW.pickup_date) break;
      column += cell.kind === "bar" ? cell.span : 1;
    }
    expect(view[column]).toBe("2026-08-29");
  });

  it("still draws a rental that began before the view, rather than swallowing it", () => {
    const cells = calendarRowCells([RUNNING, NEW], view);
    const clipped = cells.find((c) => c.kind === "bar" && c.continuesBefore);
    expect(clipped, "the running rental vanished").toBeDefined();
    expect(clipped!.kind === "bar" && clipped!.span).toBe(1); // 28 Aug only
  });

  it("clips a rental running past the last visible day and says so", () => {
    const long = { vehicle_id: "v1", pickup_date: "2026-08-30", return_date: "2026-09-20" };
    const cells = calendarRowCells([long], view);
    expect(columns(cells)).toBe(view.length);
    expect(cells.some((c) => c.kind === "bar" && c.continuesAfter)).toBe(true);
  });

  it("holds for an empty row, a full row, and back-to-back rentals", () => {
    const backToBack = [
      { vehicle_id: "v1", pickup_date: "2026-08-28", return_date: "2026-08-29" },
      { vehicle_id: "v1", pickup_date: "2026-08-30", return_date: "2026-09-03" },
    ];
    for (const set of [[], [{ vehicle_id: "v1", pickup_date: "2026-08-01", return_date: "2026-12-01" }], backToBack]) {
      expect(columns(calendarRowCells(set, view))).toBe(view.length);
    }
  });
});
