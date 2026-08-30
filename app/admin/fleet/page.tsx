"use client";
import { useCallback, useEffect, useState } from "react";
import { statusClass } from "../lib/statusColors";
import { AlertTriangle, ClipboardCheck, Clock } from "lucide-react";
import VehicleModal, { type FleetVehicle } from "../components/VehicleModal";
import { worstSeverity, rentalBar, vehicleDateStatuses, type Severity } from "@/lib/fleetStatus";
import { damageLabel, type VehicleDamageSummary } from "@/lib/openDamage";
import { useIsAdmin } from "../RoleContext";

/** A change staff proposed and nobody has decided yet. */
interface ChangeRequest {
  id: string;
  vehicle_id: string;
  changes: Record<string, unknown>;
  before: Record<string, unknown>;
  note: string | null;
  requested_at: string;
  vehicles?: { name?: string; plate?: string | null } | null;
}

/** Column name → what the fleet form calls it. */
function fieldLabel(column: string): string {
  return column.replace(/_/g, " ").replace(/\bkteo\b/i, "KTEO").replace(/^./, (c) => c.toUpperCase());
}

/** null and "" both mean "nothing was there", and both read badly as themselves. */
function shown(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

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

  /**
   * Vehicles currently out of the fleet, by id.
   *
   * §7.4: an open block is a hard stop, and the status dropdown knows nothing
   * about it. A row reading "available" for a car in a workshop is how staff
   * learn to disbelieve the refusal they get later.
   */
  const [outOfFleet, setOutOfFleet] = useState<Record<string, { starts_on: string; reason: string; expected_return: string | null }>>({});

  /**
   * Unrepaired damage, per vehicle.
   *
   * The count existed only inside one vehicle's Damages tab, so the fleet-wide
   * question needed twenty-nine modals. It carries no repair cost — see
   * lib/openDamage.ts for why that stops at the ledger.
   */
  const [damage, setDamage] = useState<Record<string, VehicleDamageSummary>>({});

  /**
   * Changes staff have proposed and nobody has decided yet.
   *
   * Everyone can see the queue: the person who raised a request should be able
   * to tell whether it was approved without asking. Only an administrator sees
   * the Approve and Reject buttons, and only an administrator's PATCH is
   * accepted — the check is on the route, not on the rendering.
   */
  // Presentation only — the change-requests route refuses a staff PATCH
  // regardless of what renders here.
  const isAdmin = useIsAdmin();
  const [pending, setPending] = useState<ChangeRequest[]>([]);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [decideError, setDecideError] = useState("");

  const load = useCallback(async () => {
    // Four independent reads. Awaiting them in turn would show the list, then
    // the blocks, then the damage, and a row that says "available" before its
    // damage line arrives is the same lie the block line was added to stop.
    const [vehiclesRes, blocksRes, damageRes, pendingRes] = await Promise.all([
      fetch("/api/admin/vehicles"),
      fetch("/api/admin/vehicles/blocks?open=1"),
      fetch("/api/admin/vehicles/damages"),
      fetch("/api/admin/vehicles/change-requests?status=pending"),
    ]);
    if (vehiclesRes.ok) setVehicles(await vehiclesRes.json());
    if (blocksRes.ok) {
      const rows: Array<{ vehicle_id: string; starts_on: string; reason: string; expected_return: string | null }> =
        await blocksRes.json();
      setOutOfFleet(Object.fromEntries(rows.map(b => [b.vehicle_id, b])));
    }
    if (damageRes.ok) {
      const rows: VehicleDamageSummary[] = await damageRes.json();
      setDamage(Object.fromEntries(rows.map(d => [d.vehicle_id, d])));
    }
    if (pendingRes.ok) setPending(await pendingRes.json());
  }, []);

  async function decide(id: string, decision: "approve" | "reject") {
    setDeciding(id); setDecideError("");
    const res = await fetch("/api/admin/vehicles/change-requests", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, decision }),
    });
    setDeciding(null);
    if (!res.ok) {
      // A 409 here is usually the vehicle having moved since the request was
      // made — worth showing verbatim, because the message names the field.
      setDecideError((await res.json().catch(() => ({}))).error ?? "Could not record that decision.");
    }
    await load();
  }

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
      {pending.length > 0 && (
        <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50/60 px-5 py-4">
          <div className="flex items-center gap-2 mb-2">
            <ClipboardCheck size={16} className="text-blue-700 shrink-0" />
            <strong className="text-sm text-blue-900">
              {pending.length} {pending.length === 1 ? "change" : "changes"} waiting for approval
            </strong>
          </div>
          {!isAdmin && (
            <p className="text-xs text-blue-800 mb-2">
              An administrator has to approve these before they take effect. The vehicle
              still shows its current values until then.
            </p>
          )}
          {decideError && (
            <div role="alert" className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              {decideError}
            </div>
          )}
          <ul className="space-y-2">
            {pending.map(r => (
              <li key={r.id} className="rounded-lg border border-blue-200 bg-white px-3 py-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-800">
                      {r.vehicles?.name ?? "Vehicle"}{r.vehicles?.plate ? ` (${r.vehicles.plate})` : ""}
                    </div>
                    <ul className="mt-0.5 space-y-0.5">
                      {Object.keys(r.changes).map(k => (
                        <li key={k} className="text-xs text-gray-600">
                          <span className="font-medium text-gray-700">{fieldLabel(k)}:</span>{" "}
                          <span className="line-through text-gray-500">{shown(r.before[k])}</span>{" "}
                          → <span className="text-gray-900">{shown(r.changes[k])}</span>
                        </li>
                      ))}
                    </ul>
                    {r.note && <div className="text-xs text-gray-500 mt-0.5 italic">{r.note}</div>}
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => decide(r.id, "reject")}
                        disabled={deciding === r.id}
                        className="min-h-11 px-3 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        onClick={() => decide(r.id, "approve")}
                        disabled={deciding === r.id}
                        className="min-h-11 px-4 rounded-lg bg-blue-700 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:opacity-50"
                      >
                        {deciding === r.id ? "Saving…" : "Approve"}
                      </button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

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
                        {outOfFleet[v.id] && (
                          <div className="text-xs text-orange-700 mt-0.5">
                            Out of fleet since {outOfFleet[v.id].starts_on} ({outOfFleet[v.id].reason})
                            {outOfFleet[v.id].expected_return ? ` — expected ${outOfFleet[v.id].expected_return}` : " — no estimate"}
                          </div>
                        )}
                        {b.barred && <div className="text-xs text-red-600 mt-0.5">{b.reason}</div>}
                        {damage[v.id] && (
                          // Amber, not red: this is a fact to weigh, not a bar
                          // on renting. Red is reserved for the two statutory
                          // expiries that genuinely void cover.
                          <div className="text-xs text-amber-700 mt-0.5">
                            {damageLabel(damage[v.id])}
                            {damage[v.id].daysOpen > 0 && ` — open ${damage[v.id].daysOpen} day${damage[v.id].daysOpen === 1 ? "" : "s"}`}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-gray-500 text-xs font-mono">{v.plate || "—"}</td>
                      <td className="px-3 py-3">
                        <span className="flex items-center gap-2 text-xs text-gray-600">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${DOT[sev]}`} />
                          {sev === "ok" ? "All valid" : worst?.message ?? "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                        {outOfFleet[v.id] ? (
                          // Deliberately not a dropdown. Status cannot end a
                          // block, so offering a control that looks as though it
                          // might would be a lie about what the system will do.
                          // Putting the car back happens in Availability, where
                          // it is attributed.
                          <span className="text-xs font-medium px-2 py-1 rounded-full bg-orange-100 text-orange-800">
                            out of fleet
                          </span>
                        ) : (
                          <select
                            value={v.status}
                            disabled={saving === v.id}
                            onChange={e => updateStatus(v.id, e.target.value)}
                            className={`text-xs font-medium px-2 py-1 rounded-full border-0 cursor-pointer ${statusClass(v.status)}`}
                          >
                            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        )}
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
