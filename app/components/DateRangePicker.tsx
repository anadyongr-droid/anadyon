"use client";
import { useState, useRef, useEffect } from "react";
import { DayPicker } from "react-day-picker";
import { translator, type Locale } from "@/lib/i18n";
import { CalendarDays, ChevronRight } from "lucide-react";
import "react-day-picker/style.css";

interface Props {
  locale?: Locale;
  pickupDate: string;
  returnDate: string;
  onPickupChange: (date: string) => void;
  onReturnChange: (date: string) => void;
}

function toDate(str: string): Date | undefined {
  return str ? new Date(str + "T00:00:00") : undefined;
}

function toStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmt(str: string, locale: Locale, placeholder: string): string {
  if (!str) return placeholder;
  return new Date(str + "T00:00:00").toLocaleDateString(locale === "el" ? "el-GR" : "en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

export default function DateRangePicker({ pickupDate, returnDate, onPickupChange, onReturnChange, locale = "en" }: Props) {
  const tr = translator(locale);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"pickup" | "return">("pickup");
  const ref = useRef<HTMLDivElement>(null);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const from = toDate(pickupDate);
  const to = toDate(returnDate);

  // Range for highlighting
  const selected = from && to ? { from, to } : from ? { from, to: undefined } : undefined;

  function openForPickup() {
    setStep("pickup");
    setOpen(true);
  }

  function openForReturn() {
    setStep("return");
    setOpen(true);
  }

  function dayAfter(day: Date): Date {
    const next = new Date(day);
    next.setDate(next.getDate() + 1);
    return next;
  }

  function handleDayClick(day: Date) {
    if (step === "pickup") {
      onPickupChange(toStr(day));
      if (to && day < to) {
        // existing return date is still valid — keep it and close
        setOpen(false);
        setStep("pickup");
      } else {
        // default return to next day so a price is always shown
        onReturnChange(toStr(dayAfter(day)));
        setStep("return");
      }
    } else {
      // return step
      if (from && day <= from) {
        // clicked before or on pickup — restart from this date
        onPickupChange(toStr(day));
        onReturnChange(toStr(dayAfter(day)));
        setStep("return");
      } else {
        onReturnChange(toStr(day));
        setOpen(false);
        setStep("pickup");
      }
    }
  }

  // Close when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setStep("pickup");
      }
    }
    document.addEventListener("pointerdown", handleClick);
    return () => document.removeEventListener("pointerdown", handleClick);
  }, []);

  const rentalDays = pickupDate && returnDate
    ? Math.ceil((new Date(returnDate).getTime() - new Date(pickupDate).getTime()) / 86400000)
    : 0;

  return (
    <div ref={ref} className="relative">
      {/* Trigger buttons */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={openForPickup}
          className={`flex items-center gap-2 w-full border rounded-lg px-3 py-2.5 bg-white dark:bg-gray-700 text-left transition ${
            open && step === "pickup"
              ? "border-blue-500 ring-1 ring-blue-400"
              : "border-gray-300 dark:border-gray-600 hover:border-blue-400"
          }`}
        >
          <CalendarDays size={16} className="text-blue-600 shrink-0" />
          <div className="min-w-0">
            <div className="text-xs text-gray-500 dark:text-gray-400">{tr("form.pickup")}</div>
            <div className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{fmt(pickupDate, locale, tr("form.selectDate"))}</div>
          </div>
        </button>

        <button
          type="button"
          onClick={openForReturn}
          className={`flex items-center gap-2 w-full border rounded-lg px-3 py-2.5 bg-white dark:bg-gray-700 text-left transition ${
            open && step === "return"
              ? "border-blue-500 ring-1 ring-blue-400"
              : "border-gray-300 dark:border-gray-600 hover:border-blue-400"
          }`}
        >
          <CalendarDays size={16} className="text-blue-600 shrink-0" />
          <div className="min-w-0">
            <div className="text-xs text-gray-500 dark:text-gray-400">{tr("form.return")}</div>
            <div className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{fmt(returnDate, locale, tr("form.selectDate"))}</div>
          </div>
        </button>
      </div>

      {/* Duration badge */}
      {rentalDays > 0 && (
        <div className="flex items-center gap-1.5 mt-2 text-xs text-blue-700 dark:text-blue-300 font-medium">
          <ChevronRight size={12} />
          {rentalDays} {tr(rentalDays === 1 ? "form.dayRental" : "form.daysRental")}
        </div>
      )}

      {/* Calendar popover */}
      {open && (
        <div className="absolute z-50 mt-2 left-0 right-0 sm:right-auto sm:left-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl p-3 overflow-x-auto">
          <p className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-2 px-1">
            {tr(step === "pickup" ? "form.selectPickupDate" : "form.selectReturnDate")}
          </p>
          <DayPicker
            mode="range"
            selected={selected}
            onDayClick={handleDayClick}
            disabled={{ before: step === "return" && from ? from : today }}
            showOutsideDays
          />
        </div>
      )}
    </div>
  );
}
