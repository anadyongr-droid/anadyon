"use client";
import { useCallback, useEffect, useState } from "react";
import { statusClass } from "../lib/statusColors";
import { AlertTriangle, Clock } from "lucide-react";
import VehicleModal, { type FleetVehicle } from "../components/VehicleModal";
import { worstSeverity, rentalBar, vehicleDateStatuses, type Severity } from "@/lib/fleetStatus";

const STATUS_OPTIONS = ["available", "maintenance", "retired"];

/**
 * Grouped by the sellable category rather than by physical vehicle.
 *
 * A customer buys "Cat B" and is allocated a specific car; the category is the
 * product. Grouping this way costs nothing today and is the shape a partner
 * fleet would need, where a supplier offers a category and never a plate.
 */
const GROUP_LABELS: Record<string, string> = {
  car_a: "Cars — Category A",
  car_b: "Cars — Category B",
  car_c: "Cars — Category C (automatic)",
  motorbike_a: "Motorbikes — 50cc",
  motorbike_b: "Motorbikes — 125cc+",
  bike: "Bicycles",
};
const GROUP_ORDER = ["car_a", "car_b", "car_c", "motorbike_a", "motorbike_b", "bike"];

const DOT: Record<Severity, string> = {
  expired: "bg-red-500", "due-soon": "bg-amber-500", unknown: "bg-gray-300", ok: "bg-green-500",
};

export default function FleetPage() {
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [open, setOpen] = useState<FleetVehicle | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/vehicles");
    if (res.ok) setVehicles(await res.json());
  }, []);

  useEffect(() => { load(); }, [load]);

  async function updateStatus(id: string, status: string) {
    setSaving(id);
    await fetch(`/api/admin/vehicles/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
    });
    setVehicles(prev => prev.map(v => (v.id === id ? { ...v, status } : v)));
    setSaving(null);
  }

  // Anything that stops a vehicle earning, or is about to.
  const barred = vehicles.filter(v => rentalBar(v).barred);
  const expiringSoon = vehicles.filter(
    v => !rentalBar(v).barred && worstSeverity(v) === "due-soon"
  );
  const unrecorded = vehicles.filter(v => worstSeverity(v) === "unknown");

  const grouped = GROUP_ORDER
    .map(g => ({ group: g, vehicles: vehicles.filter(v => v.pricing_group === g) }))
    .filter(g => g.vehicles.length > 0);

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-xl font-bold text-gray-900 mb-1">Fleet</h1>
      <p className="text-sm text-gray-500 mb-6">
        {vehicles.length} vehicles. Select one to record statutory dates, costs and damage.
      </p>

      {/* What needs attention, before the list of what does not. */}
      {(barred.length > 0 || expiringSoon.length > 0) && (
        <div className="space-y-2 mb-6">
          {barred.length > 0 && (
            <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <div>
                <strong>{barred.length} {barred.length === 1 ? "vehicle" : "vehicles"} cannot be rented.</strong>{" "}
                {barred.map(v => v.name).join(", ")}
              </div>
            </div>
          )}
          {expiringSoon.length > 0 && (
            <div className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5">
              <Clock size={16} className="mt-0.5 shrink-0" />
              <div>
                <strong>{expiringSoon.length} expiring soon.</strong>{" "}
                {expiringSoon.map(v => {
                  const s = vehicleDateStatuses(v).find(x => x.severity === "due-soon");
                  return `${v.name} (${s?.label.toLowerCase()})`;
                }).join(", ")}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="space-y-5">
        {grouped.map(({ group, vehicles: vs }) => (
          <div key={group} className="bg-white rounded-xl border border-gray-200 admin-table-wrap">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900 text-sm">{GROUP_LABELS[group] ?? group}</h2>
              <span className="text-xs text-gray-500">{vs.length}</span>
            </div>
            <table className="admin-table w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-500">
                  <th className="text-left px-5 py-2 font-medium">Vehicle</th>
                  <th className="text-left px-3 py-2 font-medium">Plate</th>
                  <th className="text-left px-3 py-2 font-medium">Paperwork</th>
                  <th className="text-center px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {vs.map(v => {
                  const sev = worstSeverity(v);
                  const b = rentalBar(v);
                  const worst = vehicleDateStatuses(v)[0];
                  return (
                    <tr
                      key={v.id}
                      onClick={() => setOpen(v)}
                      className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
                    >
                      <td className="px-5 py-3">
                        <div className="font-medium text-gray-800">{v.name}</div>
                        {b.barred && <div className="text-xs text-red-600 mt-0.5">{b.reason}</div>}
                      </td>
                      <td className="px-3 py-3 text-gray-500 text-xs font-mono">{v.plate || "—"}</td>
                      <td className="px-3 py-3">
                        <span className="flex items-center gap-2 text-xs text-gray-600">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${DOT[sev]}`} />
                          {sev === "ok" ? "All valid" : worst?.message ?? "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                        <select
                          value={v.status}
                          disabled={saving === v.id}
                          onChange={e => updateStatus(v.id, e.target.value)}
                          className={`text-xs font-medium px-2 py-1 rounded-full border-0 cursor-pointer ${statusClass(v.status)}`}
                        >
                          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {unrecorded.length > 0 && (
        <p className="text-xs text-gray-600 mt-5">
          {unrecorded.length} {unrecorded.length === 1 ? "vehicle has" : "vehicles have"} no statutory dates recorded.
          Nothing is assumed from an empty field — a missing KTEO date is not treated as expired.
        </p>
      )}

      {open && (
        <VehicleModal
          vehicle={open}
          onClose={() => setOpen(null)}
          onSaved={() => { setOpen(null); load(); }}
        />
      )}
    </div>
  );
}
