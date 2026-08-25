"use client";
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import ReservationModal from "../components/ReservationModal";
import { deliveryNeedsAttention, deriveWorkflowStage, type DeliveryRow } from "@/lib/emailWorkflowStage";
import { reservationRef } from "@/lib/wise";

interface Reservation {
  id: string;
  customer_name: string;
  customer_phone: string;
  pickup_date: string;
  return_date: string;
  rental_days: number;
  total: number;
  status: string;
  source?: "website" | "admin";
  created_at?: string;
  dcl_status?: string;
  vehicle_id?: string | null;
  notes?: string | null;
  quote_id?: string | null;
  quotes?: { ref?: string | null } | { ref?: string | null }[] | null;
  vehicles?: { name: string; category: string };
  /** Audited workflow emails. The stage is derived from these, never stored. */
  booking_email_deliveries?: DeliveryRow[];
}

/** Statuses where a rental still needs a vehicle. Ended ones do not. */
const NEEDS_VEHICLE = new Set(["pending", "confirmed", "active"]);

function quoteRefOf(r: Reservation): string | undefined {
  const q = Array.isArray(r.quotes) ? r.quotes[0] : r.quotes;
  return q?.ref ?? undefined;
}

/**
 * Why this row is flagged, or an empty list.
 *
 * Two distinct faults, reported separately rather than as one "problem" flag,
 * because they call for different actions from whoever opens the row.
 */
function rowWarnings(r: Reservation, condition: string | null): string[] {
  const warnings: string[] = [];

  // A website booking carries a linked quote and passes through the
  // auto-assignment trigger on insert. Still having no vehicle means the system
  // looked and found nothing it could safely give — same category or an
  // upgrade, matching transmission, free including turnaround — and left it
  // unallocated rather than making an unsafe assignment. That needs a person.
  //
  // Office/walk-in rows are excluded: they never go through that trigger, so an
  // empty vehicle there only means nobody has chosen one yet.
  if (!r.vehicle_id && r.quote_id && r.source === "website" && NEEDS_VEHICLE.has(r.status)) {
    warnings.push(
      "No vehicle could be assigned automatically. Nothing was available in the requested category (or a valid upgrade) with the right transmission for these dates. Assign one manually, or talk to the customer about alternatives.",
    );
  }

  if (deliveryNeedsAttention(condition)) {
    warnings.push(
      `The last customer email was not delivered — it is currently "${condition}". The customer may not have received it. Check the delivery history on the reservation, then resend or contact them directly.`,
    );
  }

  return warnings;
}

interface Vehicle {
  id: string;
  name: string;
  category: string;
  pricing_group: string;
  status: string;
}

import { statusClass, statusLabel } from "../lib/statusColors";
import StatusLegend from "../components/StatusLegend";

