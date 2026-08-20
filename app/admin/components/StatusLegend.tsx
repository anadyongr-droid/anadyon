"use client";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  BOOKING_STATUSES,
  VEHICLE_STATUSES,
  STATUS_LABELS,
  STATUS_DOT,
  type BadgeStatus,
} from "../lib/statusColors";

/**
 * The key, so the colours mean something to someone who has not been told.
 *
 * Small LEDs beside plain labels, not filled swatches with the label inside.
 * The first version used the badge styling from the tables, which made the key
 * eleven saturated blocks sitting above the work — heavy for something read
 * once and then ignored. A dot carries the colour just as well and lets the
 * label read as a word.
 *
 * The dots are the solid palette, so the LED beside "Confirmed" is the blue of
 * a confirmed bar on the calendar, and the key stays honest whichever screen
 * it sits on. That also means it no longer needs a `weight` prop.
 *
 * Collapsed by default. Staff who use these screens daily learn the palette in
 * a week; the people who need the key are new, or looking at a status they see
 * rarely.
 */
export default function StatusLegend() {
  const [open, setOpen] = useState(false);

  const led = (s: BadgeStatus) => (
    <span key={s} className="inline-flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
      {/* shrink-0 so the dot stays round when the row wraps under a long label. */}
      <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[s]}`} aria-hidden="true" />
      {STATUS_LABELS[s]}
    </span>
  );

  return (
    <div className="text-sm">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 min-h-11 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition"
      >
        <span>Status colours</span>
        <ChevronDown size={16} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-1 mb-3 text-xs">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {BOOKING_STATUSES.map(led)}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
            {VEHICLE_STATUSES.map(led)}
            <span className="text-gray-400 dark:text-gray-500">
              — vehicle, not booking
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
