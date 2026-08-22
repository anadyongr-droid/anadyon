"use client";

import { useState } from "react";
import { daysInMonth, joinIsoDate, splitIsoDate, type DateParts } from "@/lib/dateFields";

interface Props {
  value: string | null | undefined;
  onChange: (value: string) => void;
  minYear: number;
  maxYear: number;
  locale?: "en" | "el";
  required?: boolean;
  invalid?: boolean;
  idPrefix: string;
  className?: string;
}

const MONTHS = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  el: ["Ιαν", "Φεβ", "Μαρ", "Απρ", "Μάι", "Ιουν", "Ιουλ", "Αυγ", "Σεπ", "Οκτ", "Νοε", "Δεκ"],
};

export default function SegmentedDateInput({
  value,
  onChange,
  minYear,
  maxYear,
  locale = "en",
  required = false,
  invalid = false,
  idPrefix,
  className = "",
}: Props) {
  const [parts, setParts] = useState<DateParts>(() => splitIsoDate(value));
  const years = Array.from(
    { length: Math.max(0, maxYear - minYear + 1) },
    (_, index) => String(maxYear - index),
  );
  const days = Array.from(
    { length: daysInMonth(parts.month, parts.year) },
    (_, index) => String(index + 1).padStart(2, "0"),
  );
  const labels = locale === "el"
    ? { day: "Ημέρα", month: "Μήνας", year: "Έτος", clear: "Καθαρισμός ημερομηνίας", clearShort: "Καθαρισμός" }
    : { day: "Day", month: "Month", year: "Year", clear: "Clear date", clearShort: "Clear" };
  const border = invalid ? "border-red-500 ring-1 ring-red-500" : "border-gray-300 dark:border-gray-600";
  const selectClass = `min-w-0 rounded-lg border bg-white px-2 py-2 text-sm text-gray-800 dark:bg-gray-700 dark:text-gray-100 ${border}`;

  function update(key: keyof DateParts, nextValue: string) {
    const next = { ...parts, [key]: nextValue };
    const maxDay = daysInMonth(next.month, next.year);
    if (next.day && Number(next.day) > maxDay) next.day = String(maxDay).padStart(2, "0");
    setParts(next);
    onChange(joinIsoDate(next));
  }

  return (
    <div className={`flex max-w-sm items-center gap-2 ${className}`} data-date-empty={!value}>
      <div className="grid min-w-0 flex-1 grid-cols-[4.5rem_minmax(5.5rem,1fr)_5.5rem] gap-1.5">
        <select
          id={`${idPrefix}-day`}
          aria-label={labels.day}
          required={required}
          value={parts.day}
          onChange={(event) => update("day", event.target.value)}
          className={selectClass}
        >
          <option value="">{labels.day}</option>
          {days.map((day) => <option key={day} value={day}>{Number(day)}</option>)}
        </select>
        <select
          id={`${idPrefix}-month`}
          aria-label={labels.month}
          required={required}
          value={parts.month}
          onChange={(event) => update("month", event.target.value)}
          className={selectClass}
        >
          <option value="">{labels.month}</option>
          {MONTHS[locale].map((month, index) => {
            const monthValue = String(index + 1).padStart(2, "0");
            return <option key={monthValue} value={monthValue}>{month}</option>;
          })}
        </select>
        <select
          id={`${idPrefix}-year`}
          aria-label={labels.year}
          required={required}
          value={parts.year}
          onChange={(event) => update("year", event.target.value)}
          className={selectClass}
        >
          <option value="">{labels.year}</option>
          {years.map((year) => <option key={year} value={year}>{year}</option>)}
        </select>
      </div>
      {!required && value && (
        <button
          type="button"
          onClick={() => { setParts(splitIsoDate("")); onChange(""); }}
          aria-label={labels.clear}
          className="shrink-0 rounded px-1.5 py-2 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800"
        >
          {labels.clearShort}
        </button>
      )}
    </div>
  );
}