export default function ReservationsPage() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [modal, setModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  /**
   * @param showSpinner false for the background refresh, so the table does not
   *   flash "Loading…" every half minute while somebody is reading it.
   */
  function load(showSpinner = true) {
    if (showSpinner) setLoading(true);
    Promise.all([
      fetch("/api/admin/reservations").then((r) => r.json()),
      fetch("/api/admin/vehicles").then((r) => r.json()),
    ]).then(([r, v]) => {
      setReservations(r);
      setVehicles(v);
      if (showSpinner) setLoading(false);
    }).catch(() => {
      // A failed background poll is not worth showing. The next one will
      // either succeed or the operator will notice stale data; blanking the
      // table over one dropped request would be worse than leaving it.
      if (showSpinner) setLoading(false);
    });
  }

  useEffect(() => { load(); }, []);

  // The email stage arrives from the provider seconds to minutes after a
  // booking, so a screen loaded once shows a blank stage that never fills in.
  // Polls quietly in the background, and only while the tab is actually being
  // looked at — a backgrounded tab left open overnight should not keep asking.
  useEffect(() => {
    const REFRESH_MS = 30_000;
    const tick = () => { if (!document.hidden) load(false); };
    const timer = setInterval(tick, REFRESH_MS);
    // Also refresh on returning to the tab, so it is current immediately
    // rather than up to REFRESH_MS stale.
    const onVisible = () => { if (!document.hidden) load(false); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const filtered = (() => {
    if (filter === "all") return reservations;
    if (filter === "new") return reservations.filter((r) => r.created_at?.slice(0, 10) === today);
    if (filter === "returned") return reservations.filter((r) => r.status === "returned" && r.return_date === today);
    return reservations.filter((r) => r.status === filter);
  })();

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
        {["new", "all", "pending", "confirmed", "active", "returned", "cancelled", "no_show", "voided"].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition capitalize ${
              filter === s ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {s.replace("_", " ")}
          </button>
        ))}
      </div>

      <StatusLegend />

      {loading ? (
        <div className="text-sm text-gray-400">Loading…</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-500 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium">Ref</th>
                <th className="text-left px-5 py-3 font-medium">Customer</th>
                <th className="text-left px-4 py-3 font-medium">Vehicle</th>
                <th className="text-left px-4 py-3 font-medium">Source</th>
                <th className="text-left px-4 py-3 font-medium">Pick-up</th>
                <th className="text-left px-4 py-3 font-medium">Return</th>
                <th className="text-center px-4 py-3 font-medium">Days</th>
                <th className="text-right px-4 py-3 font-medium">Total</th>
                <th className="text-center px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Customer email</th>
                <th className="text-center px-4 py-3 font-medium">DCL</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={11} className="px-5 py-8 text-center text-gray-400 text-sm">No reservations found.</td></tr>
              )}
              {filtered.map((r) => {
                const workflow = deriveWorkflowStage(r.booking_email_deliveries);
                const warnings = rowWarnings(r, workflow.condition);
                const flagged = warnings.length > 0;
                return (
                <tr key={r.id}
                  className={`border-b transition cursor-pointer ${
                    flagged
                      ? "border-red-200 bg-red-50 hover:bg-red-100"
                      : "border-gray-50 hover:bg-gray-50/50"
                  }`}
                  onClick={() => {
                    // Warn before opening rather than after. Cancel leaves them
                    // on the list; OK opens the reservation, which is where the
                    // problem actually gets fixed.
                    if (flagged && !window.confirm(
                      `${warnings.length > 1 ? "This reservation needs attention:" : "This reservation needs attention:"}\n\n` +
                      warnings.map((w, i) => `${warnings.length > 1 ? `${i + 1}. ` : ""}${w}`).join("\n\n") +
                      `\n\nOpen the reservation?`,
                    )) return;
                    window.location.href = `/admin/reservations/${r.id}`;
                  }}>
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">
                    {reservationRef(r.id, r.notes, quoteRefOf(r))}
                  </td>
                  <td className="px-5 py-3">
                    <div className="font-medium text-gray-900">{r.customer_name}</div>
                    <div className="text-xs text-gray-400">{r.customer_phone}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{r.vehicles?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">
                    {r.source === "website" ? "Website quote" : "Office / walk-in"}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{r.pickup_date}</td>
                  <td className="px-4 py-3 text-gray-600">{r.return_date}</td>
                  <td className="px-4 py-3 text-center text-gray-600">{r.rental_days}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">€{r.total}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusClass(r.status)}`}>
                      {statusLabel(r.status)}
                    </span>
                  </td>
                  {/* The stage only, without the delivery condition appended.
                      "Quote Confirmation — Accepted by email provider" was
                      mostly noise: on a healthy send the suffix says nothing a
                      reader needs. When delivery *has* gone wrong the row turns
                      red and the click warning names the condition, so the
                      information is not lost — it is moved to where it matters.
                      The full history stays on the reservation itself. */}
                  <td className="px-4 py-3 text-xs">
                    {workflow.stageLabel
                      ? <span className={flagged ? "font-medium text-red-700" : "text-gray-700"}>{workflow.stageLabel}</span>
                      : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {r.dcl_status && r.dcl_status !== "not_submitted" && (
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                        r.dcl_status === "submitted" ? "bg-green-100 text-green-700" :
                        r.dcl_status === "error" ? "bg-red-100 text-red-600" :
                        "bg-yellow-100 text-yellow-700"
                      }`}>
                        {r.dcl_status === "submitted" ? "✓" : r.dcl_status === "error" ? "!" : "…"}
                      </span>
                    )}
                  </td>
                </tr>
                );
              })}
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
