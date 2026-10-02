"use client";
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import ReservationModal from "../components/ReservationModal";
import { deliveryNeedsAttention, deriveWorkflowStage, type DeliveryRow } from "@/lib/emailWorkflowStage";
import { readListPayloads } from "@/lib/adminListPayload";
import {
  describeOutstandingDeposit,
  summariseOutstandingDeposits,
} from "@/lib/outstandingDeposits";
import {
  describeFailedFiling,
  summariseFilingBacklog,
  type FilingRow,
} from "@/lib/filingBacklog";
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
  /** Returned by the API all along; nothing on any screen read them until W24. */
  deposit?: number | string | null;
  deposit_paid_at?: string | null;
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
function rowWarnings(r: Reservation, condition: string | null, now: Date): string[] {
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

  // W24. Wise has no webhook, so an unreconciled deposit announces itself to
  // nobody - §5.3 requires it to appear as outstanding work and to age. The
  // clock is passed in rather than read inside, so the warning is a function of
  // the row and the time, not of when the component happened to render.
  const deposit = describeOutstandingDeposit(r, now);
  if (deposit) warnings.push(deposit);

  // W26. The row already carried a red `!` for a failed filing, which says that
  // something is wrong without saying what to do — and said nothing at all about
  // a row stuck at `submitting`, which cannot be retried until it is reset. Both
  // read from the row the list already has, so the sentence appears even where
  // the dedicated backlog query is unavailable.
  const filing = describeFailedFiling(r, now);
  if (filing) warnings.push(filing);

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
  // W23: a failed *first* load used to leave this screen showing "No
  // reservations found.", which is §5.3's own forbidden case - a fault and an
  // empty day reading alike.
  const [loadError, setLoadError] = useState<string | null>(null);
  /**
   * W26. Asked for separately rather than counted from `reservations`, because
   * that list is a window of the newest rows: the oldest failed filing is exactly
   * the one that falls off it. See `app/api/admin/aade/backlog/route.ts`.
   */
  const [filings, setFilings] = useState<FilingRow[]>([]);
  const [filingsTruncated, setFilingsTruncated] = useState(false);

  /**
   * @param showSpinner false for the background refresh, so the table does not
   *   flash "Loading…" every half minute while somebody is reading it.
   */
  async function load(showSpinner = true) {
    if (showSpinner) setLoading(true);
    try {
      const [resRes, vehRes] = await Promise.all([
        fetch("/api/admin/reservations"),
        fetch("/api/admin/vehicles"),
      ]);
      const [resBody, vehBody] = await Promise.all([
        resRes.json().catch(() => null),
        vehRes.json().catch(() => null),
      ]);
      // `res.ok` was never checked and the body was never shape-checked, so a
      // 500 whose body is {error} went straight into the rows state.
      const { error } = readListPayloads([
        { name: "Reservations", res: resRes, body: resBody },
        { name: "Vehicles", res: vehRes, body: vehBody },
      ]);
      if (error) throw new Error(error);

      setReservations(resBody as Reservation[]);
      setVehicles(vehBody as Vehicle[]);
      setLoadError(null);

      // Deliberately after the two lists and deliberately not fatal: a backlog
      // that cannot be fetched must not blank the reservations screen, which is
      // the W23 lesson applied in the other direction. An empty backlog and an
      // unavailable one are told apart by `filingsError` below.
      try {
        const res = await fetch("/api/admin/aade/backlog");
        const body = await res.json().catch(() => null);
        if (res.ok && body && Array.isArray(body.rows)) {
          setFilings(body.rows as FilingRow[]);
          setFilingsTruncated(Boolean(body.truncated));
        }
      } catch {
        // Left as-is; the previous value is better than an empty one, and the
        // reservations table is unaffected.
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : "the request failed";
      // A failed *background* poll stays quiet, which was the sound half of the
      // original reasoning: the table already holds rows, and blanking them over
      // one dropped request is worse than leaving them while the next poll either
      // succeeds or the age becomes obvious.
      //
      // A failed *first* load has nothing to preserve, and silence there is what
      // produced the confident denial. So only that one is surfaced.
      if (showSpinner) setLoadError(detail);
    } finally {
      if (showSpinner) setLoading(false);
    }
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
  // One clock per render, so every row on screen is aged against the same
  // instant rather than each against the moment it happened to be drawn.
  const now = new Date();
  const deposits = summariseOutstandingDeposits(reservations, now);
  const backlog = summariseFilingBacklog(filings, now);

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

      {/* W26. A failed statutory filing was a red badge on one row, which is
          only visible to whoever opens that booking. §5.3 asks for the backlog to
          be surfaced and to age. Shown only when something is outstanding, for
          the same reason as the deposits banner below. */}
      {!loading && !loadError && backlog.count > 0 && (
        <section
          aria-labelledby="filings-outstanding"
          className={`mb-4 rounded-xl border px-5 py-3 text-sm ${
            backlog.overdue > 0 || backlog.stuck > 0
              ? "border-red-300 bg-red-50 text-red-900"
              : "border-amber-300 bg-amber-50 text-amber-900"
          }`}
        >
          <h2 id="filings-outstanding" className="font-semibold">
            {backlog.count} AADE client-list filing{backlog.count === 1 ? "" : "s"} outstanding
          </h2>
          <p className="mt-0.5">
            {backlog.overdue > 0 && (
              <strong>
                {backlog.overdue} on {backlog.overdue === 1 ? "a rental" : "rentals"} that
                {backlog.overdue === 1 ? " has" : " have"} already started.{" "}
              </strong>
            )}
            {backlog.oldestOverdueDays !== null && (
              <>The longest has been running {backlog.oldestOverdueDays} day
                {backlog.oldestOverdueDays === 1 ? "" : "s"} unfiled. </>
            )}
            {backlog.stuck > 0 && (
              <>
                <strong>
                  {backlog.stuck} stuck mid-submission, which cannot be retried at all
                </strong>{" "}
                until the status is reset — a retry answers 409 for ever.{" "}
              </>
            )}
            Check AADE&rsquo;s own record before resubmitting: a filing abandoned on a timeout
            is recorded as failed here but may have been accepted there.
            {filingsTruncated && (
              <>
                {" "}
                <strong>This list is capped, so the real number is higher.</strong>
              </>
            )}
          </p>
        </section>
      )}

      {/* W24. Wise does not call back when money arrives, so an unreconciled
          deposit is invisible unless something says so. §5.3: it must appear as
          outstanding work and it must age. Shown only when there is something
          owed - a permanent "0 outstanding" badge is noise that trains people to
          stop reading it. */}
      {!loading && !loadError && deposits.count > 0 && (
        <section
          aria-labelledby="deposits-outstanding"
          className={`mb-4 rounded-xl border px-5 py-3 text-sm ${
            deposits.collected > 0
              ? "border-red-300 bg-red-50 text-red-900"
              : "border-amber-300 bg-amber-50 text-amber-900"
          }`}
        >
          <h2 id="deposits-outstanding" className="font-semibold">
            {deposits.count} deposit{deposits.count === 1 ? "" : "s"} unreconciled — €
            {deposits.total.toFixed(2)}
          </h2>
          <p className="mt-0.5">
            {deposits.collected > 0 && (
              <strong>
                {deposits.collected} where the vehicle is out or pick-up has passed.{" "}
              </strong>
            )}
            {deposits.imminent > 0 && <>{deposits.imminent} collecting within two days. </>}
            {deposits.oldestDays !== null && (
              <>The longest has been waiting {deposits.oldestDays} day
                {deposits.oldestDays === 1 ? "" : "s"}. </>
            )}
            Flagged rows below say which. These clear only when somebody checks the bank and
            records the payment on the reservation.
          </p>
        </section>
      )}

      {loading ? (
        <div className="text-sm text-gray-600">Loading…</div>
      ) : loadError ? (
        /* Deliberately not an empty table. §5.3: the operator needs to know the
           difference between quiet and broken. */
        <div
          role="alert"
          className="bg-white rounded-xl border border-amber-300 p-6 text-sm text-amber-800"
        >
          <p className="font-semibold">The reservations could not be loaded.</p>
          <p className="mt-1">
            {loadError}. <strong>This is not an empty list</strong> — nothing is known about
            today&apos;s bookings until this succeeds.
          </p>
          <button
            type="button"
            onClick={() => load()}
            className="mt-3 inline-flex min-h-10 items-center rounded-lg border border-amber-400 bg-white px-4 py-2 text-sm font-semibold text-amber-900 transition hover:bg-amber-50"
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 admin-table-wrap">
          <table className="admin-table w-full text-sm">
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
                <tr><td colSpan={11} className="px-5 py-8 text-center text-gray-600 text-sm">No reservations found.</td></tr>
              )}
              {filtered.map((r) => {
                const workflow = deriveWorkflowStage(r.booking_email_deliveries);
                const warnings = rowWarnings(r, workflow.condition, now);
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
                    <div className="text-xs text-gray-600">{r.customer_phone}</div>
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
                      : <span className="text-gray-600">—</span>}
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
