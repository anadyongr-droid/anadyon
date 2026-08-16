"use client";
import { useEffect, useState } from "react";
import type { Rate, ExtrasConfig } from "@/lib/pricing";

const GROUP_LABELS: Record<string, string> = {
  car_a:       "Car — Category A (Nissan Micra)",
  car_b:       "Car — Category B (Hyundai i20)",
  car_c:       "Car — Category C (Automatic)",
  motorbike_a: "Motorbike — Category A (50cc)",
  motorbike_b: "Motorbike — Category B (125cc+)",
  bike:        "Bicycle",
};

const GROUP_ORDER = ["car_a", "car_b", "car_c", "motorbike_a", "motorbike_b", "bike"];

export default function RatesPage() {
  const [rates, setRates] = useState<Rate[]>([]);
  const [extras, setExtras] = useState<ExtrasConfig[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/admin/rates").then((r) => r.json()).then(({ rates: r, extras: e }) => {
      setRates(r ?? []);
      setExtras(e ?? []);
    });
  }, []);

  function updateRate(id: string, field: "rate_1_2" | "rate_3_6" | "rate_7plus", value: string) {
    setRates((prev) => prev.map((r) => r.id === id ? { ...r, [field]: parseFloat(value) || 0 } : r));
  }

  function updateExtra(id: string, field: "daily_rate" | "enabled", value: unknown) {
    setExtras((prev) => prev.map((e) => e.id === id ? { ...e, [field]: value } : e));
  }

  async function handleSave() {
    setSaving(true);
    await fetch("/api/admin/rates", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rates, extras }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  // Order seasons by the month they start, taken from the data itself.
  // A hardcoded name list previously hid the Oct-Apr row for years: the list
  // spelled it with an en dash while the database uses a hyphen, so the exact
  // match failed and .filter(Boolean) silently dropped a season that was still
  // being charged to customers. Deriving order from season_months means a name
  // can never desync from the data again.
  const seasonRank = (r: Rate) => Math.min(...r.season_months.map(m => (m < 5 ? m + 12 : m)));

  const grouped = GROUP_ORDER.map((group) => ({
    group,
    label: GROUP_LABELS[group],
    seasons: rates
      .filter((r) => r.pricing_group === group)
      .sort((a, b) => seasonRank(a) - seasonRank(b)),
  }));

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Rate Management</h1>
          <p className="text-sm text-gray-400 mt-0.5">All prices are in € per day</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800 transition disabled:opacity-50"
        >
          {saving ? "Saving…" : saved ? "Saved ✓" : "Save all changes"}
        </button>
      </div>

      <div className="space-y-6">
        {grouped.map(({ group, label, seasons }) => (
          <div key={group} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900 text-sm">{label}</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-500">
                  <th className="text-left px-5 py-2 font-medium">Season</th>
                  <th className="text-center px-4 py-2 font-medium">1–2 days</th>
                  <th className="text-center px-4 py-2 font-medium">3–6 days</th>
                  <th className="text-center px-4 py-2 font-medium">7+ days</th>
                </tr>
              </thead>
              <tbody>
                {seasons.map((rate) => (
                  <tr key={rate.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition">
                    <td className="px-5 py-2.5 font-medium text-gray-700">{rate.season_name}</td>
                    {(["rate_1_2", "rate_3_6", "rate_7plus"] as const).map((field) => (
                      <td key={field} className="px-4 py-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <span className="text-gray-400 text-xs">€</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={rate[field]}
                            onChange={(e) => updateRate(rate.id, field, e.target.value)}
                            className="w-20 border border-gray-200 rounded px-2 py-1 text-center text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                          />
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        {/* Extras */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900 text-sm">Extras</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-500">
                <th className="text-left px-5 py-2 font-medium">Extra</th>
                <th className="text-center px-4 py-2 font-medium">€/day</th>
                <th className="text-center px-4 py-2 font-medium">Enabled</th>
              </tr>
            </thead>
            <tbody>
              {extras.map((e) => (
                <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition">
                  <td className="px-5 py-2.5 font-medium text-gray-700">{e.label}</td>
                  <td className="px-4 py-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <span className="text-gray-400 text-xs">€</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={e.daily_rate}
                        onChange={(ev) => updateExtra(e.id, "daily_rate", parseFloat(ev.target.value) || 0)}
                        className="w-20 border border-gray-200 rounded px-2 py-1 text-center text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    </div>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <input type="checkbox" checked={e.enabled}
                      onChange={(ev) => updateExtra(e.id, "enabled", ev.target.checked)}
                      className="rounded border-gray-300" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
