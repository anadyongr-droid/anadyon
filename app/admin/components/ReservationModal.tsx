"use client";
import { useEffect, useState, useRef, useCallback, Fragment } from "react";
import { X, Trash2, Upload, FileText, Send, Search, Link, MessageSquare } from "lucide-react";
import { useModalBehavior } from "@/app/hooks/useModalBehavior";
import { RESERVATION_STATUSES } from "@/lib/reservationStatus";
import { vehicleLabel } from "@/lib/vehicleLabel";
import Select from "./Select";
import SegmentedDateInput from "@/app/components/SegmentedDateInput";
import { calcRentalDays, calcVehicleSegments, calcVehicleSubtotal, calcExtrasLines, calcExtrasTotal, resolveVehiclePricing, DEPOSIT_RATE } from "@/lib/pricing";
import type { Rate, ExtrasConfig, PricingGroup } from "@/lib/pricing";
import DateRangePicker from "@/app/components/DateRangePicker";
import { TIME_OPTIONS, validateReservation, missingDeferrable, normaliseForStorage } from "@/lib/bookingFields";
import { BOOKING_LOCATION_VALUES, DEFAULT_ADMIN_BOOKING_LOCATION } from "@/lib/bookingLocations";
import { checkSubstitution, consentCanPermit, isEligibleAssignment, type Quoted } from "@/lib/substitution";
import { MAX_CHILD_SEATS_TOTAL, SEATS_LIMIT_MESSAGE } from "@/lib/rentalPolicy";
import { deriveWorkflowStage, type DeliveryRow } from "@/lib/emailWorkflowStage";
import { licenceStatus, instant } from "@/lib/operations";

interface Vehicle {
  id: string;
  name: string;
  plate?: string | null;
  category: string;
  pricing_group: string;
  status?: string;
  transmission?: string | null;
}

interface Props {
  vehicleId?: string;
  date?: string;
  reservationId?: string;
  customerId?: string;
  quoteId?: string;
  initialValues?: Partial<typeof EMPTY_FORM>;
  vehicles: Vehicle[];
  /**
   * What the customer was quoted, when the reservation comes from one. Lets the
   * form say whether the vehicle being assigned is the same category, a free
   * upgrade, or a downgrade that needs their agreement.
   */
  quoted?: Quoted;
  onClose: () => void;
  onSaved: () => void;
}

// Single source of truth, shared with the database constraint check in the
// end-to-end suite. See lib/reservationStatus.ts.
const STATUS_OPTIONS = RESERVATION_STATUSES;
const STATUS_LABELS: Record<string, string> = {
  pending: "Pending / quote stage",
  confirmed: "Booking confirmed / payment received",
  active: "Active",
  returned: "Returned",
  cancelled: "Cancelled",
  no_show: "No show",
  voided: "Voided",
};
const LOCATIONS = BOOKING_LOCATION_VALUES;

const EMPTY_FORM = {
  vehicle_id: "",
  customer_name: "",
  customer_first_name: "",
  customer_last_name: "",
  customer_email: "",
  customer_phone: "",
  customer_nationality: "",
  customer_dob: "",
  flight_number: "",
  pickup_date: "",
  pickup_time: "09:00",
  return_date: "",
  return_time: "09:00",
  pickup_location: DEFAULT_ADMIN_BOOKING_LOCATION,
  dropoff_location: DEFAULT_ADMIN_BOOKING_LOCATION,
  gps: false,
  baby_seat: 0,
  child_seat: 0,
  fdw: false,
  additional_drivers: 0,
  status: "pending",
  notes: "",
  // Leading underscore: UI-only, stripped before the payload reaches the API.
  // Empty means "use the seasonal card rate"; set, it is the rate agreed at the
  // counter. Staff haggle in euros per day, not in discount totals.
  _daily_rate_override: "" as string | number,
  discount_amount: 0,
  discount_reason: "",
  dcl_status: "not_submitted",
};

