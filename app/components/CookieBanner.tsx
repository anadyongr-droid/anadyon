"use client";
import { useState, useEffect } from "react";
import Script from "next/script";

const GA_ID = "G-00X72SCDNW";
const STORAGE_KEY = "cookie_consent";

export default function CookieBanner() {
  const [consent, setConsent] = useState<"accepted" | "declined" | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "accepted") {
      setConsent("accepted");
    } else if (stored === "declined") {
      setConsent("declined");
    } else {
      setVisible(true);
    }
  }, []);

  function accept() {
    localStorage.setItem(STORAGE_KEY, "accepted");
    setConsent("accepted");
    setVisible(false);
  }

  function decline() {
    localStorage.setItem(STORAGE_KEY, "declined");
    setConsent("declined");
    setVisible(false);
  }

  return (
    <>
      {/* Load GA only if accepted */}
      {consent === "accepted" && (
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
      {visible && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-gray-900 text-white px-4 py-4 shadow-lg">
          <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <p className="text-sm text-gray-300 flex-1">
              We use cookies to improve your experience and analyse site traffic.{" "}
              <a href="/privacy-policy" className="text-blue-400 underline hover:text-blue-300 transition cursor-pointer">Learn more</a>.
            </p>
            <div className="flex gap-3 shrink-0">
              <button
                onClick={decline}
                className="px-4 py-2 text-sm border border-gray-500 text-gray-300 rounded-lg hover:border-gray-300 hover:text-white transition"
              >
                Decline
              </button>
              <button
                onClick={accept}
                className="px-4 py-2 text-sm bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-500 transition"
              >
                Accept
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
