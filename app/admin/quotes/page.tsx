"use client";
import { useEffect, useState } from "react";
import { statusClass, statusLabel } from "../lib/statusColors";
import StatusLegend from "../components/StatusLegend";

interface Quote {
  ref: string;
  first_name: string;
  last_name: string;
  mobile_tel: string;
  selected_model: string;
  vehicle_type: string;
  pickup_date: string;
  dropoff_date: string;
  rental_days: number;
  total: number;
  created_at: string;
  quote_status: string;
  reservation_vehicle_name: string | null;
  reservation_vehicle_plate: string | null;
}

export default function QuotesPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/quotes")
      .then((r) => r.json())
      .then((data) => { setQuotes(data); setLoading(false); });
  }, []);

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">Quotes</h1>
        <p className="text-sm text-gray-400 mt-0.5">Website booking requests — most recent first</p>
      </div>

      <StatusLegend />

      {loading ? (
        <div className="text-sm text-gray-400">Loading…</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-500 bg-gray-50">
                <th className="text-left px-5 py-3 font-medium">Ref</th>
                <th className="text-left px-4 py-3 font-medium">Customer</th>
                <th className="text-left px-4 py-3 font-medium">Vehicle</th>
                <th className="text-left px-4 py-3 font-medium">Pick-up</th>
                <th className="text-left px-4 py-3 font-medium">Return</th>
                <th className="text-center px-4 py-3 font-medium">Days</th>
                <th className="text-right px-4 py-3 font-medium">Total</th>
                <th className="text-center px-4 py-3 font-medium">Status</th>
                <th className="text-right px-4 py-3 font-medium">Received</th>
              </tr>
            </thead>
            <tbody>
              {quotes.length === 0 && (
                <tr><td colSpan={9} className="px-5 py-8 text-center text-gray-400 text-sm">No quotes yet.</td></tr>
              )}
              {quotes.map((q) => (
                <tr key={q.ref}
                  className="border-b border-gray-50 hover:bg-gray-50/50 transition cursor-pointer"
                  onClick={() => window.location.href = `/admin/quotes/${q.ref}`}>
                  <td className="px-5 py-3 font-mono text-xs text-gray-500">{q.ref}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{q.first_name} {q.last_name}</div>
                    <div className="text-xs text-gray-400">{q.mobile_tel}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {q.reservation_vehicle_name ? (
                      <div>
                        <div>{q.reservation_vehicle_name}</div>
                        {q.reservation_vehicle_plate && (
                          <div className="text-xs font-mono text-gray-400">{q.reservation_vehicle_plate}</div>
                        )}
                      </div>
                    ) : (
                      <span className="capitalize">{q.selected_model ?? q.vehicle_type}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{q.pickup_date}</td>
                  <td className="px-4 py-3 text-gray-600">{q.dropoff_date}</td>
                  <td className="px-4 py-3 text-center text-gray-600">{q.rental_days}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">
                    {q.total > 0 ? `€${q.total}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusClass(q.quote_status ?? "new")}`}>
                      {statusLabel(q.quote_status ?? "new")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-gray-400">
                    {new Date(q.created_at).toLocaleDateString("el-GR")}
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
