"use client";
import { translator, type Locale } from "@/lib/i18n";
import { useCallback, useEffect, useMemo, useState } from "react";
import { use } from "react";
import { useSearchParams } from "next/navigation";
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
  discount_amount: number | null;
  promo_code: string | null;
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

export default function QuoteLookupPage({ params, locale = "en" }: { params: Promise<{ ref: string }>; locale?: Locale }) {
  const tr = useMemo(() => translator(locale), [locale]);
  const { ref } = use(params);
  const searchParams = useSearchParams();
  const surnameParam = searchParams.get("surname") ?? "";
  const [surname, setSurname] = useState(surnameParam);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [extrasConfig, setExtrasConfig] = useState<ExtrasConfig[]>([]);

  const fetchQuote = useCallback(async (r: string, s: string) => {
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/quote/${encodeURIComponent(r)}?surname=${encodeURIComponent(s)}`);
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(res.status === 410 ? tr("quote.expired") : res.status === 404 ? tr("quote.notFoundHelp") : tr("quote.genericError"));
    } else {
      setQuote(data);
    }
  }, [tr]);

  // Auto-fetch when arriving from the landing page with surname in URL.
  useEffect(() => {
    if (surnameParam) void fetchQuote(ref, surnameParam);
    fetch("/api/admin/rates").then(r => r.json()).then(({ extras }) => setExtrasConfig(extras ?? []));
  }, [fetchQuote, ref, surnameParam]);

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    fetchQuote(ref, surname);
  }

  const showPrice = quote && quote.total > 0;

  return (
    <div className="bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="max-w-2xl mx-auto px-4 py-16">
        <h1 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">{tr("quote.viewYourQuote")}</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-8 text-sm">
          {tr("quote.referenceLabel")}: <span className="font-mono font-semibold text-gray-800 dark:text-gray-200">{ref.toUpperCase()}</span>
        </p>

        {!quote && (
          <form onSubmit={handleLookup} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">{tr("quote.surnamePrompt")}</p>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{tr("form.lastName")}</label>
              <input
                type="text"
                required
                value={surname}
                onChange={e => setSurname(e.target.value)}
                placeholder={tr("quote.surnamePlaceholder")}
                className="w-full border dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200"
              />
            </div>
            {error && (
              <p className="text-red-600 dark:text-red-400 text-sm font-medium bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-orange-700 text-white font-semibold py-3 rounded-lg hover:bg-orange-800 transition disabled:opacity-50"
            >
              {loading ? tr("quote.lookingUp") : tr("quote.view")}
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
                  {tr("quote.notConfirmed")}
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {tr("quote.submitted")} {new Date(quote.created_at).toLocaleDateString(locale === "el" ? "el-GR" : "en-GB", { day: "numeric", month: "long", year: "numeric" })}
                {" · "}{tr("quote.viewableUntil")}{" "} {new Date(quote.expires_at).toLocaleDateString(locale === "el" ? "el-GR" : "en-GB", { day: "numeric", month: "long", year: "numeric" })}
              </p>
            </div>

            {/* Rental details */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4">{tr("form.stepRental")}</h3>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-gray-500 dark:text-gray-400">{tr("form.vehicle")}</dt><dd className="font-medium text-gray-900 dark:text-white">{quote.selected_model}</dd></div>
                <div className="flex justify-between"><dt className="text-gray-500 dark:text-gray-400">{tr("form.pickup")}</dt><dd className="font-medium text-gray-900 dark:text-white">{quote.pickup_location} — {quote.pickup_date} {tr("quote.at")} {quote.pickup_time}</dd></div>
                <div className="flex justify-between"><dt className="text-gray-500 dark:text-gray-400">{tr("quote.dropoff")}</dt><dd className="font-medium text-gray-900 dark:text-white">{quote.dropoff_location} — {quote.dropoff_date} {tr("quote.at")} {quote.dropoff_time}</dd></div>
                <div className="flex justify-between"><dt className="text-gray-500 dark:text-gray-400">{tr("quote.duration")}</dt><dd className="font-medium text-gray-900 dark:text-white">{quote.rental_days} {tr(quote.rental_days === 1 ? "quote.day" : "quote.days")}</dd></div>
                <div className="flex justify-between"><dt className="text-gray-500 dark:text-gray-400">{tr("quote.driverAge")}</dt><dd className="font-medium text-gray-900 dark:text-white">{quote.driver_age}</dd></div>
                {quote.transmission && <div className="flex justify-between"><dt className="text-gray-500 dark:text-gray-400">{tr("form.transmission")}</dt><dd className="font-medium text-gray-900 dark:text-white">{quote.transmission}</dd></div>}
              </dl>
            </div>

            {/* Extras */}
            {(quote.baby_seat > 0 || quote.child_seat > 0 || quote.fdw || quote.additional_drivers > 0) && (
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-4">{tr("form.extras")}</h3>
                <dl className="space-y-2 text-sm">
                  {quote.baby_seat > 0 && <div className="flex justify-between"><dt className="text-gray-500 dark:text-gray-400">{tr("extra.babySeat")}</dt><dd className="font-medium text-gray-900 dark:text-white">×{quote.baby_seat}</dd></div>}
                  {quote.child_seat > 0 && <div className="flex justify-between"><dt className="text-gray-500 dark:text-gray-400">{tr("extra.childSeat")}</dt><dd className="font-medium text-gray-900 dark:text-white">×{quote.child_seat}</dd></div>}
                  {quote.fdw && <div className="flex justify-between"><dt className="text-gray-500 dark:text-gray-400">{tr("extra.fdw")}</dt><dd className="font-medium text-gray-900 dark:text-white">{tr("quote.yes")}</dd></div>}
                  {quote.additional_drivers > 0 && <div className="flex justify-between"><dt className="text-gray-500 dark:text-gray-400">{tr("extra.additionalDrivers")}</dt><dd className="font-medium text-gray-900 dark:text-white">×{quote.additional_drivers}</dd></div>}
                </dl>
              </div>
            )}

            {/* Price */}
            {showPrice && (
              <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-xl p-6">
                <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-4">{tr("form.priceEstimate")}</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-gray-700 dark:text-gray-300">
                    <span>{quote.selected_model} — {quote.rental_days} {tr(quote.rental_days === 1 ? "quote.day" : "quote.days")} × €{quote.rental_days > 0 ? (Number(quote.vehicle_subtotal) / quote.rental_days).toFixed(2) : "0.00"}/{tr("quote.perDay")}</span>
                    <span>€{Number(quote.vehicle_subtotal).toFixed(2)}</span>
                  </div>
                  {quote.fdw && (
                    <div className="flex justify-between text-gray-600 dark:text-gray-400">
                      <span>{tr("extra.fdw")} — {quote.rental_days} {tr(quote.rental_days === 1 ? "quote.day" : "quote.days")} × €{(extrasConfig.find(e => e.key === "fdw")?.daily_rate ?? 0).toFixed(2)}</span>
                      <span>€{((extrasConfig.find(e => e.key === "fdw")?.daily_rate ?? 0) * quote.rental_days).toFixed(2)}</span>
                    </div>
                  )}
                  {quote.baby_seat > 0 && (
                    <div className="flex justify-between text-gray-600 dark:text-gray-400">
                      <span>{tr("extra.babySeat")} ×{quote.baby_seat} — {quote.rental_days} {tr(quote.rental_days === 1 ? "quote.day" : "quote.days")} × €{(extrasConfig.find(e => e.key === "baby_seat")?.daily_rate ?? 0).toFixed(2)}</span>
                      <span>€{((extrasConfig.find(e => e.key === "baby_seat")?.daily_rate ?? 0) * quote.baby_seat * quote.rental_days).toFixed(2)}</span>
                    </div>
                  )}
                  {quote.child_seat > 0 && (
                    <div className="flex justify-between text-gray-600 dark:text-gray-400">
                      <span>{tr("extra.childSeat")} ×{quote.child_seat} — {quote.rental_days} {tr(quote.rental_days === 1 ? "quote.day" : "quote.days")} × €{(extrasConfig.find(e => e.key === "child_seat")?.daily_rate ?? 0).toFixed(2)}</span>
                      <span>€{((extrasConfig.find(e => e.key === "child_seat")?.daily_rate ?? 0) * quote.child_seat * quote.rental_days).toFixed(2)}</span>
                    </div>
                  )}
                  {quote.additional_drivers > 0 && (
                    <div className="flex justify-between text-gray-600 dark:text-gray-400">
                      <span>{tr("extra.additionalDrivers")} ×{quote.additional_drivers} — {quote.rental_days} {tr(quote.rental_days === 1 ? "quote.day" : "quote.days")} × €{(extrasConfig.find(e => e.key === "additional_drivers")?.daily_rate ?? 0).toFixed(2)}</span>
                      <span>€{((extrasConfig.find(e => e.key === "additional_drivers")?.daily_rate ?? 0) * quote.additional_drivers * quote.rental_days).toFixed(2)}</span>
                    </div>
                  )}
                  {/* Sits between the line items and the total, because that
                      is the only place it explains the gap between them. The
                      figure is the one the database settled, not a value the
                      browser recomputes. */}
                  {Number(quote.discount_amount) > 0 && (
                    <div className="flex justify-between text-green-700 dark:text-green-400">
                      <span>
                        {tr("form.promoCode")}
                        {quote.promo_code ? ` (${quote.promo_code})` : ""}
                      </span>
                      <span>−€{Number(quote.discount_amount).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="border-t border-blue-200 dark:border-blue-700 pt-2 flex justify-between font-bold text-gray-900 dark:text-white">
                    <span>{tr("quote.totalInclVat")}</span>
                    <span>€{Number(quote.total).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-500 dark:text-gray-400 text-xs">
                    <span>{tr("form.depositDue")}</span>
                    <span>€{Number(quote.deposit).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-500 dark:text-gray-400 text-xs">
                    <span>{tr("form.balanceDue")}</span>
                    <span>€{Number(quote.balance_due).toFixed(2)}</span>
                  </div>
                </div>
                <p className="text-xs text-blue-700 dark:text-blue-300 mt-3">{tr("quote.estimateOnly")}</p>
              </div>
            )}

            {/* Comments */}
            {quote.comments && (
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">{tr("quote.yourComments")}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">{quote.comments}</p>
              </div>
            )}

            {/* Footer note */}
            <div className="text-center text-sm text-gray-500 dark:text-gray-400 space-y-1">
              <p>{tr("quote.questionsContact")} <a href="mailto:customerservice@anadyon.gr" className="text-blue-700 dark:text-blue-400 underline">customerservice@anadyon.gr</a> {tr("quote.orCall")} <a href="tel:+306988010188" className="text-blue-700 dark:text-blue-400 underline">+30 6988 010188</a>.</p>
              <p>{tr("quote.alwaysReference")} <span className="font-mono font-semibold">{quote.ref}</span></p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
