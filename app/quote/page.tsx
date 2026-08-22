"use client";
import { translator, localePath, type Locale } from "@/lib/i18n";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";

// App Router pages may receive only Next's PageProps. Locale is derived from
// the actual route so this component can be reused by /el/quote without
// making the default page export fail Next's production type check.
export default function QuoteLookupLanding() {
  const pathname = usePathname();
  const locale: Locale = pathname.startsWith("/el/") ? "el" : "en";
  const tr = translator(locale);
  const router = useRouter();
  const [ref, setRef] = useState("");
  const [surname, setSurname] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const cleanRef = ref.trim().toUpperCase();
    const cleanSurname = surname.trim();

    if (!cleanRef) { setError("Please enter your reference number."); return; }
    if (!cleanSurname) { setError("Please enter your last name."); return; }

    setLoading(true);
    const res = await fetch(`/api/quote/${encodeURIComponent(cleanRef)}?surname=${encodeURIComponent(cleanSurname)}`);
    setLoading(false);

    if (res.ok) {
      // localePath keeps a Greek reader on the Greek side; the bare path sent
      // them to the English quote page mid-journey.
      router.push(`${localePath(`/quote/${cleanRef}`, locale)}?surname=${encodeURIComponent(cleanSurname)}`);
    } else if (res.status === 410) {
      setError("This quote is no longer available online. Please contact us directly.");
    } else {
      setError("No quote found with that reference and surname. Please check and try again.");
    }
  }

  return (
    <div className="bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="max-w-md mx-auto px-4 py-20">
        <h1 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">{tr("quote.title")}</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-8 text-sm">
          {tr("quote.landingIntro")}
        </p>

        <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{tr("quote.refNumber")}</label>
            <input
              type="text"
              value={ref}
              onChange={e => setRef(e.target.value)}
              placeholder={tr("quote.refPlaceholder")}
              className="w-full border dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 font-mono tracking-wide"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{tr("form.lastName")}</label>
            <input
              type="text"
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
            {loading ? tr("quote.lookingUp") : tr("quote.viewMyRental")}
          </button>
        </form>

        <p className="text-center text-xs text-gray-500 dark:text-gray-400 mt-6">
          {tr("quote.cantFind")} <span className="font-medium">customerservice@anadyon.gr</span> {tr("quote.cantFindOr")}{" "}
          <a href={localePath("/contact", locale)} className="text-orange-700 dark:text-orange-400 underline">{tr("nav.contact")}</a>.
        </p>
      </div>
    </div>
  );
}
