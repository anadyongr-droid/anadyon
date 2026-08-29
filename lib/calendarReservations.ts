/**
 * Calendar data is derived directly from reservations. A reservation which has
 * not yet been allocated a vehicle cannot occupy a vehicle row, but it must
 * still be visible to the dispatcher in the Calendar.
 */
export type CalendarReservation = {
  vehicle_id: string | null;
  pickup_date: string;
  return_date: string;
};

export function overlapsCalendarRange(
  reservation: CalendarReservation,
  startDate: string,
  endDate: string,
) {
  return reservation.pickup_date <= endDate && reservation.return_date >= startDate;
}

export function unallocatedCalendarReservations<T extends CalendarReservation>(
  reservations: T[],
  startDate: string,
  endDate: string,
) {
  return reservations.filter(
    (reservation) => !reservation.vehicle_id && overlapsCalendarRange(reservation, startDate, endDate),
  );
}

/**
 * One vehicle's row, as cells that are guaranteed to fill the view exactly.
 *
 * The Calendar previously decided each column with two independent predicates:
 * draw a spanning bar when the column matched a reservation's `pickup_date`,
 * otherwise emit nothing at all if some reservation covered that day. Those
 * agree only when every covered day is accounted for by a bar that actually
 * rendered — and a rental which began BEFORE the visible window never rendered,
 * because no visible column equals its pickup date. Its days were swallowed
 * anyway, the row came up short, and every bar to its right slid one column
 * left. The header row is built separately from the same date range, so it
 * stayed correct: the reservation appeared to have moved a day earlier.
 *
 * Walking the range once removes the possibility rather than fixing the
 * symptom. Each step emits exactly the columns it consumes, so the total is the
 * length of the range by construction, whatever the reservations do.
 */
export type CalendarCell<T> =
  | { kind: "bar"; reservation: T; span: number; continuesBefore: boolean; continuesAfter: boolean }
  | { kind: "empty"; date: string };

export function calendarRowCells<T extends CalendarReservation>(
  reservations: T[],
  /** The visible days, in order, as ISO date strings. */
  dateRange: string[],
): Array<CalendarCell<T>> {
  const cells: Array<CalendarCell<T>> = [];
  let i = 0;

  while (i < dateRange.length) {
    const day = dateRange[i];
    // Earliest-starting first, so two reservations meeting on one day resolve
    // to the one already running rather than to whichever the array held first.
    const covering = reservations
      .filter((r) => r.pickup_date <= day && r.return_date >= day)
      .sort((a, b) => a.pickup_date.localeCompare(b.pickup_date));
    const res = covering[0];

    if (!res) {
      cells.push({ kind: "empty", date: day });
      i += 1;
      continue;
    }

    // How many consecutive visible columns this reservation still covers.
    let span = 0;
    while (
      i + span < dateRange.length &&
      res.pickup_date <= dateRange[i + span] &&
      res.return_date >= dateRange[i + span]
    ) {
      span += 1;
    }

    cells.push({
      kind: "bar",
      reservation: res,
      span,
      // Rendered so the dispatcher can tell a rental that started last week
      // from one starting today. Without it a clipped bar reads as a booking
      // beginning on the first visible day, which is its own wrong answer.
      continuesBefore: res.pickup_date < dateRange[i],
      continuesAfter: res.return_date > dateRange[dateRange.length - 1],
    });
    i += span;
  }

  return cells;
}
