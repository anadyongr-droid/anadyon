"use client";
import React, { useEffect, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import ReservationModal from "../components/ReservationModal";
import { vehicleLabel } from "@/lib/vehicleLabel";

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
  vehicle_id: string;
  customer_name: string;
  pickup_date: string;
  return_date: string;
  status: string;
  total: number;
  daily_rate: number;
  rental_days: number;
}

const STATUS_COLORS: Record<string, string> = {
  pending:   "bg-yellow-400 text-yellow-900",
  confirmed: "bg-blue-500 text-white",
  active:    "bg-green-500 text-white",
  returned:  "bg-gray-400 text-white",
  cancelled: "bg-red-300 text-red-900 line-through opacity-60",
  no_show:   "bg-orange-400 text-white opacity-70",
  voided:    "bg-gray-200 text-gray-400 line-through opacity-50",
};

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
function parseLocalDate(s: string): Date {
  const [y, mo, d] = s.split("-").map(Number);
  return new Date(y, mo - 1, d);
}

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

  // Group vehicles by category
  const grouped = ["car", "motorbike", "bike"].map((cat) => ({
    category: cat,
    vehicles: vehicles.filter((v) => v.category === cat && v.status !== "retired"),
  })).filter((g) => g.vehicles.length > 0);

  // Get reservation bar(s) for a vehicle on a given date
  function getResForVehicleDay(vehicleId: string, date: Date): Reservation | undefined {
    const ds = toDateStr(date);
    return reservations.find(
      (r) => r.vehicle_id === vehicleId && r.pickup_date <= ds && r.return_date >= ds
    );
  }

  // Determine if this cell is the START of a reservation bar
  function isBarStart(res: Reservation, date: Date): boolean {
    return res.pickup_date === toDateStr(date);
  }

  // Calculate bar span (days visible in current view), return date inclusive
  function barSpan(res: Reservation, date: Date): number {
    const start = new Date(Math.max(parseLocalDate(res.pickup_date).getTime(), date.getTime()));
    const end = addDays(parseLocalDate(res.return_date), 1); // +1 to make return date inclusive
    const viewEnd = addDays(endDate, 1);
    const actualEnd = new Date(Math.min(end.getTime(), viewEnd.getTime()));
    return Math.max(1, Math.ceil((actualEnd.getTime() - start.getTime()) / 86400000));
  }

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
        <div className="text-gray-400 text-sm">Loading…</div>
      ) : (
        <div className="overflow-x-auto overflow-y-auto rounded-xl border border-gray-200 bg-white" style={{ maxHeight: "calc(100vh - 160px)" }}>
          <table className="border-collapse text-xs" style={{ minWidth: `${180 + days * 52}px` }}>
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
                        isToday ? "bg-blue-50 text-blue-700" : isWeekend(d) ? "text-gray-400" : "text-gray-600"
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
                    <td
                      colSpan={days + 1}
                      className="px-3 py-1.5 text-xs font-bold text-gray-700 uppercase tracking-wider sticky left-0 bg-gray-100"
                    >
                      {CATEGORY_LABELS[category]}
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
                      {/* Day cells */}
                      {dateRange.map((date) => {
                        const res = getResForVehicleDay(vehicle.id, date);
                        const isToday = toDateStr(date) === toDateStr(new Date());
                        const isMaint = vehicle.status === "maintenance";

                        if (res && isBarStart(res, date)) {
                          const span = barSpan(res, date);
                          return (
                            <td
                              key={date.toISOString()}
                              colSpan={span}
                              className="px-0 py-1 relative"
                            >
                              <button
                                onClick={() => setModal({ reservationId: res.id })}
                                title={`${res.customer_name} — €${res.total}`}
                                className={`w-full h-7 rounded flex items-center px-2 gap-1 text-left text-xs font-medium truncate cursor-pointer transition-opacity hover:opacity-90 ${STATUS_COLORS[res.status] ?? "bg-gray-300"}`}
                              >
                                <span className="truncate">{res.customer_name}</span>
                              </button>
                            </td>
                          );
                        }

                        // Cell occupied by a reservation bar (not start)
                        if (res) return null;

                        return (
                          <td
                            key={date.toISOString()}
                            className={`relative h-9 border-l border-gray-100 ${
                              isToday ? "bg-blue-50/40" : ""
                            } ${isMaint ? "bg-orange-50" : ""}`}
                            onClick={() =>
                              !isMaint && setModal({ vehicleId: vehicle.id, date: toDateStr(date) })
                            }
                          >
                            {!isMaint && (
                              <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 cursor-pointer transition-opacity">
                                <Plus size={12} className="text-gray-400" />
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
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 mt-4 text-xs text-gray-500">
        {Object.entries(STATUS_COLORS).map(([status, cls]) => (
          <div key={status} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded ${cls.split(" ")[0]}`} />
            <span className="capitalize">{status}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-orange-100 border border-orange-200" />
          <span>Maintenance</span>
        </div>
      </div>

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
