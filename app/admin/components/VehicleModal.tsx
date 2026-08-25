"use client";
import { useEffect, useState, useCallback } from "react";
import { X, Plus, Trash2, AlertTriangle } from "lucide-react";
import { useModalBehavior } from "@/app/hooks/useModalBehavior";
import Select from "./Select";
import { vehicleDateStatuses, rentalBar, type Severity } from "@/lib/fleetStatus";

export interface FleetVehicle {
  id: string;
  name: string;
  category: string;
  pricing_group: string;
  status: string;
  plate?: string | null;
  make?: string | null;
  transmission?: string | null;
  turnaround_minutes?: number | null;
  registration_date?: string | null;
  road_tax_paid_until?: string | null;
  kteo_expiry?: string | null;
  insurance_provider?: string | null;
  insurance_policy_no?: string | null;
  insurance_expiry?: string | null;
  last_service_date?: string | null;
  next_service_due?: string | null;
  service_interval_km?: number | null;
  odometer_km?: number | null;
  purchase_date?: string | null;
  purchase_price?: number | null;
  vehicle_notes?: string | null;
}

interface Cost {
  id: string; cost_type: string; amount: number; incurred_on: string;
  supplier?: string | null; invoice_ref?: string | null; notes?: string | null;
}
interface Damage {
  id: string; description: string; severity: string; reported_on: string;
  repair_cost?: number | null; charged_to_customer?: boolean; repaired_on?: string | null;
}
interface Ledger {
  costs: Cost[];
  damages: Damage[];
  margin: { revenue: number; costs: number; margin: number; marginPct: number | null; costRatio: number | null };
  rentals: { count: number; days: number; revenuePerDay: number | null };
  openDamages: number;
}

const COST_TYPES = ["road_tax","insurance","kteo","service","repair","damage","tyres","cleaning","other"];
const SEV_STYLE: Record<Severity, string> = {
  expired:    "bg-red-50 text-red-700 border-red-200",
  "due-soon": "bg-amber-50 text-amber-800 border-amber-200",
  unknown:    "bg-gray-50 text-gray-500 border-gray-200",
  ok:         "bg-green-50 text-green-700 border-green-200",
};

const input = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm";
const euro = (n: number) => `€${n.toFixed(2)}`;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

