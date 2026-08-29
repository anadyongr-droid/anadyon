"use client";
import React, { useEffect, useState, useCallback } from "react";
import { statusClass } from "../lib/statusColors";
import StatusLegend from "../components/StatusLegend";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import ReservationModal from "../components/ReservationModal";
import { vehicleLabel } from "@/lib/vehicleLabel";
import { calendarRowCells, unallocatedCalendarReservations } from "@/lib/calendarReservations";

interface Vehicle {
  id: string;
  name: string;
  /** Shown beside the name so identical models are distinguishable at a glance. */
  plate?: string | null;
  category: string;
  pricing_group: string;
  status: string;
  transmission?: string | null;
}

interface Reservation {
  id: string;
  vehicle_id: string | null;
  customer_name: string;
  pickup_date: string;
  return_date: string;
  status: string;
  source: "website" | "admin";
  total: number;
  daily_rate: number;
  rental_days: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  car: "Cars",
  motorbike: "Motorbikes",
  bike: "Bikes",
};

function addDays(date: Date, n: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function toDateStr(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Parse a YYYY-MM-DD string as local midnight (avoids UTC shift)
function formatDay(d: Date) {
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function isWeekend(d: Date) {
  const day = d.getDay();
  return day === 0 || day === 6;
}

export default function CalendarPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [startDate, setStartDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [days, setDays] = useState(14);
  const [modal, setModal] = useState<{ vehicleId?: string; date?: string; reservationId?: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const endDate = addDays(startDate, days - 1);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [vRes, rRes] = await Promise.all([
      fetch("/api/admin/vehicles"),
      fetch(`/api/admin/reservations?from=${toDateStr(addDays(startDate, -30))}&to=${toDateStr(addDays(endDate, 30))}`),
    ]);
    const [v, r] = await Promise.all([vRes.json(), rRes.json()]);
    setVehicles(v);
    setReservations(r);
    setLoading(false);
  }, [startDate, days]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadData(); }, [loadData]);

  const dateRange: Date[] = Array.from({ length: days }, (_, i) => addDays(startDate, i));
  const unallocated = unallocatedCalendarReservations(
    reservations,
    toDateStr(startDate),
    toDateStr(endDate),
  );

  // Group vehicles by category
  const grouped = ["car", "motorbike", "bike"].map((cat) => ({
    category: cat,
    vehicles: vehicles.filter((v) => v.category === cat && v.status !== "retired"),
  })).filter((g) => g.vehicles.length > 0);

  return (
    <div className="p-6 min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-900">Reservation Calendar</h1>
        <div className="flex items-center gap-3">
          {/* Days toggle */}
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
          >
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={21}>21 days</option>
            <option value={30}>30 days</option>
          </select>
          {/* Navigation */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setStartDate((d) => addDays(d, -days))}
              className="p-1.5 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setStartDate(new Date(new Date().setHours(0, 0, 0, 0)))}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
            >
              Today
            </button>
            <button
              onClick={() => setStartDate((d) => addDays(d, days))}
              className="p-1.5 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <button
            onClick={() => setModal({})}
            className="flex items-center gap-1.5 bg-blue-700 text-white text-sm font-semibold px-4 py-1.5 rounded-lg hover:bg-blue-800 transition"
          >
            <Plus size={15} /> New reservation
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-gray-600 text-sm">Loading…</div>
      ) : (
        <>
          {unallocated.length > 0 && (
            <section className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-amber-950">Pending vehicle allocation</h2>
                  <p className="mt-0.5 text-xs text-amber-800">
                    These reservations are already in the system but have not yet been assigned a vehicle, so they cannot appear on a vehicle row below.
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-900">
                  {unallocated.length}
                </span>
              </div>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {unallocated.map((reservation) => (
                  <button
                    key={reservation.id}
                    onClick={() => setModal({ reservationId: reservation.id })}
                    className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-left transition hover:border-amber-400 hover:shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-gray-900">{reservation.customer_name}</span>
                      <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${statusClass(reservation.status)}`}>
                        {reservation.status}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-gray-600">
                      {reservation.pickup_date} → {reservation.return_date}
                    </div>
                    <div className="mt-1 text-xs text-amber-800">
                      {reservation.source === "website" ? "Website quote" : "Office / walk-in"}
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          <div className="overflow-auto rounded-xl border border-gray-200 bg-white" style={{ maxHeight: "calc(100dvh - 260px)" }}>
            <table className="admin-table border-collapse text-xs" style={{ minWidth: `${180 + days * 52}px` }}>
            <thead className="sticky top-0 z-20">
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="w-44 px-3 py-2.5 text-left text-gray-500 font-medium sticky left-0 bg-gray-50 z-30 border-r border-gray-200">
                  Vehicle
                </th>
                {dateRange.map((d) => {
                  const isToday = toDateStr(d) === toDateStr(new Date());
                  return (
                    <th
                      key={d.toISOString()}
                      className={`w-13 px-1 py-2.5 text-center font-medium whitespace-nowrap ${
                        isToday ? "bg-blue-50 text-blue-700" : isWeekend(d) ? "text-gray-600" : "text-gray-600"
                      }`}
                    >
                      {formatDay(d)}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {grouped.map(({ category, vehicles: cvehicles }) => (
                <React.Fragment key={category}>
                  {/*
                    Category header row.

                    Three levels of separation now share this table, and they
                    have to rank unambiguously or none of them reads: the
                    category header is strongest, a change of model next, an
                    ordinary row lightest. So this is bold on a darker grey with
                    a solid rule above, sitting clearly above the 2px rule that
                    marks a model change.

                    The weight alone was not the problem — it was already
                    semibold. At gray-500 on a gray-50 row it simply had too
                    little contrast to register as a heading.
                  */}
                  <tr className="bg-gray-100 border-t-2 border-t-gray-400 border-b border-b-gray-200">
                    {/* The cell spans the whole table, so `sticky left-0` on it can
                        never offset: a sticky box cannot move outside its own
                        containing block, and here the two are the same width.
                        Measured on the live page — this band slid the full 300px
                        of scroll while the vehicle-name cells beside it held at 0.
                        Pinning an inner element keeps the label in view instead. */}
                    <td
                      colSpan={days + 1}
                      className="px-3 py-1.5 text-xs font-bold text-gray-700 uppercase tracking-wider bg-gray-100"
                    >
                      <span className="sticky left-3 inline-block">
                        {CATEGORY_LABELS[category]}
                      </span>
                    </td>
                  </tr>
                  {cvehicles.map((vehicle, i) => {
                    // A heavier rule where the model changes, so a block of six
                    // Kymco 50ccs reads as one block rather than six unrelated
                    // rows. The category header already separates cars from
                    // motorbikes; this separates models within a category.
                    const newModel = i > 0 && cvehicles[i - 1].name !== vehicle.name;
                    return (
                    <tr
                      key={vehicle.id}
                      className={`hover:bg-gray-50/50 transition-colors ${
                        newModel
                          ? "border-t-2 border-t-gray-300 border-b border-b-gray-100"
                          : "border-b border-gray-100"
                      }`}
                    >
                      {/* Vehicle name */}
                      <td className="px-3 py-1.5 text-gray-700 font-medium sticky left-0 bg-white border-r border-gray-200 z-10">
                        <div>
                          <div className="flex items-center gap-1.5">
                            {vehicle.status === "maintenance" && (
                              <span className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" />
                            )}
                            {/*
                              The model and plate are one unit and must not break
                              across lines — a plate wrapped onto its own row
                              reads as a second vehicle in a dense table.
                            */}
                            <span className="whitespace-nowrap">{vehicleLabel(vehicle)}</span>
                          </div>
                          {/*
                            Its own line, against the right edge: on a line of
                            its own it cannot push the plate into wrapping, and
                            against the right edge every badge lands on the same
                            vertical line, so they are found by scanning one
                            column rather than by reading each row.

                            Cars only. Every scooter in the fleet is automatic,
                            so marking those would put a badge on two thirds of
                            the rows and tell nobody anything. Among cars it is
                            the one distinction a customer actually asks for,
                            and the one the substitution guard refuses to get
                            wrong — so it earns the space here.
                          */}
                          {vehicle.category === "car" &&
                            vehicle.transmission?.toLowerCase().startsWith("auto") && (
                              <div className="flex justify-end">
                                <span
                                  title="Automatic gearbox"
                                  className="mt-0.5 rounded bg-blue-100 px-1 py-0.5 text-[10px] font-semibold leading-none text-blue-700"
                                >
                                  AUT
                                </span>
                              </div>
                            )}
                        </div>
                      </td>
                      {/*
                        Day cells, from a single pass that emits exactly the
                        columns it consumes. The previous version decided each
                        column with two independent predicates and emitted no
                        <td> at all for a covered day whose bar had not
                        rendered — which is every day of a rental that began
                        before the visible window. The row came up short and
                        every bar to its right slid a day left, while the
                        header stayed correct, so a booking appeared to have
                        moved. See lib/calendarReservations.ts.
                      */}
                      {calendarRowCells(
                        reservations.filter((r) => r.vehicle_id === vehicle.id),
                        dateRange.map(toDateStr),
                      ).map((cell, cellIndex) => {
                        const isMaint = vehicle.status === "maintenance";

                        if (cell.kind === "bar") {
                          const res = cell.reservation;
                          return (
                            <td
                              key={`${res.id}-${cellIndex}`}
                              colSpan={cell.span}
                              className="px-0 py-1 relative"
                            >
                              <button
                                onClick={() => setModal({ reservationId: res.id })}
                                title={`${res.customer_name} — €${res.total}`}
                                className={`w-full h-7 rounded flex items-center px-2 gap-1 text-left text-xs font-medium truncate cursor-pointer transition-opacity hover:opacity-90 ${statusClass(res.status, "solid")}`}
                              >
                                {/*
                                  A bar clipped by the edge of the view says so.
                                  Without it a rental that started last week
                                  reads as one starting on the first visible
                                  day — a different wrong answer from the one
                                  this fix removes.
                                */}
                                {cell.continuesBefore && <span aria-hidden>‹</span>}
                                <span className="truncate">{res.customer_name}</span>
                                {cell.continuesAfter && <span aria-hidden className="ml-auto">›</span>}
                              </button>
                            </td>
                          );
                        }

                        const isToday = cell.date === toDateStr(new Date());
                        return (
                          <td
                            key={cell.date}
                            className={`relative h-9 border-l border-gray-100 ${
                              isToday ? "bg-blue-50/40" : ""
                            } ${isMaint ? "bg-orange-50" : ""}`}
                            onClick={() =>
                              !isMaint && setModal({ vehicleId: vehicle.id, date: cell.date })
                            }
                          >
                            {!isMaint && (
                              <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 cursor-pointer transition-opacity">
                                <Plus size={12} className="text-gray-600" />
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
            </table>
          </div>
        </>
      )}

      <StatusLegend />

      {/* Modal */}
      {modal !== null && (
        <ReservationModal
          vehicleId={modal.vehicleId}
          date={modal.date}
          reservationId={modal.reservationId}
          vehicles={vehicles}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); loadData(); }}
        />
      )}
    </div>
  );
}
