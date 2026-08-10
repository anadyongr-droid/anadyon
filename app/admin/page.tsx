"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, Clock, AlertTriangle, CheckCircle2 } from "lucide-react";

interface Reservation {
  id: string;
  customer_name: string;
  pickup_date: string;
  return_date: string;
  pickup_time: string;
  return_time: string;
  status: string;
  total: number;
  vehicles?: { name: string; category: string };
}

const STATUS_COLORS: Record<string, string> = {
  pending:   "bg-yellow-100 text-yellow-800",
  confirmed: "bg-blue-100 text-blue-800",
  active:    "bg-green-100 text-green-800",
  returned:  "bg-gray-100 text-gray-600",
  cancelled: "bg-red-100 text-red-600",
};

export default function AdminDashboard() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    fetch(`/api/admin/reservations?from=${today}&to=${in30}`)
      .then((r) => r.json())
      .then((data) => { setReservations(data); setLoading(false); });
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const todayPickups = reservations.filter((r) => r.pickup_date === today && r.status !== "cancelled");
  const todayReturns = reservations.filter((r) => r.return_date === today && r.status !== "cancelled");
  const active = reservations.filter((r) => r.status === "active");
  const overdue = active.filter((r) => r.return_date < today);
  const upcoming = reservations.filter((r) => r.pickup_date > today && ["pending", "confirmed"].includes(r.status));

  const cards = [
    { label: "Today's pick-ups", value: todayPickups.length, icon: CalendarDays, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "Today's returns", value: todayReturns.length, icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50" },
    { label: "Currently out", value: active.length, icon: Clock, color: "text-orange-500", bg: "bg-orange-50" },
    { label: "Overdue", value: overdue.length, icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50" },
  ];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
        <div className="text-sm text-gray-400">{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
            <div className={`${bg} ${color} p-3 rounded-lg`}>
              <Icon size={20} />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="text-gray-400 text-sm">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Today's activity */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Today</h2>
            {todayPickups.length === 0 && todayReturns.length === 0 ? (
              <p className="text-sm text-gray-400">No activity today.</p>
            ) : (
              <div className="space-y-2">
                {todayPickups.map((r) => (
                  <Link href={`/admin/reservations/${r.id}`} key={`p-${r.id}`}
                    className="flex items-center justify-between p-3 rounded-lg bg-blue-50 hover:bg-blue-100 transition text-sm">
                    <div>
                      <div className="font-medium text-gray-900">{r.customer_name}</div>
                      <div className="text-xs text-blue-600">↑ Pick-up {r.pickup_time} — {r.vehicles?.name}</div>
                    </div>
                    <span className="text-xs font-semibold text-blue-700">€{r.total}</span>
                  </Link>
                ))}
                {todayReturns.map((r) => (
                  <Link href={`/admin/reservations/${r.id}`} key={`ret-${r.id}`}
                    className="flex items-center justify-between p-3 rounded-lg bg-green-50 hover:bg-green-100 transition text-sm">
                    <div>
                      <div className="font-medium text-gray-900">{r.customer_name}</div>
                      <div className="text-xs text-green-600">↓ Return {r.return_time} — {r.vehicles?.name}</div>
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[r.status]}`}>{r.status}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Upcoming reservations */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Upcoming</h2>
              <Link href="/admin/calendar" className="text-xs text-blue-600 hover:underline">View calendar →</Link>
            </div>
            {upcoming.length === 0 ? (
              <p className="text-sm text-gray-400">No upcoming reservations.</p>
            ) : (
              <div className="space-y-2">
                {upcoming.slice(0, 8).map((r) => (
                  <Link href={`/admin/reservations/${r.id}`} key={r.id}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition text-sm border border-gray-100">
                    <div>
                      <div className="font-medium text-gray-900">{r.customer_name}</div>
                      <div className="text-xs text-gray-400">{r.pickup_date} → {r.return_date} · {r.vehicles?.name}</div>
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[r.status]}`}>{r.status}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
