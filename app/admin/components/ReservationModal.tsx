"use client";
import { useEffect, useState } from "react";
import { X, Trash2 } from "lucide-react";
import { calcRentalDays, getDailyRate, calcExtrasTotal } from "@/lib/pricing";
import type { Rate, ExtrasConfig, PricingGroup } from "@/lib/pricing";

interface Vehicle {
  id: string;
  name: string;
  category: string;
  pricing_group: string;
  status?: string;
}

interface Props {
  vehicleId?: string;
  date?: string;
  reservationId?: string;
  vehicles: Vehicle[];
  onClose: () => void;
  onSaved: () => void;
}

const STATUS_OPTIONS = ["pending", "confirmed", "active", "returned", "cancelled"];
const LOCATIONS = ["Airport", "Port (Zakynthos town)", "Our Office"];

const EMPTY_FORM = {
  vehicle_id: "",
  customer_name: "",
  customer_email: "",
  customer_phone: "",
  customer_nationality: "",
  pickup_date: "",
  pickup_time: "09:00",
  return_date: "",
  return_time: "09:00",
  pickup_location: "Our Office",
  dropoff_location: "Our Office",
  gps: false,
  baby_seat: 0,
  child_seat: 0,
  fdw: false,
  additional_drivers: 0,
  status: "confirmed",
  notes: "",
};

