"use client";
import { useEffect, useState } from "react";

interface Vehicle {
  id: string;
  name: string;
  category: string;
  pricing_group: string;
  status: string;
  sort_order: number;
}

const STATUS_OPTIONS = ["available", "maintenance", "retired"];
const STATUS_COLORS: Record<string, string> = {
  available:   "bg-green-100 text-green-700",
  maintenance: "bg-orange-100 text-orange-700",
  retired:     "bg-gray-100 text-gray-500",
};
const CAT_LABELS: Record<string, string> = {
  car: "Cars", motorbike: "Motorbikes", bike: "Bikes",
};
const GROUP_LABELS: Record<string, string> = {
  car_a: "Cat A", car_b: "Cat B", car_c: "Cat C (Auto)",
  motorbike_a: "Cat A (50cc)", motorbike_b: "Cat B (125cc+)",
  bike: "Bicycle",
};

export default function FleetPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/vehicles").then((r) => r.json()).then(setVehicles);
  }, []);

  async function updateStatus(id: string, status: string) {
    setSaving(id);
    await fetch(`/api/admin/vehicles/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setVehicles((prev) => prev.map((v) => v.id === id ? { ...v, status } : v));
    setSaving(null);
  }

  const grouped = ["car", "motorbike", "bike"].map((cat) => ({
    cat,
    vehicles: vehicles.filter((v) => v.category === cat),
  })).filter((g) => g.vehicles.length > 0);

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-xl font-bold text-gray-900 mb-6">Fleet</h1>
      <div className="space-y-6">
        {grouped.map(({ cat, vehicles: vs }) => (
          <div key={cat} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900 text-sm">{CAT_LABELS[cat]}</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-500">
                  <th className="text-left px-5 py-2 font-medium">Vehicle</th>
                  <th className="text-left px-4 py-2 font-medium">Pricing</th>
                  <th className="text-center px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {vs.map((v) => (
                  <tr key={v.id} className="border-b border-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-800">{v.name}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{GROUP_LABELS[v.pricing_group]}</td>
                    <td className="px-4 py-3 text-center">
                      <select
                        value={v.status}
                        disabled={saving === v.id}
                        onChange={(e) => updateStatus(v.id, e.target.value)}
                        className={`text-xs font-medium px-2 py-1 rounded-full border-0 cursor-pointer ${STATUS_COLORS[v.status]}`}
                      >
                        {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
