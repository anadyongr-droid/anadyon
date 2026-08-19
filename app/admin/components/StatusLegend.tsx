"use client";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  BOOKING_STATUSES,
  VEHICLE_STATUSES,
  STATUS_LABELS,
  statusClass,
  type BadgeStatus,
} from "../lib/statusColors";

/**
 * The key, so the colours mean something to someone who has not been told.
 *
 * Collapsed by default. Staff who use these screens daily learn the palette in
 * a week and do not want a permanent block of swatches above their work; the
 * people who need it are new, or looking at a status they see rarely. Open once
 * and it stays open for the session.
 *
 * `weight` matches the screen it sits on — solid on the calendar, where bars
 * are filled, soft on the tables, where badges are tinted. Same hue either way,
 * so the key is honest about what the reader is actually looking at.
 */
export default function StatusLegend({ weight = "soft" }: { weight?: "soft" | "solid" }) {
  const [open, setOpen] = useState(false);

  const swatch = (s: BadgeStatus) => (
    <span key={s} className="inline-flex items-center gap-1.5">
      <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusClass(s, weight)}`}>
        {STATUS_LABELS[s]}
      </span>
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
        <div className="mt-1 mb-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 space-y-3">
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Booking</p>
            <div className="flex flex-wrap gap-2">{BOOKING_STATUSES.map(swatch)}</div>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Vehicle</p>
            <div className="flex flex-wrap gap-2">{VEHICLE_STATUSES.map(swatch)}</div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
              Describes the vehicle, not the booking — a car can be in maintenance
              while a reservation against it is still confirmed.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