export default function ReservationModal({ vehicleId, date, reservationId, customerId, quoteId, initialValues, vehicles, quoted, onClose, onSaved }: Props) {
  const dialogRef = useModalBehavior<HTMLDivElement>(onClose);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [rates, setRates] = useState<Rate[]>([]);
  const [extras, setExtras] = useState<ExtrasConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [downgradeAcknowledged, setDowngradeAcknowledged] = useState(false);
  // The linked quote as loaded with the reservation. The `quoted` prop is
  // only supplied when the modal is opened from the Quotes screen; every
  // other entry point relied on it being undefined, which silently disabled
  // the eligibility filter and every substitution warning.
  const [loadedQuote, setLoadedQuote] = useState<(Quoted & {
    ref?: string | null; driver_age?: string | null; baby_seat?: number | null;
    child_seat?: number | null; fdw?: boolean | null;
    additional_drivers?: number | null; comments?: string | null;
    pickup_date?: string | null; pickup_time?: string | null;
    return_date?: string | null; return_time?: string | null;
    rental_days?: number | null;
  }) | null>(null);
  // The customer rang and asked for this — a different transmission, or a
  // smaller car they have accepted. Recorded on the reservation when it is
  // what permitted the change.
  const [customerRequestedChange, setCustomerRequestedChange] = useState(false);
  const [statutoryBar, setStatutoryBar] = useState("");
  const [conflictWarning, setConflictWarning] = useState("");
  const [originalStatus, setOriginalStatus] = useState("");
  const isEdit = !!reservationId;

  // Document upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState<{ name: string; path: string; created_at: string }[]>([]);
  const [uploading, setUploading] = useState(false);

  // AADE DCL submission
  const [aadeSubmitting, setAadeSubmitting] = useState(false);
  const [aadeResult, setAadeResult] = useState<{ ok?: boolean; mark?: string; error?: string } | null>(null);

  // myDATA Invoice submission
  const [invoiceSubmitting, setInvoiceSubmitting] = useState(false);
  const [invoiceResult, setInvoiceResult] = useState<{ ok?: boolean; mark?: string; series?: string; aa?: number; error?: string } | null>(null);
  const [invoiceMark, setInvoiceMark] = useState<string | null>(null);
  const [invoiceStatus, setInvoiceStatus] = useState<string>("not_issued");

  // Customer search / linking
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<{
    id: string; full_name: string; first_name?: string; last_name?: string; email: string; phone: string;
    dob?: string | null; driving_licence_number?: string | null; driving_licence_expiry?: string | null;
  }[]>([]);
  const [linkedLicence, setLinkedLicence] = useState<{ driving_licence_number: string | null; driving_licence_expiry: string | null } | null>(null);
  const [linkedCustomerId, setLinkedCustomerId] = useState<string | null>(customerId ?? null);
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);

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
            customer_first_name: data.customer_first_name ?? "",
            customer_last_name: data.customer_last_name ?? "",
            customer_email: data.customer_email ?? "",
            customer_phone: data.customer_phone ?? "",
            customer_nationality: data.customer_nationality ?? "",
            customer_dob: data.customer_dob ?? "",
            flight_number: data.flight_number ?? "",
            pickup_date: data.pickup_date,
            pickup_time: data.pickup_time,
            return_date: data.return_date,
            return_time: data.return_time,
            pickup_location: data.pickup_location ?? DEFAULT_ADMIN_BOOKING_LOCATION,
            dropoff_location: data.dropoff_location ?? DEFAULT_ADMIN_BOOKING_LOCATION,
            gps: data.gps,
            baby_seat: data.baby_seat,
            child_seat: data.child_seat,
            fdw: data.fdw,
            additional_drivers: data.additional_drivers,
            status: data.status,
            notes: data.notes ?? "",
            _daily_rate_override: data.daily_rate ?? "",
            discount_amount: data.discount_amount ?? 0,
            discount_reason: data.discount_reason ?? "",
            dcl_status: data.dcl_status ?? "not_submitted",
          });
          const q = Array.isArray(data.quotes) ? data.quotes[0] : data.quotes;
          setLoadedQuote(q ? { ...q, model: q.selected_model } : null);
          setOriginalStatus(data.status);
          setInvoiceStatus(data.invoice_status ?? "not_issued");
          setInvoiceMark(data.invoice_mark ?? null);
          setLoading(false);
        });
    } else {
      setForm((f) => ({
        ...f,
        vehicle_id: vehicleId ?? "",
        pickup_date: date ?? "",
        return_date: date ?? "",
        ...initialValues,
      }));
    }
  }, [reservationId, vehicleId, date]);

  // Load documents when editing
  useEffect(() => {
    if (!reservationId) return;
    fetch(`/api/admin/documents?reservation_id=${reservationId}`)
      .then((r) => r.json())
      .then((d) => setDocuments(Array.isArray(d) ? d : []));
  }, [reservationId]);

  // Customer search
  useEffect(() => {
    if (!customerSearch.trim()) { setCustomerResults([]); return; }
    const t = setTimeout(() => {
      fetch(`/api/admin/customers?q=${encodeURIComponent(customerSearch)}`)
        .then((r) => r.json())
        .then((d) => setCustomerResults(Array.isArray(d) ? d.slice(0, 5) : []));
    }, 250);
    return () => clearTimeout(t);
  }, [customerSearch]);

  async function handleUpload(file: File) {
    if (!reservationId) return;
    setUploading(true);
    const res = await fetch("/api/admin/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservation_id: reservationId, file_name: file.name, content_type: file.type }),
    });
    const { signedUrl, path } = await res.json();
    await fetch(signedUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
    setDocuments((d) => [...d, { name: file.name, path, created_at: new Date().toISOString() }]);
    setUploading(false);
  }

  async function handleDocumentDelete(path: string) {
    await fetch("/api/admin/documents", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path }) });
    setDocuments((d) => d.filter((doc) => doc.path !== path));
  }

  async function handleDocumentDownload(path: string, name: string) {
    const res = await fetch(`/api/admin/documents/download?path=${encodeURIComponent(path)}`);
    const { url } = await res.json();
    const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  }

  async function handleAadeSubmit() {
    if (!reservationId) return;
    setAadeSubmitting(true);
    setAadeResult(null);
    const res = await fetch("/api/admin/aade/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: reservationId }),
    });
    const data = await res.json();
    setAadeResult(data);
    setAadeSubmitting(false);
    if (data.ok) set("dcl_status", "submitted");
  }

  async function handleInvoiceSubmit() {
    if (!reservationId) return;
    setInvoiceSubmitting(true);
    setInvoiceResult(null);
    const res = await fetch("/api/admin/invoices/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: reservationId }),
    });
    const data = await res.json();
    setInvoiceResult(data);
    setInvoiceSubmitting(false);
    if (data.ok) {
      setInvoiceStatus("issued");
      setInvoiceMark(data.mark ?? null);
    }
  }

  function linkCustomer(c: {
    id: string; full_name: string; first_name?: string; last_name?: string; email: string; phone: string;
    dob?: string | null; driving_licence_number?: string | null; driving_licence_expiry?: string | null;
  }) {
    setLinkedCustomerId(c.id);
    // The licence lives on the customer, not the reservation, so it has to be
    // carried across when one is linked — otherwise the expiry check below has
    // nothing to examine.
    setLinkedLicence({
      driving_licence_number: c.driving_licence_number ?? null,
      driving_licence_expiry: c.driving_licence_expiry ?? null,
    });
    if (c.dob && !form.customer_dob) set("customer_dob", c.dob);
    set("customer_first_name", c.first_name ?? c.full_name.split(" ")[0] ?? "");
    set("customer_last_name", c.last_name ?? c.full_name.split(" ").slice(1).join(" ") ?? "");
    set("customer_name", c.full_name);
    set("customer_email", c.email || form.customer_email);
    set("customer_phone", c.phone || form.customer_phone);
    setShowCustomerSearch(false);
    setCustomerSearch("");
    setCustomerResults([]);
  }

  // Real-time vehicle availability check
  useEffect(() => {
    if (!form.vehicle_id || !form.pickup_date || !form.return_date) {
      setConflictWarning("");
      return;
    }
    const params = new URLSearchParams({
      vehicle_id: form.vehicle_id,
      pickup_date: form.pickup_date,
      return_date: form.return_date,
      pickup_time: form.pickup_time || "09:00",
      return_time: form.return_time || "09:00",
      ...(reservationId ? { exclude_id: reservationId } : {}),
    });
    fetch(`/api/admin/vehicles/availability?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.available && data.conflict) {
          const c = data.conflict;
          // A statutory lapse is absolute — no cover, so it blocks the save.
          // A double-booking is impossible. A short turnaround is a judgement
          // call, so it is worded as a caution and says when the vehicle is
          // actually ready rather than simply refusing.
          setStatutoryBar(c.reason === "statutory" ? c.message : "");
          setConflictWarning(
            c.reason === "statutory"
              ? c.message
              : c.reason === "turnaround"
              ? `Tight turnaround — ${c.customer_name} returns it ${c.returns_at}. Allowing ${c.turnaround_minutes} min to clean and prepare, it is ready ${c.ready_at}.`
              : `Already booked for ${c.customer_name} (${c.pickup_date} → ${c.return_date})`
          );
        } else {
          setConflictWarning("");
          setStatutoryBar("");
        }
      });
  }, [
    form.vehicle_id,
    form.pickup_date,
    form.return_date,
    form.pickup_time,
    form.return_time,
    reservationId,
  ]);

  // A quote reserves a category and transmission, never an arbitrary fleet
  // item. The API repeats this check before saving; filtering here keeps an
  // accidental car → bicycle or manual → automatic choice out of the ordinary
  // staff workflow altogether. A walk-in has no quoted promise, so it retains
  // the full active fleet selector.
  // The prop wins when present (the Quotes screen passes it while converting,
  // before any reservation exists); otherwise the quote loaded with the
  // reservation. Everything below keys off this rather than the prop, so the
  // rules apply identically from every entry point.
  const request = quoted ?? loadedQuote ?? undefined;

  const selectableVehicles = request
    ? vehicles.filter((v) => v.status === "available" && isEligibleAssignment(request, {
        pricing_group: v.pricing_group,
        category: v.category,
        transmission: v.transmission,
        name: v.name,
      }))
    : vehicles.filter((v) => v.status === "available");

  // Computed pricing
  const vehicle = vehicles.find((v) => v.id === form.vehicle_id);
  const rentalDays = form.pickup_date && form.return_date
    ? calcRentalDays(form.pickup_date, form.return_date, form.pickup_time, form.return_time)
    : 0;
  // What the rate card says for this vehicle, these dates and this duration.
  // This is the same month-by-month calculation used by the customer quote and
  // its server-side verifier; using only the pickup month made admin-created
  // reservations disagree whenever a billable period crossed a season.
  const rateSegments = vehicle && form.pickup_date && form.return_date && rentalDays
    ? calcVehicleSegments(
        rates,
        vehicle.pricing_group as PricingGroup,
        form.pickup_date,
        form.return_date,
        rentalDays
      )
    : [];
  const cardVehicleSubtotal = vehicle && form.pickup_date && form.return_date && rentalDays
    ? calcVehicleSubtotal(
        rates,
        vehicle.pricing_group as PricingGroup,
        form.pickup_date,
        form.return_date,
        rentalDays
      )
    : 0;

  // What was actually agreed. Resolved by resolveDailyRate so the rules — an
  // empty box means the card rate, nonsense never becomes NaN, zero is a real
  // decision — live in one tested place rather than inline in the markup.
  const {
    cardRate,
    rate: dailyRate,
    subtotal: vehicleSubtotal,
    overridden: rateOverridden,
    difference: rateDifference,
  } = resolveVehiclePricing(cardVehicleSubtotal, form._daily_rate_override, rentalDays);
  const extrasSelection = {
    gps: form.gps,
    baby_seat: form.baby_seat,
    child_seat: form.child_seat,
    fdw: form.fdw,
    additional_drivers: form.additional_drivers,
  };
  const extraLines = rentalDays ? calcExtrasLines(extras, extrasSelection, rentalDays) : [];
  const extrasSubtotal = rentalDays ? calcExtrasTotal(extras, extrasSelection, rentalDays) : 0;
  const incomplete = missingDeferrable(form);

  // Measured against the return, so a licence valid at collection but expired
  // by the time the vehicle is due back is caught before the keys are handed
  // over rather than after.
  const licence = linkedLicence && form.return_date
    ? licenceStatus(linkedLicence, instant(form.return_date, form.return_time))
    : null;

  // Compared against the quote, if there was one: same category, a free
  // upgrade, or a downgrade needing the customer's agreement.
  const assignedVehicle = vehicles.find(v => v.id === form.vehicle_id);
  const substitution = checkSubstitution(request ?? {}, {
    pricing_group: assignedVehicle?.pricing_group,
    category: assignedVehicle?.category,
    transmission: assignedVehicle?.transmission,
    name: assignedVehicle?.name,
  });
  const discount = parseFloat(String(form.discount_amount || 0));
  const total = parseFloat((vehicleSubtotal + extrasSubtotal - discount).toFixed(2));
  const deposit = parseFloat((total * DEPOSIT_RATE).toFixed(2));
  const balanceDue = parseFloat((total - deposit).toFixed(2));

  function set(key: string, value: unknown) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    // Shared with the public form's field list so the two cannot drift. The
    // rule set differs by design — staff may leave date of birth, nationality
    // and flight number for later — but the fields themselves are the same.
    const problem = validateReservation(form, total);
    if (problem) {
      setSaveError(problem);
      return;
    }

    // The driver must be licensed for the WHOLE rental, not just at collection.
    // A licence that expires mid-hire leaves them uninsured for the rest of it,
    // and the insurer takes the same view whether or not anyone noticed.
    if (licence?.blocks) {
      setSaveError(`${licence.message}. Check the licence at the desk before confirming.`);
      return;
    }

    // No insurance cover means no rental, whatever else is true. Checked before
    // the substitution rules because a valid substitution onto an uninsured
    // vehicle is still an uninsured vehicle.
    if (statutoryBar) {
      setSaveError(`${statutoryBar}. Assign a different vehicle, or clear the paperwork on the Fleet screen first.`);
      return;
    }

    // Transmission and cross-family swaps are refused outright. A downgrade is
    // allowed but must be deliberate, so it asks once rather than blocking —
    // the customer's agreement happens on the phone, not in this form.
    // A blocked change the customer asked for is allowed once that is ticked.
    // The rest — a car booking becoming a bicycle, or a vehicle with no
    // recorded transmission — stays refused whatever the box says.
    if (substitution.verdict === "blocked"
        && !(customerRequestedChange && consentCanPermit(substitution))) {
      setSaveError(substitution.message);
      return;
    }
    if (substitution.verdict === "downgrade" && !customerRequestedChange && !downgradeAcknowledged) {
      setSaveError(`${substitution.message} Press Save again to confirm you have done both.`);
      setDowngradeAcknowledged(true);
      return;
    }

    const paymentConfirmation = form.status === "confirmed" && originalStatus !== "confirmed";
    let paymentAmount: number | undefined;
    if (paymentConfirmation) {
      const entered = prompt(
        `Enter the verified payment received in euros. It must be either the 30% deposit (€${deposit.toFixed(2)}) or the full rental amount (€${total.toFixed(2)}). This will confirm the booking and send the formal confirmation email.`
      );
      if (entered === null) return;
      paymentAmount = Number(entered.trim().replace(",", "."));
      const matchesDeposit = Number.isFinite(paymentAmount) && Math.abs(paymentAmount - deposit) < 0.01;
      const matchesTotal = Number.isFinite(paymentAmount) && Math.abs(paymentAmount - total) < 0.01;
      if (!matchesDeposit && !matchesTotal) {
        setSaveError(`Enter exactly €${deposit.toFixed(2)} (deposit) or €${total.toFixed(2)} (full payment).`);
        return;
      }
    }

    setSaving(true);
    setSaveError("");
    const fullName = [form.customer_first_name, form.customer_last_name].filter(Boolean).join(" ") || form.customer_name;
    // An untouched date input yields "", and the whole form is posted, so the
    // empty string reaches a `date` column and Postgres rejects the insert with
    // `invalid input syntax for type date: ""`.
    const payload = normaliseForStorage({
      ...form,
      customer_name: fullName,
      rental_days: rentalDays,
      daily_rate: dailyRate,
      vehicle_subtotal: vehicleSubtotal,
      extras_subtotal: extrasSubtotal,
      total,
      deposit,
      balance_due: balanceDue,
      ...(paymentConfirmation ? { _payment_verified: true, _payment_amount: paymentAmount } : {}),
      ...(customerRequestedChange ? { _customer_requested_change: true } : {}),
      ...(linkedCustomerId ? { customer_id: linkedCustomerId } : {}),
      ...(quoteId ? { quote_id: quoteId } : {}),
    });
    const url = isEdit ? `/api/admin/reservations/${reservationId}` : "/api/admin/reservations";
    const method = isEdit ? "PATCH" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setSaveError(body.error ?? "Failed to save. Please try again.");
      return;
    }
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
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Loading reservation" tabIndex={-1} className="bg-white rounded-xl p-8 text-gray-600 text-sm">Loading…</div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start sm:items-center justify-center p-4">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="reservation-dialog-title" tabIndex={-1} className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[calc(100vh-2rem)] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 id="reservation-dialog-title" className="font-bold text-gray-900">{isEdit ? "Edit Reservation" : "New Reservation"}</h2>
          <button type="button" aria-label="Close reservation dialog" onClick={onClose} className="text-gray-600 hover:text-gray-900"><X size={20} /></button>
        </div>

        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 overflow-y-auto overscroll-contain flex-1 min-h-0">
          {/* Vehicle */}
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Vehicle</label>
            <Select
              value={form.vehicle_id}
              onChange={(e) => set("vehicle_id", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">— Select vehicle —</option>
              {/*
                Grouped by model rather than by category.

                Every browser renders an <optgroup> label in bold and set apart
                from its options — that is the separation a native <select> can
                actually give. CSS on an <option> is ignored outright on some
                platforms and honoured differently on others, so a rule or a
                bold row would look right on one machine and wrong on the next.

                A model with several vehicles becomes its own heading listing
                only plates, so choosing between four Kymco 125ccs means reading
                four plates rather than four repetitions of the same model name.
                A model with one vehicle would make a heading of one, so those
                stay together under their category.
              */}
              {["car", "motorbike", "bike"].map((cat) => {
                const vs = selectableVehicles.filter((v) => v.category === cat);
                if (!vs.length) return null;

                const byModel = new Map<string, Vehicle[]>();
                for (const v of vs) byModel.set(v.name, [...(byModel.get(v.name) ?? []), v]);

                const multi = [...byModel.entries()].filter(([, list]) => list.length > 1);
                const singles = [...byModel.values()].filter((list) => list.length === 1).flat();
                const catLabel = cat.charAt(0).toUpperCase() + cat.slice(1) + "s";

                return (
                  <Fragment key={cat}>
                    {multi.map(([model, list]) => (
                      <optgroup key={`${cat}-${model}`} label={`${catLabel} · ${model}`}>
                        {list.map((v) => (
                          <option key={v.id} value={v.id}>{v.plate ?? vehicleLabel(v)}</option>
                        ))}
                      </optgroup>
                    ))}
                    {singles.length > 0 && (
                      <optgroup label={multi.length ? `${catLabel} · other` : catLabel}>
                        {singles.map((v) => (
                          <option key={v.id} value={v.id}>{vehicleLabel(v)}</option>
                        ))}
                      </optgroup>
                    )}
                  </Fragment>
                );
              })}
            </Select>
          </div>

          {/* Dates — the same calendar the customer books through, so a date
              read out over the phone is picked the same way it was quoted. */}
          <div className="col-span-2">
            <DateRangePicker
              pickupDate={form.pickup_date}
              returnDate={form.return_date}
              onPickupChange={(d) => set("pickup_date", d)}
              onReturnChange={(d) => set("return_date", d)}
              pickupTime={form.pickup_time}
              returnTime={form.return_time}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Pick-up time</label>
            {/* Half-hour options rather than a free-form time field: the public
                form only ever offers these, so accepting 10:17 here produced a
                reservation the customer could not have made themselves. */}
            <Select value={form.pickup_time} onChange={(e) => set("pickup_time", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Return time</label>
            <Select value={form.return_time} onChange={(e) => set("return_time", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </div>

          {/* Locations */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Pick-up location</label>
            <Select value={form.pickup_location} onChange={(e) => set("pickup_location", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              {LOCATIONS.map((l) => <option key={l}>{l}</option>)}
            </Select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Drop-off location</label>
            <Select value={form.dropoff_location} onChange={(e) => set("dropoff_location", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              {LOCATIONS.map((l) => <option key={l}>{l}</option>)}
            </Select>
          </div>

          {/*
            Status and Notes sit with the rental details rather than below the
            price summary, where they used to be. Changing a status is the
            commonest thing done to a reservation that already exists —
            confirming it, starting it, cancelling it — and reaching it meant
            scrolling past the customer, the extras and the whole price
            breakdown first. Notes travels with it because it is written while
            the customer is still standing there.
          */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
            <Select value={form.status} onChange={(e) => set("status", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm capitalize">
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_LABELS[s] ?? s.replace("_", " ")}</option>)}
            </Select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2}
              placeholder="Anything worth recording about this rental"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none" />
          </div>

          {/* Customer */}
          <div className="col-span-2 border-t border-gray-100 pt-4">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Customer</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  First name <span className="text-red-500">*</span>
                </label>
                <input type="text" required value={form.customer_first_name} onChange={(e) => set("customer_first_name", e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Surname <span className="text-red-500">*</span>
                </label>
                <input type="text" required value={form.customer_last_name} onChange={(e) => set("customer_last_name", e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Email <span className="text-red-500">*</span>
                </label>
                <input type="email" required value={form.customer_email} onChange={(e) => set("customer_email", e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Phone <span className="text-red-500">*</span>
                </label>
                <input type="tel" required value={form.customer_phone} onChange={(e) => set("customer_phone", e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Date of birth</label>
                <SegmentedDateInput
                  key={form.customer_dob || "reservation-dob-blank"}
                  idPrefix="reservation-customer-dob"
                  value={form.customer_dob}
                  onChange={(value) => set("customer_dob", value)}
                  minYear={new Date().getFullYear() - 110}
                  maxYear={new Date().getFullYear() - 18}
                />
                {/* Not enforced — a phone booking rarely yields a birth date on
                    the spot — but the agreement cannot be produced without it,
                    so the reservation is flagged incomplete until it arrives. */}
                <p className="text-[11px] text-gray-600 mt-1">Needed before the rental agreement.</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nationality</label>
                <input type="text" value={form.customer_nationality} onChange={(e) => set("customer_nationality", e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Flight number</label>
                <input type="text" value={form.flight_number} onChange={(e) => set("flight_number", e.target.value.toUpperCase())}
                  placeholder="e.g. A3 320"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                {/* Optional, as at the majors: it exists so a delayed arrival can
                    be tracked and the vehicle held, not as a booking gate. */}
                <p className="text-[11px] text-gray-600 mt-1">Optional — lets us hold the vehicle if the flight is delayed.</p>
              </div>
            </div>
          </div>

          {/* Extras */}
          <div className="col-span-2 border-t border-gray-100 pt-4">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Extras</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {extras.filter((e) => e.enabled && ["gps", "fdw"].includes(e.key)).map((e) => (
                <label key={e.key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={!!form[e.key as keyof typeof form]}
                    onChange={(ev) => set(e.key, ev.target.checked)}
                    className="rounded border-gray-300" />
                  {e.label} <span className="text-gray-600 text-xs">€{e.daily_rate}/day</span>
                </label>
              ))}
              {/* Baby and child seats share the same back seat, so each list
                  offers only what the other leaves. The same rule is enforced
                  in the API and as a database constraint — this is only the
                  convenient end of it. */}
              {extras.filter((e) => e.enabled && ["baby_seat", "child_seat"].includes(e.key)).map((e) => {
                const own = Number(form[e.key as keyof typeof form]) || 0;
                const other = Number(form[e.key === "baby_seat" ? "child_seat" : "baby_seat"]) || 0;
                return (
                  <div key={e.key} className="flex items-center gap-2 text-sm text-gray-700">
                    <label>{e.label} <span className="text-gray-600 text-xs">€{e.daily_rate}/day</span></label>
                    <Select value={own}
                      onChange={(ev) => set(e.key, Number(ev.target.value))}
                      className="border border-gray-300 rounded px-2 py-1 text-sm ml-auto">
                      {Array.from({ length: MAX_CHILD_SEATS_TOTAL + 1 }, (_, n) => n)
                        .filter((n) => n + other <= MAX_CHILD_SEATS_TOTAL || n === own)
                        .map((n) => <option key={n} value={n}>{n}</option>)}
                    </Select>
                  </div>
                );
              })}
              {(Number(form.baby_seat) || 0) + (Number(form.child_seat) || 0) > MAX_CHILD_SEATS_TOTAL && (
                <p className="text-xs text-red-600">{SEATS_LIMIT_MESSAGE}</p>
              )}
              {extras.filter((e) => e.enabled && e.key === "additional_drivers").map((e) => (
                <div key={e.key} className="flex items-center gap-2 text-sm text-gray-700">
                  <label>{e.label} <span className="text-gray-600 text-xs">€{e.daily_rate}/day</span></label>
                  <Select value={form.additional_drivers}
                    onChange={(ev) => set("additional_drivers", Number(ev.target.value))}
                    className="border border-gray-300 rounded px-2 py-1 text-sm ml-auto">
                    {[0, 1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
                  </Select>
                </div>
              ))}
            </div>
          </div>

          {/* Price summary */}
          {rentalDays > 0 && vehicle && (
            <div className="col-span-2 bg-gray-50 rounded-xl p-4 border border-gray-100">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Price Summary</div>
              <div className="space-y-1.5 text-sm">
                {/*
                  The rate is editable in place rather than in a field further
                  down, because this is the line staff are already reading when
                  a customer haggles at the counter. Typing 50 here settles it;
                  working out the equivalent discount total does not.
                */}
                <div className="flex justify-between items-center gap-2 text-gray-700">
                  <span className="flex items-center gap-1.5 flex-wrap">
                    {vehicleLabel(vehicle)} — {rentalDays} day{rentalDays > 1 ? "s" : ""} ×
                    <span className="inline-flex items-center gap-0.5">
                      <span className="text-gray-500">€</span>
                      <input
                        type="number" min="0" step="0.01" inputMode="decimal"
                        aria-label="Daily rate"
                        value={form._daily_rate_override}
                        placeholder={cardRate.toFixed(2)}
                        onChange={(e) => set("_daily_rate_override", e.target.value)}
                        className={`w-20 border rounded px-1.5 py-0.5 text-sm text-right tabular-nums ${
                          rateOverridden
                            ? "border-amber-400 bg-amber-50 font-semibold text-amber-900"
                            : "border-gray-300 bg-white"
                        }`}
                      />
                    </span>
                    {rateSegments.length > 1 ? "average/day" : "/day"}
                  </span>
                  <span className="whitespace-nowrap">€{vehicleSubtotal.toFixed(2)}</span>
                </div>
                {!rateOverridden && rateSegments.length > 1 && (
                  <div className="flex justify-between items-start gap-2 text-xs text-gray-500">
                    <span>
                      Card price: {rateSegments.map((segment, index) => (
                        <Fragment key={`${segment.month}-${index}`}>
                          {index > 0 ? " + " : ""}
                          {segment.monthName} {segment.days} × €{segment.rate.toFixed(2)}
                        </Fragment>
                      ))}
                    </span>
                    <span className="whitespace-nowrap">€{cardVehicleSubtotal.toFixed(2)}</span>
                  </div>
                )}
                {rateOverridden && (
                  <div className="flex justify-between items-start gap-2 text-xs text-amber-700">
                    <span>
                      Agreed flat rate — card {rateSegments.length > 1 ? (
                        <>price is €{cardVehicleSubtotal.toFixed(2)} (weighted average €{cardRate.toFixed(2)}/day)</>
                      ) : (
                        <>rate is €{cardRate.toFixed(2)}/day</>
                      )}
                      {cardRate > 0 && (
                        <>
                          {" "}({rateDifference < 0 ? "−" : "+"}€
                          {Math.abs(rateDifference).toFixed(2)} over {rentalDays} day
                          {rentalDays > 1 ? "s" : ""})
                        </>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => set("_daily_rate_override", "")}
                      className="underline hover:text-amber-900 shrink-0"
                    >
                      reset
                    </button>
                  </div>
                )}
                {extraLines.map((line) => (
                  <div key={line.key} className="flex justify-between items-start gap-3 text-gray-700">
                    <span>
                      {line.label}
                      <span className="ml-1 text-xs text-gray-500">
                        ({line.quantity > 1 ? `${line.quantity} × ` : ""}{line.rentalDays} day{line.rentalDays === 1 ? "" : "s"} × €{line.dailyRate.toFixed(2)}/day)
                      </span>
                    </span>
                    <span className="whitespace-nowrap">€{line.total.toFixed(2)}</span>
                  </div>
                ))}
                {discount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Discount{form.discount_reason ? ` (${form.discount_reason})` : ""}</span>
                    <span>−€{discount.toFixed(2)}</span>
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

          {/* Discount */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Discount (€)</label>
            <input type="number" min="0" step="0.01" value={form.discount_amount || ""}
              onChange={(e) => set("discount_amount", parseFloat(e.target.value) || 0)}
              placeholder="0.00"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Discount reason</label>
            <input type="text" value={form.discount_reason} onChange={(e) => set("discount_reason", e.target.value)}
              placeholder="e.g. Loyalty, Promo code"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          {/* AADE DCL status */}
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">AADE Digital Client List (DCL)</label>
            <div className="flex gap-2 items-start">
              <Select value={(form as { dcl_status?: string }).dcl_status ?? "not_submitted"}
                onChange={(e) => set("dcl_status", e.target.value)}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="not_submitted">Not submitted</option>
                <option value="pending">Pending submission</option>
                <option value="submitted">Submitted</option>
                <option value="error">Submission error</option>
              </Select>
              {isEdit && (
                <button onClick={handleAadeSubmit} disabled={aadeSubmitting}
                  className="flex items-center gap-1.5 px-3 py-2 bg-gray-800 text-white text-xs font-medium rounded-lg hover:bg-gray-900 disabled:opacity-50 transition whitespace-nowrap">
                  <Send size={12} /> {aadeSubmitting ? "Submitting…" : "Submit to AADE"}
                </button>
              )}
            </div>
            {aadeResult && (
              <p className={`text-xs mt-1 ${aadeResult.ok ? "text-green-600" : "text-red-600"}`}>
                {aadeResult.ok ? `✓ Submitted. Mark: ${aadeResult.mark ?? "—"}` : aadeResult.error}
              </p>
            )}
          </div>

          {/* myDATA e-Invoice (Απόδειξη / Τιμολόγιο) */}
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">myDATA e-Invoice (Απόδειξη / Τιμολόγιο)</label>
            <div className="flex gap-2 items-start">
              <div className={`flex-1 border rounded-lg px-3 py-2 text-sm ${
                invoiceStatus === "issued" ? "border-green-300 bg-green-50 text-green-800"
                : invoiceStatus === "error" ? "border-red-200 bg-red-50 text-red-700"
                : "border-gray-200 bg-gray-50 text-gray-500"
              }`}>
                {invoiceStatus === "issued"
                  ? `✓ Issued — MARK: ${invoiceMark ?? "—"}`
                  : invoiceStatus === "error"
                  ? "Submission error — retry below"
                  : "Not yet issued"}
              </div>
              {isEdit && invoiceStatus !== "issued" && (
                <button onClick={handleInvoiceSubmit} disabled={invoiceSubmitting}
                  className="flex items-center gap-1.5 px-3 py-2 bg-blue-700 text-white text-xs font-medium rounded-lg hover:bg-blue-800 disabled:opacity-50 transition whitespace-nowrap">
                  <Send size={12} /> {invoiceSubmitting ? "Issuing…" : "Issue Invoice"}
                </button>
              )}
            </div>
            {invoiceResult && !invoiceResult.ok && (
              <p className="text-xs mt-1 text-red-600">{invoiceResult.error}</p>
            )}
            {invoiceResult?.ok && (
              <p className="text-xs mt-1 text-green-600">
                ✓ Invoice issued — Series {invoiceResult.series}/{invoiceResult.aa}, MARK: {invoiceResult.mark}
              </p>
            )}
          </div>

          {/* Stripe Deposit */}
          {isEdit && (
            <div className="col-span-2 border-t border-gray-100 pt-4">
              <QuoteConfirmationButton reservationId={reservationId!} disabled={form.status === "confirmed"} />
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Deposit payment links</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <StripeDepositButton reservationId={reservationId!} />
                <WiseDepositButton reservationId={reservationId!} />
              </div>
            </div>
          )}

          {/* SMS */}
          {isEdit && (
            <div className="col-span-2 border-t border-gray-100 pt-4">
              <label className="block text-xs font-medium text-gray-600 mb-1">SMS to Customer</label>
              <SmsButton reservationId={reservationId!} />
            </div>
          )}

          {/* Customer linking */}
          <div className="col-span-2 border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Link to CRM customer</span>
              <button onClick={() => setShowCustomerSearch((v) => !v)}
                className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                <Search size={11} /> {linkedCustomerId ? "Change" : "Search"}
              </button>
            </div>
            {linkedCustomerId && !showCustomerSearch && (
              <p className="text-xs text-green-600">✓ Linked to customer record</p>
            )}
            {showCustomerSearch && (
              <div className="relative">
                <input type="text" value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)}
                  placeholder="Search by name, email or phone…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" autoFocus />
                {customerResults.length > 0 && (
                  <div className="absolute z-10 top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg mt-1">
                    {customerResults.map((c) => (
                      <button key={c.id} onClick={() => linkCustomer(c)}
                        className="w-full text-left px-3 py-2.5 hover:bg-gray-50 border-b border-gray-50 last:border-0">
                        <div className="text-sm font-medium text-gray-900">{c.full_name}</div>
                        <div className="text-xs text-gray-600">{c.email} · {c.phone}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Document upload */}
          {isEdit && (
            <div className="col-span-2 border-t border-gray-100 pt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Documents</span>
                <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:underline disabled:opacity-50">
                  <Upload size={11} /> {uploading ? "Uploading…" : "Upload"}
                </button>
                <input ref={fileInputRef} type="file" className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])} />
              </div>
              {documents.length === 0 ? (
                <p className="text-xs text-gray-600">No documents uploaded yet.</p>
              ) : (
                <div className="space-y-1">
                  {documents.map((doc) => (
                    <div key={doc.path} className="flex items-center justify-between text-xs">
                      <button onClick={() => handleDocumentDownload(doc.path, doc.name)}
                        className="flex items-center gap-1.5 text-blue-600 hover:underline truncate max-w-[70%]">
                        <FileText size={11} /> {doc.name}
                      </button>
                      <button onClick={() => handleDocumentDelete(doc.path)}
                        className="text-gray-500 hover:text-red-600 ml-2"><X size={11} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {conflictWarning && (
          <div className="mx-6 mb-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
            ⚠️ {conflictWarning}
          </div>
        )}
        {saveError && (
          <div className="mx-6 mb-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
            {saveError}
          </div>
        )}
        {/* A licence that covers the booking but cannot absorb an extension or a
            late return. Not refused — worth knowing before the keys go out. */}
        {!saveError && licence?.severity === "tight" && (
          <div className="mx-6 mb-2 text-xs text-amber-800 bg-amber-50 border border-amber-300 rounded-lg px-4 py-2">
            {licence.message}.
          </div>
        )}
        {/* What the customer actually asked for.
            Allocating a vehicle means matching a request, and that request was
            not on this screen at all — staff had to open the Quotes page in
            another tab to see which category or transmission had been booked.
            Shown for website bookings only; a walk-in has no quote and nothing
            to compare against. */}
        {request && (
          <div className="mx-6 mb-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <p className="mb-1.5 text-xs font-bold text-gray-700">
              Customer&rsquo;s original request
              {loadedQuote?.ref ? <span className="ml-1.5 font-mono font-normal text-gray-500">{loadedQuote.ref}</span> : null}
            </p>
            {/* The dates the customer actually asked for. Given its own line
                rather than a chip because when staff have already moved the
                booking, the gap between what was requested and what the
                reservation now says is the thing they need to notice. */}
            {loadedQuote?.pickup_date && loadedQuote?.return_date && (() => {
              const changed =
                loadedQuote.pickup_date !== form.pickup_date ||
                loadedQuote.return_date !== form.return_date;
              return (
                <p className={`mb-1.5 text-xs ${changed ? "font-semibold text-amber-800" : "text-gray-700"}`}>
                  <span className="font-normal text-gray-600">Requested:</span>{" "}
                  {loadedQuote.pickup_date}
                  {loadedQuote.pickup_time ? ` ${loadedQuote.pickup_time}` : ""}
                  {" → "}
                  {loadedQuote.return_date}
                  {loadedQuote.return_time ? ` ${loadedQuote.return_time}` : ""}
                  {loadedQuote.rental_days
                    ? ` · ${loadedQuote.rental_days} day${loadedQuote.rental_days === 1 ? "" : "s"}`
                    : ""}
                  {changed && <span className="ml-1.5 font-normal">— the reservation now differs</span>}
                </p>
              );
            })()}
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-600">
              {request.model && <span><span className="text-gray-600">Vehicle:</span> <strong className="text-gray-800">{request.model}</strong></span>}
              {request.transmission && <span><span className="text-gray-600">Transmission:</span> <strong className="text-gray-800">{request.transmission}</strong></span>}
              {loadedQuote?.driver_age && <span><span className="text-gray-600">Driver age:</span> {loadedQuote.driver_age}</span>}
              {(loadedQuote?.baby_seat ?? 0) > 0 && <span><span className="text-gray-600">Baby seats:</span> {loadedQuote?.baby_seat}</span>}
              {(loadedQuote?.child_seat ?? 0) > 0 && <span><span className="text-gray-600">Child seats:</span> {loadedQuote?.child_seat}</span>}
              {(loadedQuote?.additional_drivers ?? 0) > 0 && <span><span className="text-gray-600">Extra drivers:</span> {loadedQuote?.additional_drivers}</span>}
              {loadedQuote?.fdw && <span className="text-gray-800">FDW</span>}
            </div>
            {loadedQuote?.comments && (
              <p className="mt-1.5 text-xs italic text-gray-500">&ldquo;{loadedQuote.comments}&rdquo;</p>
            )}
          </div>
        )}
        {/* Substitution against the quote, shown before saving rather than
            discovered at the desk. Blocked cases are surfaced by saveError. */}
        {!saveError && substitution.verdict === "upgrade" && (
          <div className="mx-6 mb-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2">
            {substitution.message}
          </div>
        )}
        {!saveError && substitution.verdict === "downgrade" && (
          <div className="mx-6 mb-2 text-xs text-amber-800 bg-amber-50 border border-amber-300 rounded-lg px-4 py-2">
            {substitution.message}
          </div>
        )}
        {/* Offered only where the customer's agreement is the actual missing
            ingredient — a different transmission, or a lower category. Never
            for a car booking becoming a bicycle, or a vehicle whose
            transmission the fleet record does not hold: no amount of agreement
            fixes either, so a tick box there would only mislead. */}
        {consentCanPermit(substitution) && (
          <label className="mx-6 mb-2 flex items-start gap-2.5 rounded-lg border border-blue-300 bg-blue-50 px-4 py-2.5 text-xs text-blue-900">
            <input
              type="checkbox"
              checked={customerRequestedChange}
              onChange={(e) => setCustomerRequestedChange(e.target.checked)}
              className="mt-0.5 rounded border-blue-400"
            />
            <span>
              <strong>The customer requested this change.</strong> Tick only if they
              have actually asked for it. This is recorded on the reservation with the
              date, and is what would be relied on if they later say they did not agree.
            </span>
          </label>
        )}
        {/* Deferred fields are named rather than merely absent, so a booking
            taken in a hurry can still be saved without the gap being forgotten. */}
        {!saveError && substitution.verdict === "ok" && incomplete.length > 0 && (
          <div className="mx-6 mb-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
            Saves fine — still missing {incomplete.join(", ")}. Needed before the rental agreement.
          </div>
        )}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 shrink-0">
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
              disabled={saving || !!conflictWarning || !form.vehicle_id || !form.pickup_date || !form.return_date}
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

// ─── Sub-components ───────────────────────────────────────────

interface QuoteDelivery {
  id: string;
  kind: "acknowledgment" | "quote_confirmation" | "booking_confirmation";
  intended_recipient_email: string;
  subject: string;
  payment_deadline: string | null;
  status: "pending" | "queued" | "accepted" | "sent" | "delivered" | "delayed" | "bounced" | "complained" | "failed" | "suppressed";
  redirected: boolean;
  accepted_at: string | null;
  delivered_at: string | null;
  last_event_at: string | null;
  last_error: string | null;
  created_at: string;
}

const DELIVERY_LABELS: Record<QuoteDelivery["status"], string> = {
  pending: "Preparing",
  queued: "Queued for retry",
  accepted: "Accepted by email provider",
  sent: "Sent by email provider",
  delivered: "Delivered to recipient's mail server",
  delayed: "Delivery delayed",
  bounced: "Bounced",
  complained: "Marked as spam",
  failed: "Failed",
  suppressed: "Suppressed by email provider",
};

function deliveryTone(status: QuoteDelivery["status"]): string {
  if (status === "delivered") return "border-green-200 bg-green-50 text-green-800";
  if (["bounced", "complained", "failed", "suppressed"].includes(status)) return "border-red-200 bg-red-50 text-red-800";
  if (["queued", "delayed"].includes(status)) return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-blue-200 bg-white text-blue-800";
}

function zakynthosDateTime(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Athens",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function QuoteConfirmationButton({ reservationId, disabled }: { reservationId: string; disabled: boolean }) {
  const [deadline, setDeadline] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Every workflow delivery, so the stage can be derived; the history list
  // below still shows only the quote confirmations it is about.
  const [allDeliveries, setAllDeliveries] = useState<QuoteDelivery[]>([]);
  const deliveries = allDeliveries.filter((d) => d.kind === "quote_confirmation");
  const workflow = deriveWorkflowStage(allDeliveries as unknown as DeliveryRow[]);

  const loadDeliveries = useCallback(async () => {
    const response = await fetch(`/api/admin/reservations/${reservationId}/quote-confirmation`);
    const data = await response.json().catch(() => ({}));
    if (response.ok) setAllDeliveries(Array.isArray(data.deliveries) ? data.deliveries : []);
  }, [reservationId]);

  useEffect(() => { void loadDeliveries(); }, [loadDeliveries]);

  const send = useCallback(async () => {
    if (!deadline) {
      setError("Choose the deposit payment deadline first.");
      return;
    }
    if (deliveries.length > 0 && !window.confirm(
      "A quote confirmation has already been sent for this reservation. Send another confirmation?",
    )) return;
    setSending(true);
    setError(null);
    setResult(null);
    const res = await fetch(`/api/admin/reservations/${reservationId}/quote-confirmation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deadline }),
    });
    const data = await res.json().catch(() => ({}));
    setSending(false);
    if (!res.ok) {
      setError(data.error ?? "The quote confirmation could not be sent.");
      return;
    }
    setResult(data.queued ? "Quote confirmation queued for delivery." : "Quote confirmation accepted by the email provider.");
    await loadDeliveries();
  }, [deadline, deliveries.length, loadDeliveries, reservationId]);

  return (
    <div className="mb-4 rounded-xl border-2 border-blue-200 bg-blue-50 p-3">
      <p className="text-sm font-bold text-blue-900">Quote confirmation</p>
      <p className="text-xs text-blue-700">
        Confirms category availability and final price. It does not confirm the booking.
      </p>
      <p className="mb-3 mt-1 text-xs text-blue-700">
        Sent to the customer with a private office copy; replies go to customerservice@anadyon.gr.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex-1 text-xs font-medium text-blue-900">
          Deposit payment deadline (Zakynthos time)
          <input
            type="datetime-local"
            value={deadline}
            onChange={(event) => setDeadline(event.target.value)}
            disabled={disabled || sending}
            className="mt-1 w-full rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:opacity-50"
          />
        </label>
        <button
          type="button"
          onClick={send}
          disabled={disabled || sending || !deadline}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-blue-800 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-900 disabled:opacity-50"
        >
          <Send size={12} /> {sending ? "Sending…" : deliveries.length ? "Send another confirmation" : "Send quote confirmation"}
        </button>
      </div>
      {/* Derived from the delivery records, never editable. The condition is
          shown beside the stage so "Booking confirmed" cannot be read as "the
          customer received it" when the message actually bounced. */}
      {workflow.display && (
        <p className="mt-2 text-xs text-blue-900">
          <span className="font-bold">Customer email stage:</span>{" "}
          <span className={workflow.condition === "delivered" ? "" : "font-semibold text-amber-800"}>
            {workflow.display}
          </span>
        </p>
      )}
      {disabled && <p className="mt-2 text-xs text-blue-700">Payment is already recorded; this booking is confirmed.</p>}
      {result && <p className="mt-2 text-xs font-medium text-green-700">✓ {result}</p>}
      {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}
      {deliveries.length > 0 && (
        <div className="mt-3 space-y-2 border-t border-blue-200 pt-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-blue-900">Delivery history</p>
            <button type="button" onClick={() => void loadDeliveries()} className="text-xs font-semibold text-blue-700 underline">
              Refresh
            </button>
          </div>
          {deliveries.map((delivery) => (
            <div key={delivery.id} className={`rounded-lg border px-3 py-2 text-xs ${deliveryTone(delivery.status)}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold">{DELIVERY_LABELS[delivery.status]}</span>
                <span>{zakynthosDateTime(delivery.created_at)}</span>
              </div>
              <p className="mt-1">To: {delivery.redirected ? `Test inbox (intended for ${delivery.intended_recipient_email})` : delivery.intended_recipient_email}</p>
              <p>Payment deadline: {zakynthosDateTime(delivery.payment_deadline)}</p>
              {delivery.delivered_at && <p>Delivered: {zakynthosDateTime(delivery.delivered_at)}</p>}
              {delivery.last_error && <p className="mt-1 font-medium">Provider response: {delivery.last_error}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StripeDepositButton({ reservationId }: { reservationId: string }) {
  const [loading, setLoading] = useState(false);
  const [link, setLink] = useState<{ url: string; reference: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/stripe/create-payment-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservationId }),
    });
    const data = await res.json();
    setLoading(false);
    if (data.checkoutUrl) {
      setLink({ url: data.checkoutUrl, reference: data.reference ?? "" });
    } else {
      setError(data.error ?? "Failed to create payment link");
    }
  }, [reservationId]);

  return (
    <div className="rounded-xl border-2 border-purple-200 bg-purple-50 p-3">
      <p className="text-sm font-bold text-purple-900">Stripe · Card payment</p>
      <p className="mb-3 text-xs text-purple-700">Payment is confirmed automatically.</p>
      {link ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-purple-900">Stripe link · Ref {link.reference}</p>
          <a href={link.url} target="_blank" rel="noopener noreferrer"
            className="block break-all text-xs text-purple-700 underline">{link.url}</a>
          <button type="button" onClick={async () => { await navigator.clipboard.writeText(link.url); setCopied(true); }}
            className="rounded-md bg-purple-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-800">
            {copied ? "Stripe link copied ✓" : "Copy Stripe link"}
          </button>
        </div>
      ) : (
        <button type="button" onClick={create} disabled={loading}
          className="flex items-center gap-1.5 rounded-lg bg-purple-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-purple-800 disabled:opacity-50">
          <Link size={11} /> {loading ? "Generating…" : "Generate Stripe link"}
        </button>
      )}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

function SmsButton({ reservationId }: { reservationId: string }) {
  const [template, setTemplate] = useState("confirmation");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const send = useCallback(async () => {
    setSending(true);
    setResult(null);
    const res = await fetch("/api/admin/sms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservationId, template }),
    });
    const data = await res.json();
    setSending(false);
    setResult(data.ok ? "✓ SMS sent" : `Error: ${data.error}`);
  }, [reservationId, template]);

  return (
    <div className="flex items-center gap-2">
      <Select value={template} onChange={(e) => setTemplate(e.target.value)}
        className="text-xs border border-gray-300 rounded px-2 py-1">
        <option value="confirmation">Booking confirmed (payment received)</option>
        <option value="pickup_reminder">Pickup reminder</option>
        <option value="return_reminder">Return reminder</option>
      </Select>
      <button onClick={send} disabled={sending}
        className="flex items-center gap-1 text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50 transition">
        <MessageSquare size={11} /> {sending ? "Sending…" : "Send SMS"}
      </button>
      {result && <span className="text-xs text-gray-600">{result}</span>}
    </div>
  );
}

/**
 * Wise deposit request.
 *
 * Unlike Stripe there is no callback when the customer pays, so the reservation
 * will not confirm itself — the payment has to be reconciled in Wise. The
 * button says so rather than leaving that as a surprise.
 */
function WiseDepositButton({ reservationId }: { reservationId: string }) {
  const [loading, setLoading] = useState(false);
  const [link, setLink] = useState<{ url: string; reference: string; qr: string | null } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/wise/deposit-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservationId }),
    });
    const data = await res.json();
    setLoading(false);
    if (res.ok && data.url) setLink({ url: data.url, reference: data.reference, qr: data.qr ?? null });
    else setError(data.error ?? "Failed to build Wise link");
  }, [reservationId]);

  if (link) {
    return (
      <div className="rounded-xl border-2 border-green-200 bg-green-50 p-3">
        <p className="text-sm font-bold text-green-900">Wise · Bank transfer</p>
        <p className="mb-3 text-xs text-green-700">Payment must be checked and marked manually.</p>
        <p className="text-xs font-semibold text-green-900">Wise link · Ref {link.reference}</p>
        <a href={link.url} target="_blank" rel="noopener noreferrer"
          className="mt-1 block break-all text-xs text-green-700 underline">{link.url}</a>
        <button type="button" onClick={async () => { await navigator.clipboard.writeText(link.url); setCopied(true); }}
          className="mt-2 rounded-md bg-green-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-900">
          {copied ? "Wise link copied ✓" : "Copy Wise link"}
        </button>
        {link.qr && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={link.qr}
            alt={`Wise payment QR for ${link.reference}`}
            width={160}
            height={160}
            className="mt-2 rounded border border-gray-200 bg-white"
          />
        )}
        <p className="text-xs text-gray-500 mt-1">
          Reference <strong>{link.reference}</strong> — Wise does not notify us when it is paid,
          so mark the deposit received once it lands.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border-2 border-green-200 bg-green-50 p-3">
      <p className="text-sm font-bold text-green-900">Wise · Bank transfer</p>
      <p className="mb-3 text-xs text-green-700">Payment must be checked and marked manually.</p>
      <button type="button" onClick={create} disabled={loading}
        className="flex items-center gap-1.5 rounded-lg bg-green-800 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-green-900 disabled:opacity-50">
        <Link size={11} /> {loading ? "Building…" : "Generate Wise link"}
      </button>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}
