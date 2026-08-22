"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { daysInMonth, joinIsoDate, splitIsoDate, type DateParts } from "@/lib/dateFields";

const ITEM_HEIGHT = 44;
const VISIBLE_ITEMS = 5;

const MONTHS = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  el: ["Ιαν", "Φεβ", "Μαρ", "Απρ", "Μάι", "Ιουν", "Ιουλ", "Αυγ", "Σεπ", "Οκτ", "Νοέ", "Δεκ"],
};

interface PickerLabels {
  title: string;
  day: string;
  month: string;
  year: string;
  cancel: string;
  done: string;
  help: string;
  placeholder: string;
}

interface Props {
  id: string;
  value: string;
  onChange: (value: string) => void;
  minYear: number;
  maxYear: number;
  preferredYear: number;
  locale: "en" | "el";
  labels: PickerLabels;
  invalid?: boolean;
  errorId?: string;
}

interface WheelOption {
  value: string;
  label: string;
}

interface WheelColumnProps {
  id: string;
  label: string;
  options: WheelOption[];
  value: string;
  onChange: (value: string) => void;
}

function WheelColumn({ id, label, options, value, onChange }: WheelColumnProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function scrollToIndex(index: number) {
    scrollerRef.current?.scrollTo({ top: index * ITEM_HEIGHT, behavior: "smooth" });
  }

  useEffect(() => {
    const index = options.findIndex((option) => option.value === value);
    const scroller = scrollerRef.current;
    if (index >= 0 && scroller && Math.abs(scroller.scrollTop - index * ITEM_HEIGHT) > 1) {
      scroller.scrollTo({ top: index * ITEM_HEIGHT });
    }
  }, [options, value]);

  useEffect(() => () => {
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
  }, []);

  function settleFromScroll() {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = setTimeout(() => {
      const index = Math.max(0, Math.min(options.length - 1, Math.round(scroller.scrollTop / ITEM_HEIGHT)));
      const next = options[index];
      if (next && next.value !== value) onChange(next.value);
    }, 80);
  }

  function moveSelection(delta: number) {
    const currentIndex = Math.max(0, options.findIndex((option) => option.value === value));
    const nextIndex = Math.max(0, Math.min(options.length - 1, currentIndex + delta));
    onChange(options[nextIndex].value);
    scrollToIndex(nextIndex);
  }

  return (
    <div className="relative min-w-0">
      <div
        ref={scrollerRef}
        id={id}
        role="listbox"
        aria-label={label}
        aria-activedescendant={`${id}-${value}`}
        onScroll={settleFromScroll}
        className="relative z-10 snap-y snap-mandatory overflow-y-auto overscroll-contain py-[88px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ height: ITEM_HEIGHT * VISIBLE_ITEMS }}
      >
        {options.map((option, index) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              id={`${id}-${option.value}`}
              type="button"
              role="option"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => {
                onChange(option.value);
                scrollToIndex(index);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowUp") { event.preventDefault(); moveSelection(-1); }
                if (event.key === "ArrowDown") { event.preventDefault(); moveSelection(1); }
              }}
              className={`flex h-11 w-full snap-center items-center justify-center rounded-md px-1 text-center transition-[opacity,transform,color] ${
                selected
                  ? "scale-100 font-semibold text-blue-800 dark:text-blue-200"
                  : "scale-90 text-gray-500 opacity-55 dark:text-gray-400"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-1/2 z-0 h-11 -translate-y-1/2 rounded-lg border-y border-blue-200 bg-blue-50 dark:border-blue-700 dark:bg-blue-950" />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-14 bg-gradient-to-b from-white to-transparent dark:from-gray-800" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-14 bg-gradient-to-t from-white to-transparent dark:from-gray-800" />
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function initialParts(value: string, preferredYear: number, minYear: number, maxYear: number): DateParts {
  const existing = splitIsoDate(value);
  if (existing.day && existing.month && existing.year) return existing;
  return {
    day: "15",
    month: "06",
    year: String(clamp(preferredYear, minYear, maxYear)),
  };
}

function displayDate(value: string, placeholder: string) {
  const parts = splitIsoDate(value);
  return parts.day && parts.month && parts.year
    ? `${parts.day}/${parts.month}/${parts.year}`
    : placeholder;
}

export default function DobWheelPicker({
  id,
  value,
  onChange,
  minYear,
  maxYear,
  preferredYear,
  locale,
  labels,
  invalid = false,
  errorId,
}: Props) {
  const triggerRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateParts>(() => initialParts(value, preferredYear, minYear, maxYear));

  const years = useMemo(
    () => Array.from({ length: maxYear - minYear + 1 }, (_, index) => {
      const year = String(maxYear - index);
      return { value: year, label: year };
    }),
    [maxYear, minYear],
  );
  const months = useMemo(
    () => MONTHS[locale].map((label, index) => ({ value: String(index + 1).padStart(2, "0"), label })),
    [locale],
  );
  const days = useMemo(
    () => Array.from({ length: daysInMonth(draft.month, draft.year) }, (_, index) => {
      const day = String(index + 1).padStart(2, "0");
      return { value: day, label: String(index + 1) };
    }),
    [draft.month, draft.year],
  );

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = requestAnimationFrame(() => dialogRef.current?.focus());
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        requestAnimationFrame(() => triggerRef.current?.focus());
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function update(part: keyof DateParts, nextValue: string) {
    setDraft((current) => {
      const next = { ...current, [part]: nextValue };
      const finalDay = Math.min(Number(next.day), daysInMonth(next.month, next.year));
      next.day = String(finalDay).padStart(2, "0");
      return next;
    });
  }

  function closePicker() {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function openPicker() {
    setDraft(initialParts(value, preferredYear, minYear, maxYear));
    setOpen(true);
  }

  function confirmDate() {
    const next = joinIsoDate(draft);
    if (next) onChange(next);
    closePicker();
  }

  return (
    <>
      <input
        ref={triggerRef}
        id={id}
        type="text"
        role="combobox"
        readOnly
        inputMode="none"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={`${id}-dialog`}
        aria-required="true"
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? errorId : undefined}
        data-testid="dob-trigger"
        data-date-value={value}
        value={value ? displayDate(value, labels.placeholder) : ""}
        placeholder={labels.placeholder}
        onClick={openPicker}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
            event.preventDefault();
            openPicker();
          }
        }}
        className={`box-border h-11 w-full min-w-0 cursor-pointer appearance-none rounded-lg border bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 dark:bg-gray-700 dark:text-gray-200 dark:placeholder:text-gray-400 ${
          invalid ? "border-red-500 ring-1 ring-red-500" : "border-gray-300 dark:border-gray-600"
        }`}
      />

      {open && (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-4"
          onMouseDown={(event) => { if (event.currentTarget === event.target) closePicker(); }}
        >
          <div
            ref={dialogRef}
            id={`${id}-dialog`}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${id}-dialog-title`}
            tabIndex={-1}
            className="w-full rounded-t-2xl bg-white shadow-2xl dark:bg-gray-800 sm:max-w-md sm:rounded-2xl"
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
              <button type="button" onClick={closePicker} className="min-h-11 px-2 text-sm font-medium text-gray-600 dark:text-gray-300">
                {labels.cancel}
              </button>
              <h2 id={`${id}-dialog-title`} className="text-base font-semibold text-gray-900 dark:text-white">{labels.title}</h2>
              <button type="button" onClick={confirmDate} className="min-h-11 px-2 text-sm font-semibold text-blue-700 dark:text-blue-300">
                {labels.done}
              </button>
            </div>

            <div className="px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
              <p className="mb-2 text-center text-xs text-gray-500 dark:text-gray-400">{labels.help}</p>
              <div className="grid grid-cols-[0.8fr_1.2fr_1fr] gap-2">
                <p className="text-center text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{labels.day}</p>
                <p className="text-center text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{labels.month}</p>
                <p className="text-center text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{labels.year}</p>
                <WheelColumn id={`${id}-day-wheel`} label={labels.day} options={days} value={draft.day} onChange={(next) => update("day", next)} />
                <WheelColumn id={`${id}-month-wheel`} label={labels.month} options={months} value={draft.month} onChange={(next) => update("month", next)} />
                <WheelColumn id={`${id}-year-wheel`} label={labels.year} options={years} value={draft.year} onChange={(next) => update("year", next)} />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
