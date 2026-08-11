"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function QuoteLookupLanding() {
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
      router.push(`/quote/${cleanRef}?surname=${encodeURIComponent(cleanSurname)}`);
    } else if (res.status === 410) {
      setError("This quote is no longer available online. Please contact us directly.");
    } else {
      setError("No quote found with that reference and surname. Please check and try again.");
    }
  }

  return (
    <div className="bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="max-w-md mx-auto px-4 py-20">
        <h1 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">My Rental</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-8 text-sm">
          Enter the reference number from your confirmation email and the last name you used when submitting the request.
        </p>

        <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Reference Number</label>
            <input
              type="text"
              value={ref}
              onChange={e => setRef(e.target.value)}
              placeholder="e.g. ANA-202608-K7F2"
              className="w-full border dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 font-mono tracking-wide"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Last Name</label>
            <input
              type="text"
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
            className="w-full bg-blue-700 text-white font-semibold py-3 rounded-lg hover:bg-blue-800 transition disabled:opacity-50"
          >
            {loading ? "Looking up…" : "View My Rental"}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-6">
          Can't find your reference? Check your confirmation email from <span className="font-medium">customerservice@anadyon.gr</span> or{" "}
          <a href="/contact" className="text-blue-700 dark:text-blue-400 underline">contact us</a>.
        </p>
      </div>
    </div>
  );
}
