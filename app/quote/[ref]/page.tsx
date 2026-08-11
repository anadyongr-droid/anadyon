"use client";
import { useState, useEffect } from "react";
import { use } from "react";
import { useSearchParams } from "next/navigation";
import { buildExtrasLineItems } from "@/lib/pricing";
import type { ExtrasConfig } from "@/lib/pricing";

type Quote = {
  ref: string;
  title: string;
  first_name: string;
  last_name: string;
  email: string;
  vehicle_type: string;
  selected_model: string;
  pickup_location: string;
  dropoff_location: string;
  pickup_date: string;
  pickup_time: string;
  dropoff_date: string;
  dropoff_time: string;
  rental_days: number;
  daily_rate: number;
  vehicle_subtotal: number;
  extras_subtotal: number;
  total: number;
  deposit: number;
  balance_due: number;
  driver_age: string;
  transmission: string | null;
  baby_seat: number;
  child_seat: number;
  fdw: boolean;
  additional_drivers: number;
  comments: string | null;
  created_at: string;
  expires_at: string;
};

export default function QuoteLookupPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = use(params);
  const searchParams = useSearchParams();
  const [surname, setSurname] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [extrasConfig, setExtrasConfig] = useState<ExtrasConfig[]>([]);

  // Auto-fetch when arriving from the landing page with surname in URL
  useEffect(() => {
    const s = searchParams.get("surname");
    if (s) {
      setSurname(s);
      fetchQuote(ref, s);
    }
    fetch("/api/admin/rates").then(r => r.json()).then(({ extras }) => setExtrasConfig(extras ?? []));
  }, []);

  async function fetchQuote(r: string, s: string) {
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/quote/${encodeURIComponent(r)}?surname=${encodeURIComponent(s)}`);
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
    } else {
      setQuote(data);
    }
  }

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    fetchQuote(ref, surname);
  }

  const showPrice = quote && quote.total > 0;

  return (
    <div className="bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="max-w-2xl mx-auto px-4 py-16">
        <h1 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">View Your Quote</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-8 text-sm">
          Reference: <span className="font-mono font-semibold text-gray-800 dark:text-gray-200">{ref.toUpperCase()}</span>
        </p>

        {!quote && (
          <form onSubmit={handleLookup} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">Enter the surname you used when submitting the quote request.</p>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Last Name</label>
              <input
                type="text"
                required
                value={surname}
                onChange={e => setSurname(e.target.value)}
                placeholder="Your surname"
                className="w-full border dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200"
              />
            </div>
            {error && (
              <p className="text-red-600 dark:text-red-400 text-sm font-medium bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-orange-600 text-white font-semibold py-3 rounded-lg hover:bg-orange-700 transition disabled:opacity-50"
            >
              {loading ? "Looking up…" : "View Quote"}
            </button>
          </form>
        )}

        {quote && (
          <div className="space-y-5">
            {/* Header */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                    {quote.title} {quote.first_name} {quote.last_name}
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 font-mono">{quote.ref}</p>
                </div>
                <span className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 text-xs font-semibold px-3 py-1 rounded-full">
                  Quote — not confirmed
                </span>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Submitted {new Date(quote.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                {" · "}Online view available until {new Date(quote.expires_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
              </p>
            </div>

            {/* Rental details */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Rental Details</h3>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-gray-500 dark:text-gray-400">Vehicle</dt><dd className="font-medium text-gray-900 dark:text-white">{quote.selected_model}</dd></div>
                <div className="flex justify-between"><dt className="text-gray-500 dark:text-gray-400">Pick-up</dt><dd className="font-medium text-gray-900 dark:text-white">{quote.pickup_location} — {quote.pickup_date} at {quote.pickup_time}</dd></div>
                <div className="flex justify-between"><dt className="text-gray-500 dark:text-gray-400">Drop-off</dt><dd className="font-medium text-gray-900 dark:text-white">{quote.dropoff_location} — {quote.dropoff_date} at {quote.dropoff_time}</dd></div>
                <div className="flex justify-between"><dt className="text-gray-500 dark:text-gray-400">Duration</dt><dd className="font-medium text-gray-900 dark:text-white">{quote.rental_days} day{quote.rental_days > 1 ? "s" : ""}</dd></div>
                <div className="flex justify-between"><dt className="text-gray-500 dark:text-gray-400">Driver age</dt><dd className="font-medium text-gray-900 dark:text-white">{quote.driver_age}</dd></div>
                {quote.transmission && <div className="flex justify-between"><dt className="text-gray-500 dark:text-gray-400">Transmission</dt><dd className="font-medium text-gray-900 dark:text-white">{quote.transmission}</dd></div>}
              </dl>
            </div>

            {/* Extras */}
            {(quote.baby_seat > 0 || quote.child_seat > 0 || quote.fdw || quote.additional_drivers > 0) && (
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Extras</h3>
                <dl className="space-y-2 text-sm">
                  {quote.baby_seat > 0 && <div className="flex justify-between"><dt className="text-gray-500 dark:text-gray-400">Baby Seat (0–9 months)</dt><dd className="font-medium text-gray-900 dark:text-white">×{quote.baby_seat}</dd></div>}
                  {quote.child_seat > 0 && <div className="flex justify-between"><dt className="text-gray-500 dark:text-gray-400">Child Seat (9+ months)</dt><dd className="font-medium text-gray-900 dark:text-white">×{quote.child_seat}</dd></div>}
                  {quote.fdw && <div className="flex justify-between"><dt className="text-gray-500 dark:text-gray-400">Full Damage Waiver (FDW)</dt><dd className="font-medium text-gray-900 dark:text-white">Yes</dd></div>}
                  {quote.additional_drivers > 0 && <div className="flex justify-between"><dt className="text-gray-500 dark:text-gray-400">Additional Drivers</dt><dd className="font-medium text-gray-900 dark:text-white">×{quote.additional_drivers}</dd></div>}
                </dl>
              </div>
            )}

            {/* Price */}
            {showPrice && (
              <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-xl p-6">
                <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-4">Price Estimate</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-gray-700 dark:text-gray-300">
                    <span>{quote.selected_model} — {quote.rental_days} day{quote.rental_days > 1 ? "s" : ""} × €{Number(quote.daily_rate).toFixed(2)}</span>
                    <span>€{Number(quote.vehicle_subtotal).toFixed(2)}</span>
                  </div>
                  {buildExtrasLineItems(extrasConfig, {
                    gps: false,
                    baby_seat: quote.baby_seat,
                    child_seat: quote.child_seat,
                    fdw: quote.fdw,
                    additional_drivers: quote.additional_drivers,
                  }, quote.rental_days).map(item => (
                    <div key={item.key} className="flex justify-between text-gray-600 dark:text-gray-400">
                      <span>{item.label}{item.qty > 1 ? ` ×${item.qty}` : ""} — {quote.rental_days} day{quote.rental_days > 1 ? "s" : ""} × €{item.rate.toFixed(2)}</span>
                      <span>€{item.amount.toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="border-t border-blue-200 dark:border-blue-700 pt-2 flex justify-between font-bold text-gray-900 dark:text-white">
                    <span>Total (incl. VAT)</span>
                    <span>€{Number(quote.total).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-500 dark:text-gray-400 text-xs">
                    <span>Deposit (30%) due on confirmation</span>
                    <span>€{Number(quote.deposit).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-500 dark:text-gray-400 text-xs">
                    <span>Balance due at pick-up</span>
                    <span>€{Number(quote.balance_due).toFixed(2)}</span>
                  </div>
                </div>
                <p className="text-xs text-blue-700 dark:text-blue-300 mt-3">This is an estimate only. Final price confirmed upon booking.</p>
              </div>
            )}

            {/* Comments */}
            {quote.comments && (
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Your Comments</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">{quote.comments}</p>
              </div>
            )}

            {/* Footer note */}
            <div className="text-center text-sm text-gray-500 dark:text-gray-400 space-y-1">
              <p>Questions? Contact us at <a href="mailto:customerservice@anadyon.gr" className="text-blue-700 dark:text-blue-400 underline">customerservice@anadyon.gr</a> or call <a href="tel:+306988010188" className="text-blue-700 dark:text-blue-400 underline">+30 6988 010188</a>.</p>
              <p>Always quote your reference: <span className="font-mono font-semibold">{quote.ref}</span></p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
