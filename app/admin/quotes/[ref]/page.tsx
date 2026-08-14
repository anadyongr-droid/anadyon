"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import ReservationModal from "../../components/ReservationModal";

interface Quote {
  ref: string;
  title: string;
  first_name: string;
  last_name: string;
  email: string;
  dob: string;
  address: string;
  postal_code: string;
  city: string;
  country: string;
  mobile_tel: string;
  landline_tel: string;
  vehicle_type: string;
  selected_model: string;
  pickup_location: string;
  dropoff_location: string;
  pickup_date: string;
  pickup_time: string;
  dropoff_date: string;
  dropoff_time: string;
  driver_age: string;
  transmission: string;
  baby_seat: number;
  child_seat: number;
  fdw: boolean;
  additional_drivers: number;
  rental_days: number;
  daily_rate: number;
  vehicle_subtotal: number;
  extras_subtotal: number;
  total: number;
  deposit: number;
  balance_due: number;
  comments: string;
  created_at: string;
}

interface Vehicle {
  id: string;
  name: string;
  category: string;
  pricing_group: string;
  status: string;
}

function Row({ label, value }: { label: string; value?: string | number | boolean | null }) {
  if (value === null || value === undefined || value === "" || value === false) return null;
  return (
    <div className="flex gap-4 py-2 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-400 w-40 shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-gray-900">{String(value)}</span>
    </div>
  );
}

export default function QuoteDetailPage() {
  const { ref } = useParams<{ ref: string }>();
  const router = useRouter();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/admin/quotes/${ref}`).then((r) => r.json()),
      fetch("/api/admin/vehicles").then((r) => r.json()),
    ]).then(([q, v]) => {
      setQuote(q);
      setVehicles(v);
      setLoading(false);
    });
  }, [ref]);

  if (loading) return <div className="p-6 text-sm text-gray-400">Loading…</div>;
  if (!quote || (quote as { error?: string }).error) return <div className="p-6 text-sm text-red-500">Quote not found.</div>;

  const locationMap = (raw: string) => {
    if (!raw) return "Our Office";
    const l = raw.toLowerCase();
    if (l.includes("airport")) return "Airport";
    if (l.includes("port")) return "Port (Zakynthos town)";
    return "Our Office";
  };

  // Pre-fill values for the ReservationModal
  const modalDefaults = {
    customer_name: `${quote.first_name} ${quote.last_name}`,
    customer_email: quote.email,
    customer_phone: quote.mobile_tel,
    pickup_date: quote.pickup_date,
    pickup_time: quote.pickup_time ?? "09:00",
    return_date: quote.dropoff_date,
    return_time: quote.dropoff_time ?? "09:00",
    pickup_location: locationMap(quote.pickup_location),
    dropoff_location: locationMap(quote.dropoff_location),
    baby_seat: quote.baby_seat ?? 0,
    child_seat: quote.child_seat ?? 0,
    fdw: !!quote.fdw,
    additional_drivers: quote.additional_drivers ?? 0,
    notes: `Quote ref: ${quote.ref}${quote.comments ? `. Notes: ${quote.comments}` : ""}`,
  };

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600 transition">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Quote — {ref}</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Received {new Date(quote.created_at).toLocaleDateString("el-GR", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
        <div className="ml-auto">
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-800 transition"
          >
            Convert to reservation <ArrowRight size={14} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Customer */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Customer</h2>
          <Row label="Name" value={`${quote.title} ${quote.first_name} ${quote.last_name}`} />
          <Row label="Email" value={quote.email} />
          <Row label="Mobile" value={quote.mobile_tel} />
          <Row label="Landline" value={quote.landline_tel} />
          <Row label="Date of birth" value={quote.dob} />
          <Row label="Address" value={[quote.address, quote.postal_code, quote.city, quote.country].filter(Boolean).join(", ")} />
          <Row label="Driver age" value={quote.driver_age} />
        </div>

        {/* Rental */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Rental Details</h2>
          <Row label="Vehicle type" value={quote.vehicle_type} />
          <Row label="Model requested" value={quote.selected_model} />
          <Row label="Transmission" value={quote.transmission} />
          <Row label="Pick-up" value={`${quote.pickup_location} — ${quote.pickup_date} at ${quote.pickup_time}`} />
          <Row label="Return" value={`${quote.dropoff_location} — ${quote.dropoff_date} at ${quote.dropoff_time}`} />
          <Row label="Rental days" value={quote.rental_days} />
        </div>

        {/* Extras */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Extras</h2>
          <Row label="FDW" value={quote.fdw ? "Yes" : null} />
          <Row label="Baby seat" value={quote.baby_seat > 0 ? quote.baby_seat : null} />
          <Row label="Child seat" value={quote.child_seat > 0 ? quote.child_seat : null} />
          <Row label="Additional drivers" value={quote.additional_drivers > 0 ? quote.additional_drivers : null} />
          {!quote.fdw && !quote.baby_seat && !quote.child_seat && !quote.additional_drivers && (
            <p className="text-sm text-gray-400">None selected</p>
          )}
        </div>

        {/* Pricing */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Price Estimate</h2>
          {quote.total > 0 ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-gray-700">
                <span>Vehicle ({quote.rental_days} days × €{quote.daily_rate?.toFixed(2)})</span>
                <span>€{quote.vehicle_subtotal?.toFixed(2)}</span>
              </div>
              {quote.extras_subtotal > 0 && (
                <div className="flex justify-between text-gray-700">
                  <span>Extras</span>
                  <span>€{quote.extras_subtotal?.toFixed(2)}</span>
                </div>
              )}
              <div className="border-t border-gray-100 pt-2 flex justify-between font-bold text-gray-900">
                <span>Total</span>
                <span>€{quote.total?.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-400">
                <span>Deposit (30%)</span>
                <span>€{quote.deposit?.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-400">
                <span>Balance at pick-up</span>
                <span>€{quote.balance_due?.toFixed(2)}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400">No pricing available (no model match)</p>
          )}
        </div>

        {/* Comments */}
        {quote.comments && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 md:col-span-2">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Customer Notes</h2>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{quote.comments}</p>
          </div>
        )}
      </div>

      {showModal && (
        <ReservationModal
          vehicles={vehicles.filter((v) => quote.vehicle_type?.toLowerCase().startsWith(v.category))}
          initialValues={modalDefaults}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); router.push("/admin/reservations"); }}
        />
      )}
    </div>
  );
}
