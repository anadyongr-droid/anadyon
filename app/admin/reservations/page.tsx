"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import ReservationModal from "../components/ReservationModal";

interface Reservation {
  id: string;
  customer_name: string;
  customer_phone: string;
  pickup_date: string;
  return_date: string;
  rental_days: number;
  total: number;
  status: string;
  vehicles?: { name: string; category: string };
}

interface Vehicle {
  id: string;
  name: string;
  category: string;
  pricing_group: string;
  status: string;
}

import { STATUS_COLORS } from "../lib/statusColors";

export default function ReservationsPage() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [modal, setModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  function load() {
    setLoading(true);
    Promise.all([
      fetch("/api/admin/reservations").then((r) => r.json()),
      fetch("/api/admin/vehicles").then((r) => r.json()),
    ]).then(([r, v]) => {
      setReservations(r);
      setVehicles(v);
      setLoading(false);
    });
  }

  useEffect(() => { load(); }, []);

  const filtered = filter === "all"
    ? reservations
    : reservations.filter((r) => r.status === filter);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-900">Reservations</h1>
        <button
          onClick={() => setModal(true)}
          className="flex items-center gap-1.5 bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-800 transition"
        >
          <Plus size={15} /> New
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        {["all", "pending", "confirmed", "active", "returned", "cancelled"].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition capitalize ${
              filter === s ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-sm text-gray-400">Loading…</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-500 bg-gray-50">
                <th className="text-left px-5 py-3 font-medium">Customer</th>
                <th className="text-left px-4 py-3 font-medium">Vehicle</th>
                <th className="text-left px-4 py-3 font-medium">Pick-up</th>
                <th className="text-left px-4 py-3 font-medium">Return</th>
                <th className="text-center px-4 py-3 font-medium">Days</th>
                <th className="text-right px-4 py-3 font-medium">Total</th>
                <th className="text-center px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-gray-400 text-sm">No reservations found.</td></tr>
              )}
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition cursor-pointer"
                  onClick={() => window.location.href = `/admin/reservations/${r.id}`}>
                  <td className="px-5 py-3">
                    <div className="font-medium text-gray-900">{r.customer_name}</div>
                    <div className="text-xs text-gray-400">{r.customer_phone}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{r.vehicles?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{r.pickup_date}</td>
                  <td className="px-4 py-3 text-gray-600">{r.return_date}</td>
                  <td className="px-4 py-3 text-center text-gray-600">{r.rental_days}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">€{r.total}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${STATUS_COLORS[r.status]}`}>
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <ReservationModal
          vehicles={vehicles}
          onClose={() => setModal(false)}
          onSaved={() => { setModal(false); load(); }}
        />
      )}
    </div>
  );
}