export default function VehicleModal({
  vehicle, onClose, onSaved,
}: { vehicle: FleetVehicle; onClose: () => void; onSaved: () => void }) {
  const dialogRef = useModalBehavior<HTMLDivElement>(onClose);
  const [form, setForm] = useState<FleetVehicle>(vehicle);
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [tab, setTab] = useState<"details" | "costs" | "damages">("details");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Costs and damages are admin-only; a staff session gets 403 here and the
  // financial tabs stay empty rather than the screen failing outright.
  const [restricted, setRestricted] = useState(false);

  const set = (k: keyof FleetVehicle, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  const loadLedger = useCallback(async () => {
    const res = await fetch(`/api/admin/vehicles/${vehicle.id}/ledger`);
    if (res.status === 403) { setRestricted(true); return; }
    if (res.ok) setLedger(await res.json());
  }, [vehicle.id]);

  useEffect(() => { loadLedger(); }, [loadLedger]);

  const statuses = vehicleDateStatuses(form);
  const bar = rentalBar(form);

  async function save() {
    setSaving(true); setError("");
    // Empty date and numeric inputs arrive as ""; Postgres rejects those for
    // typed columns.
    const payload: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(form)) {
      if (k === "id") continue;
      payload[k] = v === "" ? null : v;
    }
    const res = await fetch(`/api/admin/vehicles/${vehicle.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? "Could not save."); return; }
    onSaved();
  }

  async function addRow(kind: "cost" | "damage", row: Record<string, unknown>) {
    const res = await fetch(`/api/admin/vehicles/${vehicle.id}/ledger`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, ...row }),
    });
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? "Could not add."); return false; }
    await loadLedger();
    return true;
  }

  async function removeRow(kind: "cost" | "damage", rowId: string) {
    await fetch(`/api/admin/vehicles/${vehicle.id}/ledger?kind=${kind}&rowId=${rowId}`, { method: "DELETE" });
    await loadLedger();
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start sm:items-center justify-center p-4">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="vehicle-dialog-title" tabIndex={-1} className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[calc(100dvh-2rem)] flex flex-col">

        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 id="vehicle-dialog-title" className="font-bold text-gray-900">{form.name}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {form.plate || "no plate recorded"} · {form.transmission ?? "n/a"} · {form.pricing_group}
            </p>
          </div>
          <button type="button" aria-label="Close vehicle dialog" onClick={onClose} className="text-gray-600 hover:text-gray-900 p-2 -mr-2"><X size={20} /></button>
        </div>

        {/* The single most important thing about a vehicle: may it go out? */}
        {bar.barred && (
          <div className="mx-6 mt-4 flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span><strong>Not available to rent.</strong> {bar.reason}.</span>
          </div>
        )}

        <div className="px-6 pt-4 flex gap-1 border-b border-gray-100 shrink-0">
          {(["details","costs","damages"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-2 text-sm font-medium rounded-t-lg -mb-px border-b-2 transition ${
                tab === t ? "border-blue-600 text-blue-700" : "border-transparent text-gray-500 hover:text-gray-700"
              }`}>
              {t === "details" ? "Details" : t === "costs" ? `Costs${ledger ? ` (${ledger.costs.length})` : ""}`
                : `Damages${ledger?.openDamages ? ` (${ledger.openDamages} open)` : ""}`}
            </button>
          ))}
        </div>

        {tab === "details" && (
          <div className="p-6 space-y-5 overflow-y-auto overscroll-contain flex-1 min-h-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {statuses.map(s => (
                <div key={s.key} className={`text-xs px-3 py-2 rounded-lg border ${SEV_STYLE[s.severity]}`}>
                  <div className="font-medium">{s.label}</div>
                  <div className="mt-0.5">{s.message}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Registration plate">
                <input className={input} value={form.plate ?? ""} onChange={e => set("plate", e.target.value.toUpperCase())} />
              </Field>
              <Field label="Make">
                <input className={input} value={form.make ?? ""} onChange={e => set("make", e.target.value)} />
              </Field>
              <Field label="KTEO expiry">
                <input type="date" className={input} value={form.kteo_expiry ?? ""} onChange={e => set("kteo_expiry", e.target.value)} />
              </Field>
              <Field label="Road tax paid until">
                <input type="date" className={input} value={form.road_tax_paid_until ?? ""} onChange={e => set("road_tax_paid_until", e.target.value)} />
              </Field>
              <Field label="Insurance provider">
                <input className={input} value={form.insurance_provider ?? ""} onChange={e => set("insurance_provider", e.target.value)} />
              </Field>
              <Field label="Policy number">
                <input className={input} value={form.insurance_policy_no ?? ""} onChange={e => set("insurance_policy_no", e.target.value)} />
              </Field>
              <Field label="Insurance expiry">
                <input type="date" className={input} value={form.insurance_expiry ?? ""} onChange={e => set("insurance_expiry", e.target.value)} />
              </Field>
              <Field label="Odometer (km)">
                <input type="number" min="0" className={input} value={form.odometer_km ?? ""} onChange={e => set("odometer_km", e.target.value === "" ? "" : Number(e.target.value))} />
              </Field>
              <Field label="Last service">
                <input type="date" className={input} value={form.last_service_date ?? ""} onChange={e => set("last_service_date", e.target.value)} />
              </Field>
              <Field label="Next service due">
                <input type="date" className={input} value={form.next_service_due ?? ""} onChange={e => set("next_service_due", e.target.value)} />
              </Field>
              <Field label="Turnaround (minutes)">
                <input type="number" min="0" max="1440" className={input} value={form.turnaround_minutes ?? ""} onChange={e => set("turnaround_minutes", e.target.value === "" ? "" : Number(e.target.value))} />
              </Field>
              <Field label="Purchase price (€)">
                <input type="number" min="0" step="0.01" className={input} value={form.purchase_price ?? ""} onChange={e => set("purchase_price", e.target.value === "" ? "" : Number(e.target.value))} />
              </Field>
            </div>

            <Field label="Notes">
              <textarea rows={2} className={input} value={form.vehicle_notes ?? ""} onChange={e => set("vehicle_notes", e.target.value)} />
            </Field>

            {ledger && (
              <div className="border-t border-gray-100 pt-4">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Contribution</div>
                <div className="grid grid-cols-4 gap-3 text-sm">
                  <div><div className="text-xs text-gray-500">Revenue</div><div className="font-semibold tabular-nums">{euro(ledger.margin.revenue)}</div></div>
                  <div><div className="text-xs text-gray-500">Costs</div><div className="font-semibold tabular-nums">{euro(ledger.margin.costs)}</div></div>
                  <div>
                    <div className="text-xs text-gray-500">Contribution</div>
                    <div className={`font-semibold tabular-nums ${ledger.margin.margin < 0 ? "text-red-600" : "text-gray-900"}`}>
                      {euro(ledger.margin.margin)}
                      {ledger.margin.marginPct !== null && <span className="text-xs font-normal text-gray-600 ml-1">{ledger.margin.marginPct}%</span>}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Per rental day</div>
                    <div className="font-semibold tabular-nums">{ledger.rentals.revenuePerDay !== null ? euro(ledger.rentals.revenuePerDay) : "—"}</div>
                  </div>
                </div>
                <p className="text-[11px] text-gray-600 mt-2">
                  {ledger.rentals.count} rentals over {ledger.rentals.days} days. Cancelled and no-show bookings are excluded;
                  damage recharged to the customer does not count as a cost.
                </p>
              </div>
            )}
            {restricted && (
              <p className="text-xs text-gray-600 border-t border-gray-100 pt-4">
                Costs, damages and contribution are visible to administrators only.
              </p>
            )}
          </div>
        )}

        {tab === "costs" && <CostsTab ledger={ledger} restricted={restricted} onAdd={r => addRow("cost", r)} onRemove={id => removeRow("cost", id)} />}
        {tab === "damages" && <DamagesTab ledger={ledger} restricted={restricted} onAdd={r => addRow("damage", r)} onRemove={id => removeRow("damage", id)} />}

        {error && <div className="mx-6 mb-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</div>}

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 shrink-0">
          <button onClick={onClose} className="text-sm text-gray-600 px-4 py-2 hover:text-gray-900">Cancel</button>
          <button onClick={save} disabled={saving}
            className="text-sm font-medium text-white bg-blue-600 px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-60">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CostsTab({ ledger, restricted, onAdd, onRemove }: {
  ledger: Ledger | null; restricted: boolean;
  onAdd: (r: Record<string, unknown>) => Promise<boolean>; onRemove: (id: string) => void;
}) {
  const [row, setRow] = useState({ cost_type: "service", amount: "", incurred_on: new Date().toISOString().slice(0,10), supplier: "", notes: "" });
  if (restricted) return <div className="p-6 text-sm text-gray-600">Visible to administrators only.</div>;
  if (!ledger) return <div className="p-6 text-sm text-gray-600">Loading…</div>;

  return (
    <div className="p-6 space-y-4 overflow-y-auto overscroll-contain flex-1 min-h-0">
      <div className="grid grid-cols-12 gap-2 items-end">
        <div className="col-span-3">
          <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
          <Select className={input} value={row.cost_type} onChange={e => setRow(r => ({ ...r, cost_type: e.target.value }))}>
            {COST_TYPES.map(t => <option key={t} value={t}>{t.replace("_"," ")}</option>)}
          </Select>
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">Amount €</label>
          <input type="number" min="0" step="0.01" className={input} value={row.amount} onChange={e => setRow(r => ({ ...r, amount: e.target.value }))} />
        </div>
        <div className="col-span-3">
          <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
          <input type="date" className={input} value={row.incurred_on} onChange={e => setRow(r => ({ ...r, incurred_on: e.target.value }))} />
        </div>
        <div className="col-span-3">
          <label className="block text-xs font-medium text-gray-600 mb-1">Supplier</label>
          <input className={input} value={row.supplier} onChange={e => setRow(r => ({ ...r, supplier: e.target.value }))} />
        </div>
        <button
          onClick={async () => { if (await onAdd({ ...row, amount: Number(row.amount) })) setRow(r => ({ ...r, amount: "", supplier: "", notes: "" })); }}
          disabled={!row.amount}
          className="col-span-1 flex items-center justify-center bg-blue-600 text-white rounded-lg h-[38px] hover:bg-blue-700 disabled:opacity-40">
          <Plus size={16} />
        </button>
      </div>

      {ledger.costs.length === 0 ? (
        <p className="text-sm text-gray-600 text-center py-6">Nothing recorded against this vehicle yet.</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table w-full text-sm">
            <thead><tr className="text-xs text-gray-500 border-b border-gray-100">
              <th className="text-left py-2 font-medium">Date</th><th className="text-left py-2 font-medium">Type</th>
              <th className="text-left py-2 font-medium">Supplier</th><th className="text-right py-2 font-medium">Amount</th><th />
            </tr></thead>
            <tbody>
              {ledger.costs.map(c => (
                <tr key={c.id} className="border-b border-gray-50">
                  <td className="py-2 text-gray-600 text-xs">{c.incurred_on}</td>
                  <td className="py-2 text-gray-700">{c.cost_type.replace("_"," ")}</td>
                  <td className="py-2 text-gray-500 text-xs">{c.supplier ?? "—"}</td>
                  <td className="py-2 text-right tabular-nums">{euro(Number(c.amount))}</td>
                  <td className="py-2 text-right">
                    <button onClick={() => onRemove(c.id)} className="text-gray-500 hover:text-red-600 p-1"><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DamagesTab({ ledger, restricted, onAdd, onRemove }: {
  ledger: Ledger | null; restricted: boolean;
  onAdd: (r: Record<string, unknown>) => Promise<boolean>; onRemove: (id: string) => void;
}) {
  const [row, setRow] = useState({ description: "", severity: "minor", reported_on: new Date().toISOString().slice(0,10), repair_cost: "", charged_to_customer: false });
  if (restricted) return <div className="p-6 text-sm text-gray-600">Visible to administrators only.</div>;
  if (!ledger) return <div className="p-6 text-sm text-gray-600">Loading…</div>;

  return (
    <div className="p-6 space-y-4 overflow-y-auto overscroll-contain flex-1 min-h-0">
      <div className="grid grid-cols-12 gap-2 items-end">
        <div className="col-span-5">
          <label className="block text-xs font-medium text-gray-600 mb-1">What is damaged</label>
          <input className={input} value={row.description} placeholder="e.g. scratch on rear bumper"
            onChange={e => setRow(r => ({ ...r, description: e.target.value }))} />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">Severity</label>
          <Select className={input} value={row.severity} onChange={e => setRow(r => ({ ...r, severity: e.target.value }))}>
            {["minor","moderate","major"].map(s => <option key={s} value={s}>{s}</option>)}
          </Select>
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">Repair €</label>
          <input type="number" min="0" step="0.01" className={input} value={row.repair_cost} onChange={e => setRow(r => ({ ...r, repair_cost: e.target.value }))} />
        </div>
        <label className="col-span-2 flex items-center gap-1.5 text-xs text-gray-600 pb-2.5 cursor-pointer">
          <input type="checkbox" checked={row.charged_to_customer} onChange={e => setRow(r => ({ ...r, charged_to_customer: e.target.checked }))} className="rounded border-gray-300" />
          Recharged
        </label>
        <button
          onClick={async () => { if (await onAdd({ ...row, repair_cost: row.repair_cost === "" ? null : Number(row.repair_cost) })) setRow(r => ({ ...r, description: "", repair_cost: "", charged_to_customer: false })); }}
          disabled={!row.description.trim()}
          className="col-span-1 flex items-center justify-center bg-blue-600 text-white rounded-lg h-[38px] hover:bg-blue-700 disabled:opacity-40">
          <Plus size={16} />
        </button>
      </div>

      {ledger.damages.length === 0 ? (
        <p className="text-sm text-gray-600 text-center py-6">No damage recorded against this vehicle.</p>
      ) : (
        <div className="space-y-2">
          {ledger.damages.map(d => (
            <div key={d.id} className="flex items-start justify-between gap-3 border border-gray-100 rounded-lg px-3 py-2">
              <div className="min-w-0">
                <div className="text-sm text-gray-800">{d.description}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {d.reported_on} · {d.severity}
                  {d.repair_cost != null && ` · ${euro(Number(d.repair_cost))}`}
                  {d.charged_to_customer ? " · recharged to customer" : d.repair_cost != null ? " · absorbed" : ""}
                  {!d.repaired_on && <span className="text-amber-700"> · open</span>}
                </div>
              </div>
              <button onClick={() => onRemove(d.id)} className="text-gray-500 hover:text-red-600 p-1 shrink-0"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
