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
