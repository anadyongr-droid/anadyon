"use client";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Clock, ArrowDownLeft, ArrowUpRight, Wrench, Phone, Plane } from "lucide-react";
import { vehicleLabel } from "@/lib/vehicleLabel";

interface Ev {
  kind: "pickup" | "return";
  time: string;
  reservation: {
    id: string; customer_name: string | null; customer_phone: string | null;
    flight_number: string | null; location: string | null; status: string | null;
  };
  vehicle: { id: string; name: string; plate: string | null } | null;
  licence: { severity: string; message: string; blocks: boolean } | null;
  blocked: string | null;
  missing: string[];
}
interface Day {
  date: string;
  events: Ev[];
  overdue: { id: string; customer_name: string | null; customer_phone: string | null; vehicle: string | null; hoursLate: number; urgency: string }[];
  fleet: { id: string; name: string; plate: string | null; barred: string | null; paperwork: string | null; service: string | null }[];
  counts: { pickups: number; returns: number; overdue: number; fleetAttention: number; blockers: number };
}

export default function TodayPage() {
  const [day, setDay] = useState<Day | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/operations/today");
    if (!res.ok) { setError("Could not load today's operations."); return; }
    setDay(await res.json());
  }, []);

  useEffect(() => {
    load();
    // The day moves under the screen — a return becomes overdue while it is
    // open. Refreshed rather than left showing a stale morning.
    const t = setInterval(load, 120_000);
    return () => clearInterval(t);
  }, [load]);

  if (error) return <div className="p-6 text-sm text-red-600">{error}</div>;
  if (!day) return <div className="p-6 text-sm text-gray-600">Loading…</div>;

  const nothing =
    day.events.length === 0 && day.overdue.length === 0 && day.fleet.length === 0;

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-xl font-bold text-gray-900 mb-1">Today</h1>
      <p className="text-sm text-gray-500 mb-6">
        {day.counts.pickups} out, {day.counts.returns} back
        {day.counts.overdue > 0 && ` · ${day.counts.overdue} overdue`}
        {day.counts.blockers > 0 && ` · ${day.counts.blockers} need attention before handover`}
      </p>

      {/* Overdue first. A vehicle that has not come back outranks everything
          scheduled, because every later booking on it is now at risk. */}
      {day.overdue.length > 0 && (
        <div className="mb-6 space-y-2">
          {day.overdue.map(o => (
            <div key={o.id}
              className={`flex items-start gap-2 text-sm rounded-lg px-4 py-2.5 border ${
                o.urgency === "critical"
                  ? "text-red-800 bg-red-50 border-red-200"
                  : "text-amber-800 bg-amber-50 border-amber-200"
              }`}>
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <div className="flex-1">
                <strong>{o.vehicle ?? "Vehicle"} is {o.hoursLate}h overdue.</strong>{" "}
                {o.customer_name}
                {o.customer_phone && (
                  <a href={`tel:${o.customer_phone}`} className="inline-flex items-center gap-1 ml-2 underline">
                    <Phone size={12} /> {o.customer_phone}
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {nothing && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-600">
          Nothing scheduled today, nothing overdue, and no vehicle needs attention.
        </div>
      )}

      {/* The day, in clock order — collections and returns interleaved, because
          that is how the counter actually experiences them. */}
      {day.events.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900 text-sm">Movements</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {day.events.map((e, i) => {
              const problem = e.blocked || e.licence?.blocks;
              return (
                <div key={i} className={`px-5 py-3 flex items-start gap-4 ${problem ? "bg-red-50/40" : ""}`}>
                  <div className="w-12 shrink-0 text-sm font-mono text-gray-700 pt-0.5 tabular-nums">{e.time}</div>
                  <div className={`shrink-0 mt-0.5 ${e.kind === "pickup" ? "text-blue-600" : "text-green-600"}`}>
                    {e.kind === "pickup" ? <ArrowUpRight size={16} /> : <ArrowDownLeft size={16} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-900">
                      <span className="font-medium">{e.reservation.customer_name || "—"}</span>
                      <span className="text-gray-600"> · </span>
                      <span className="text-gray-600">{e.vehicle?.name ?? "no vehicle assigned"}</span>
                      {e.vehicle?.plate && <span className="text-gray-600 font-mono text-xs ml-1.5">{e.vehicle.plate}</span>}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap items-center gap-x-3">
                      <span>{e.kind === "pickup" ? "Collect" : "Return"} · {e.reservation.location ?? "—"}</span>
                      {e.reservation.flight_number && (
                        <span className="inline-flex items-center gap-1"><Plane size={11} />{e.reservation.flight_number}</span>
                      )}
                      {e.reservation.customer_phone && (
                        <a href={`tel:${e.reservation.customer_phone}`} className="inline-flex items-center gap-1 hover:text-gray-700">
                          <Phone size={11} />{e.reservation.customer_phone}
                        </a>
                      )}
                    </div>

                    {e.blocked && (
                      <div className="text-xs text-red-700 mt-1.5">⚠ {e.blocked} — this vehicle must not go out.</div>
                    )}
                    {e.licence?.blocks && (
                      <div className="text-xs text-red-700 mt-1">⚠ {e.licence.message}.</div>
                    )}
                    {!e.licence?.blocks && e.licence?.severity === "expiring" && (
                      <div className="text-xs text-amber-700 mt-1">{e.licence.message}.</div>
                    )}
                    {e.missing.length > 0 && (
                      <div className="text-xs text-amber-700 mt-1">
                        Still needed: {e.missing.join(", ")}.
                      </div>
                    )}
                  </div>
                  <a href={`/admin/reservations/${e.reservation.id}`}
                    className="text-xs text-blue-600 hover:underline shrink-0 pt-0.5">Open</a>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {day.fleet.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
            <Wrench size={14} className="text-gray-500" />
            <h2 className="font-semibold text-gray-900 text-sm">Fleet needing attention</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {day.fleet.map(v => (
              <div key={v.id} className="px-5 py-2.5 flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm text-gray-900">
                    {vehicleLabel(v)}
                    {v.plate && <span className="text-gray-600 font-mono text-xs ml-2">{v.plate}</span>}
                  </div>
                  <div className="text-xs mt-0.5 space-y-0.5">
                    {v.barred && <div className="text-red-700">Cannot be rented — {v.barred}</div>}
                    {v.paperwork && !v.barred && <div className="text-amber-700 flex items-center gap-1"><Clock size={11} />{v.paperwork}</div>}
                    {v.service && <div className="text-gray-500">{v.service}</div>}
                  </div>
                </div>
                <a href="/admin/fleet" className="text-xs text-blue-600 hover:underline shrink-0">Fleet</a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
