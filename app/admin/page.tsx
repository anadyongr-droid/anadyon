"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, Clock, AlertTriangle, CheckCircle2, TrendingUp, Car } from "lucide-react";
import { statusClass, statusLabel } from "./lib/statusColors";
import { vehicleLabel } from "@/lib/vehicleLabel";

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

interface MonthStat {
  label: string;
  revenue: number;
  count: number;
}

export default function AdminDashboard() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [monthly, setMonthly] = useState<MonthStat[]>([]);
  const [totalVehicles, setTotalVehicles] = useState(0);
  const [activeVehicles, setActiveVehicles] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    Promise.all([
      fetch(`/api/admin/reservations?from=${today}&to=${in30}`).then((r) => r.json()),
      fetch("/api/admin/stats").then((r) => r.json()),
    ]).then(([res, stats]) => {
      setReservations(res);
      setMonthly(stats.monthly ?? []);
      setTotalVehicles(stats.totalVehicles ?? 0);
      setActiveVehicles(stats.activeVehicles ?? 0);
      setLoading(false);
    });
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const todayPickups = reservations.filter((r) => r.pickup_date === today && r.status !== "cancelled");
  const todayReturns = reservations.filter((r) => r.return_date === today && r.status !== "cancelled");
  const active = reservations.filter((r) => r.status === "active");
  const overdue = active.filter((r) => r.return_date < today);
  const upcoming = reservations.filter((r) => r.pickup_date > today && ["pending", "confirmed"].includes(r.status));

  const maxRevenue = Math.max(...monthly.map((m) => m.revenue), 1);
  const currentMonthRevenue = monthly[monthly.length - 1]?.revenue ?? 0;
  const prevMonthRevenue = monthly[monthly.length - 2]?.revenue ?? 0;
  const revenueGrowth = prevMonthRevenue > 0
    ? Math.round(((currentMonthRevenue - prevMonthRevenue) / prevMonthRevenue) * 100)
    : null;

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
        <div className="text-sm text-gray-600">{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
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
        <div className="text-gray-600 text-sm">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Revenue chart */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="font-semibold text-gray-900">Revenue — last 6 months</h2>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-2xl font-bold text-gray-900">€{currentMonthRevenue.toLocaleString("el-GR", { minimumFractionDigits: 0 })}</span>
                  {revenueGrowth !== null && (
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${revenueGrowth >= 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                      {revenueGrowth >= 0 ? "+" : ""}{revenueGrowth}%
                    </span>
                  )}
                </div>
              </div>
              <TrendingUp size={18} className="text-gray-500 mt-1" />
            </div>
            {/* Bar chart */}
            <div className="flex items-end gap-2 h-32">
              {monthly.map((m, i) => {
                const heightPct = maxRevenue > 0 ? (m.revenue / maxRevenue) * 100 : 0;
                const isLast = i === monthly.length - 1;
                return (
                  <div key={m.label} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xs text-gray-600 font-medium">
                      {m.revenue > 0 ? `€${Math.round(m.revenue / 1000)}k` : ""}
                    </span>
                    <div className="w-full flex flex-col justify-end" style={{ height: "80px" }}>
                      <div
                        className={`w-full rounded-t-md transition-all ${isLast ? "bg-blue-600" : "bg-blue-200"}`}
                        style={{ height: `${Math.max(heightPct, m.revenue > 0 ? 4 : 0)}%` }}
                        title={`€${m.revenue.toFixed(2)} — ${m.count} reservation${m.count !== 1 ? "s" : ""}`}
                      />
                    </div>
                    <span className="text-xs text-gray-600">{m.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Fleet occupancy */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Fleet</h2>
              <Car size={16} className="text-gray-500" />
            </div>
            <div className="flex items-center justify-center mb-4">
              {/* Donut */}
              <div className="relative w-28 h-28">
                <svg viewBox="0 0 36 36" className="w-28 h-28 -rotate-90">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e5e7eb" strokeWidth="3" />
                  <circle
                    cx="18" cy="18" r="15.9" fill="none"
                    stroke="#3b82f6" strokeWidth="3"
                    strokeDasharray={`${totalVehicles > 0 ? (activeVehicles / totalVehicles) * 100 : 0} 100`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xl font-bold text-gray-900">{totalVehicles > 0 ? Math.round((activeVehicles / totalVehicles) * 100) : 0}%</span>
                  <span className="text-xs text-gray-600">in use</span>
                </div>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Total fleet</span>
                <span className="font-medium text-gray-900">{totalVehicles}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Currently out</span>
                <span className="font-medium text-blue-600">{activeVehicles}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Available</span>
                <span className="font-medium text-green-600">{totalVehicles - activeVehicles}</span>
              </div>
            </div>
            <Link href="/admin/fleet" className="block mt-4 text-center text-xs text-blue-600 hover:underline">Manage fleet →</Link>
          </div>

          {/* Today's activity */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Today</h2>
            {todayPickups.length === 0 && todayReturns.length === 0 ? (
              <p className="text-sm text-gray-600">No activity today.</p>
            ) : (
              <div className="space-y-2">
                {todayPickups.map((r) => (
                  <Link href={`/admin/reservations/${r.id}`} key={`p-${r.id}`}
                    className="flex items-center justify-between p-3 rounded-lg bg-blue-50 hover:bg-blue-100 transition text-sm">
                    <div>
                      <div className="font-medium text-gray-900">{r.customer_name}</div>
                      <div className="text-xs text-blue-600">↑ Pick-up {r.pickup_time} — {vehicleLabel(r.vehicles)}</div>
                    </div>
                    <span className="text-xs font-semibold text-blue-700">€{r.total}</span>
                  </Link>
                ))}
                {todayReturns.map((r) => (
                  <Link href={`/admin/reservations/${r.id}`} key={`ret-${r.id}`}
                    className="flex items-center justify-between p-3 rounded-lg bg-green-50 hover:bg-green-100 transition text-sm">
                    <div>
                      <div className="font-medium text-gray-900">{r.customer_name}</div>
                      <div className="text-xs text-green-600">↓ Return {r.return_time} — {vehicleLabel(r.vehicles)}</div>
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusClass(r.status)}`}>{statusLabel(r.status)}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Upcoming reservations */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Upcoming</h2>
              <Link href="/admin/calendar" className="text-xs text-blue-600 hover:underline">View calendar →</Link>
            </div>
            {upcoming.length === 0 ? (
              <p className="text-sm text-gray-600">No upcoming reservations.</p>
            ) : (
              <div className="space-y-2">
                {upcoming.slice(0, 6).map((r) => (
                  <Link href={`/admin/reservations/${r.id}`} key={r.id}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition text-sm border border-gray-100">
                    <div>
                      <div className="font-medium text-gray-900">{r.customer_name}</div>
                      <div className="text-xs text-gray-600">{r.pickup_date} → {r.return_date} · {vehicleLabel(r.vehicles)}</div>
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusClass(r.status)}`}>{statusLabel(r.status)}</span>
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
