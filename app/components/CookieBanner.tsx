"use client";
import { useState, useEffect } from "react";
import Script from "next/script";

const GA_ID = "G-00X72SCDNW";
const STORAGE_KEY = "cookie_consent";

type Consent = "essential" | "all" | "declined" | null;

export default function CookieBanner() {
  const [consent, setConsent] = useState<Consent>(null);
  const [visible, setVisible] = useState(false);
  const [showPrefs, setShowPrefs] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Consent;
    if (stored === "all" || stored === "essential" || stored === "declined") {
      setConsent(stored);
    } else {
      setVisible(true);
    }
  }, []);

  function save(choice: Consent) {
    localStorage.setItem(STORAGE_KEY, choice as string);
    setConsent(choice);
    setVisible(false);
    setShowPrefs(false);
  }

  return (
    <>
      {/* Load GA only if user accepted all cookies */}
      {consent === "all" && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
            strategy="afterInteractive"
          />
          <Script id="ga-init" strategy="afterInteractive">{`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_ID}');
          `}</Script>
        </>
      )}

      {/* Banner */}
      {visible && !showPrefs && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-gray-900 text-white px-4 py-4 shadow-lg safe-bottom">
          <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <p className="text-sm text-gray-300 flex-1">
              We use cookies to improve your experience and analyse site traffic.{" "}
              <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline hover:text-blue-300 transition">Learn more</a>.
            </p>
            <div className="flex flex-wrap gap-3 shrink-0">
              <button
                onClick={() => setShowPrefs(true)}
                className="px-4 py-2 text-sm border border-gray-500 text-gray-300 rounded-lg hover:border-gray-300 hover:text-white transition"
              >
                Manage preferences
              </button>
              <button
                onClick={() => save("all")}
                className="px-4 py-2 text-sm bg-orange-600 text-white font-semibold rounded-lg hover:bg-orange-500 transition"
              >
                Accept all
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preferences panel */}
      {visible && showPrefs && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-gray-900 text-white px-4 py-5 shadow-lg safe-bottom">
          <div className="max-w-4xl mx-auto space-y-4">
            <h2 className="text-sm font-semibold text-white">Cookie preferences</h2>

            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-800">
                <div className="flex-1">
                  <p className="font-medium text-white">Essential cookies</p>
                  <p className="text-gray-400 text-xs mt-0.5">Required for the site to function. Cannot be disabled.</p>
                </div>
                <span className="text-xs text-gray-400 mt-0.5 flex-shrink-0">Always on</span>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-800">
                <div className="flex-1">
                  <p className="font-medium text-white">Analytics cookies</p>
                  <p className="text-gray-400 text-xs mt-0.5">Google Analytics — helps us understand how visitors use the site. No personal data is sold.</p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => save("declined")}
                className="px-4 py-2 text-sm border border-gray-500 text-gray-300 rounded-lg hover:border-gray-300 hover:text-white transition"
              >
                Decline all
              </button>
              <button
                onClick={() => save("essential")}
                className="px-4 py-2 text-sm border border-orange-500 text-orange-400 rounded-lg hover:bg-orange-900/30 transition"
              >
                Essential only
              </button>
              <button
                onClick={() => save("all")}
                className="px-4 py-2 text-sm bg-orange-600 text-white font-semibold rounded-lg hover:bg-orange-500 transition"
              >
                Accept all
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
