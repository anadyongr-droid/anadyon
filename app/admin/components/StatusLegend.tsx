import {
  BOOKING_STATUSES,
  VEHICLE_STATUSES,
  STATUS_LABELS,
  STATUS_DOT,
  type BadgeStatus,
} from "../lib/statusColors";

/**
 * The key: one row of LEDs, always on show.
 *
 * It was a collapsible panel, on the reasoning that staff learn the palette in
 * a week and would not want swatches permanently above their work. That was
 * wrong in a way worth recording — a key costs one line and answers a question
 * the moment it is asked, whereas a key behind a toggle is only found by
 * someone who already suspects it exists. Hiding it made the screen tidier and
 * the information useless.
 *
 * No panel, no border, no disclosure. A row of dots and words that reads as
 * part of the page rather than a thing sitting on top of it.
 *
 * Not a client component any more: with the toggle gone there is no state, so
 * this renders on the server like the rest of the page.
 */
export default function StatusLegend() {
  const led = (s: BadgeStatus) => (
    <span key={s} className="inline-flex items-center gap-1.5">
      {/* shrink-0 keeps the dot round when the row wraps under a long label. */}
      <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[s]}`} aria-hidden="true" />
      {STATUS_LABELS[s]}
    </span>
  );

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-3 text-xs text-gray-600">
      {BOOKING_STATUSES.map(led)}
      {/*
        A single hairline, not a box. Active and Available are both green
        because both mean "in use, nothing wrong" — but one describes a booking
        and the other a vehicle, and side by side with nothing between them the
        repeated colour reads as a mistake.
      */}
      <span className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pl-4 border-l border-gray-200">
        {VEHICLE_STATUSES.map(led)}
        <span className="text-gray-600">vehicle, not booking</span>
      </span>
    </div>
  );
}