export default function ReservationModal({ vehicleId, date, reservationId, vehicles, onClose, onSaved }: Props) {
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [rates, setRates] = useState<Rate[]>([]);
  const [extras, setExtras] = useState<ExtrasConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isEdit = !!reservationId;

  useEffect(() => {
    fetch("/api/admin/rates").then((r) => r.json()).then(({ rates: r, extras: e }) => {
      setRates(r ?? []);
      setExtras(e ?? []);
    });

    if (reservationId) {
      setLoading(true);
      fetch(`/api/admin/reservations/${reservationId}`)
        .then((r) => r.json())
        .then((data) => {
          setForm({
            vehicle_id: data.vehicle_id,
            customer_name: data.customer_name,
            customer_email: data.customer_email ?? "",
            customer_phone: data.customer_phone ?? "",
            customer_nationality: data.customer_nationality ?? "",
            pickup_date: data.pickup_date,
            pickup_time: data.pickup_time,
            return_date: data.return_date,
            return_time: data.return_time,
            pickup_location: data.pickup_location ?? "Our Office",
            dropoff_location: data.dropoff_location ?? "Our Office",
            gps: data.gps,
            baby_seat: data.baby_seat,
            child_seat: data.child_seat,
            fdw: data.fdw,
            additional_drivers: data.additional_drivers,
            status: data.status,
            notes: data.notes ?? "",
          });
          setLoading(false);
        });
    } else {
      setForm((f) => ({
        ...f,
        vehicle_id: vehicleId ?? "",
        pickup_date: date ?? "",
        return_date: date ?? "",
      }));
    }
  }, [reservationId, vehicleId, date]);

  // Computed pricing
  const vehicle = vehicles.find((v) => v.id === form.vehicle_id);
  const rentalDays = form.pickup_date && form.return_date
    ? calcRentalDays(form.pickup_date, form.return_date)
    : 0;
  const pickupMonth = form.pickup_date ? new Date(form.pickup_date).getMonth() + 1 : 0;
  const dailyRate = vehicle && pickupMonth && rentalDays
    ? getDailyRate(rates, vehicle.pricing_group as PricingGroup, pickupMonth, rentalDays)
    : 0;
  const vehicleSubtotal = parseFloat((dailyRate * rentalDays).toFixed(2));
  const extrasSubtotal = rentalDays
    ? calcExtrasTotal(extras, {
        gps: form.gps,
        baby_seat: form.baby_seat,
        child_seat: form.child_seat,
        fdw: form.fdw,
        additional_drivers: form.additional_drivers,
      }, rentalDays)
    : 0;
  const total = parseFloat((vehicleSubtotal + extrasSubtotal).toFixed(2));
  const deposit = parseFloat((total * 0.3).toFixed(2));
  const balanceDue = parseFloat((total - deposit).toFixed(2));

  function set(key: string, value: unknown) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    if (!form.vehicle_id || !form.customer_name || !form.pickup_date || !form.return_date) return;
    setSaving(true);
    const payload = {
      ...form,
      rental_days: rentalDays,
      daily_rate: dailyRate,
      vehicle_subtotal: vehicleSubtotal,
      extras_subtotal: extrasSubtotal,
      total,
    };
    const url = isEdit ? `/api/admin/reservations/${reservationId}` : "/api/admin/reservations";
    const method = isEdit ? "PATCH" : "POST";
    await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setSaving(false);
    onSaved();
  }

  async function handleDelete() {
    if (!confirm("Delete this reservation?")) return;
    setDeleting(true);
    await fetch(`/api/admin/reservations/${reservationId}`, { method: "DELETE" });
    setDeleting(false);
    onSaved();
  }

  if (loading) return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
      <div className="bg-white rounded-xl p-8 text-gray-400 text-sm">Loading…</div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-8 pb-8 px-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">{isEdit ? "Edit Reservation" : "New Reservation"}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="p-6 grid grid-cols-2 gap-x-6 gap-y-4">
          {/* Vehicle */}
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Vehicle</label>
            <select
              value={form.vehicle_id}
              onChange={(e) => set("vehicle_id", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">— Select vehicle —</option>
              {["car", "motorbike", "bike"].map((cat) => {
                const vs = vehicles.filter((v) => v.category === cat && v.status !== "retired");
                if (!vs.length) return null;
                return (
                  <optgroup key={cat} label={cat.charAt(0).toUpperCase() + cat.slice(1) + "s"}>
                    {vs.map((v) => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </div>

          {/* Dates */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Pick-up date</label>
            <input type="date" value={form.pickup_date} onChange={(e) => set("pickup_date", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Pick-up time</label>
            <input type="time" value={form.pickup_time} onChange={(e) => set("pickup_time", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Return date</label>
            <input type="date" value={form.return_date} onChange={(e) => set("return_date", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Return time</label>
            <input type="time" value={form.return_time} onChange={(e) => set("return_time", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>

          {/* Locations */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Pick-up location</label>
            <select value={form.pickup_location} onChange={(e) => set("pickup_location", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              {LOCATIONS.map((l) => <option key={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Drop-off location</label>
            <select value={form.dropoff_location} onChange={(e) => set("dropoff_location", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              {LOCATIONS.map((l) => <option key={l}>{l}</option>)}
            </select>
          </div>

          {/* Customer */}
          <div className="col-span-2 border-t border-gray-100 pt-4">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Customer</div>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Full name *</label>
                <input type="text" value={form.customer_name} onChange={(e) => set("customer_name", e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                <input type="email" value={form.customer_email} onChange={(e) => set("customer_email", e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                <input type="tel" value={form.customer_phone} onChange={(e) => set("customer_phone", e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nationality</label>
                <input type="text" value={form.customer_nationality} onChange={(e) => set("customer_nationality", e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
          </div>

          {/* Extras */}
          <div className="col-span-2 border-t border-gray-100 pt-4">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Extras</div>
            <div className="grid grid-cols-2 gap-3">
              {extras.filter((e) => e.enabled && ["gps", "fdw"].includes(e.key)).map((e) => (
                <label key={e.key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={!!form[e.key as keyof typeof form]}
                    onChange={(ev) => set(e.key, ev.target.checked)}
                    className="rounded border-gray-300" />
                  {e.label} <span className="text-gray-400 text-xs">€{e.daily_rate}/day</span>
                </label>
              ))}
              {extras.filter((e) => e.enabled && ["baby_seat", "child_seat"].includes(e.key)).map((e) => (
                <div key={e.key} className="flex items-center gap-2 text-sm text-gray-700">
                  <label>{e.label} <span className="text-gray-400 text-xs">€{e.daily_rate}/day</span></label>
                  <select value={form[e.key as keyof typeof form] as number}
                    onChange={(ev) => set(e.key, Number(ev.target.value))}
                    className="border border-gray-300 rounded px-2 py-1 text-sm ml-auto">
                    {[0, 1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              ))}
              {extras.filter((e) => e.enabled && e.key === "additional_drivers").map((e) => (
                <div key={e.key} className="flex items-center gap-2 text-sm text-gray-700">
                  <label>{e.label} <span className="text-gray-400 text-xs">€{e.daily_rate}/day</span></label>
                  <select value={form.additional_drivers}
                    onChange={(ev) => set("additional_drivers", Number(ev.target.value))}
                    className="border border-gray-300 rounded px-2 py-1 text-sm ml-auto">
                    {[0, 1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Price summary */}
          {rentalDays > 0 && vehicle && (
            <div className="col-span-2 bg-gray-50 rounded-xl p-4 border border-gray-100">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Price Summary</div>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between text-gray-700">
                  <span>{vehicle.name} — {rentalDays} day{rentalDays > 1 ? "s" : ""} × €{dailyRate.toFixed(2)}</span>
                  <span>€{vehicleSubtotal.toFixed(2)}</span>
                </div>
                {extrasSubtotal > 0 && (
                  <div className="flex justify-between text-gray-700">
                    <span>Extras</span>
                    <span>€{extrasSubtotal.toFixed(2)}</span>
                  </div>
                )}
                <div className="border-t border-gray-200 pt-1.5 flex justify-between font-bold text-gray-900">
                  <span>Total</span>
                  <span>€{total.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-500 text-xs">
                  <span>Deposit (30%)</span>
                  <span>€{deposit.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-500 text-xs">
                  <span>Balance due at pickup</span>
                  <span>€{balanceDue.toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Status + Notes */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
            <select value={form.status} onChange={(e) => set("status", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm capitalize">
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none" />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
          <div>
            {isEdit && (
              <button onClick={handleDelete} disabled={deleting}
                className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700 transition">
                <Trash2 size={14} /> {deleting ? "Deleting…" : "Delete"}
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !form.vehicle_id || !form.customer_name || !form.pickup_date || !form.return_date}
              className="px-5 py-2 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800 transition disabled:opacity-50"
            >
              {saving ? "Saving…" : isEdit ? "Save changes" : "Create reservation"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
