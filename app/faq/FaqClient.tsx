"use client";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import ContentPage from "../components/ContentPage";
import { faqs as faqsFor, FAQ_TITLE } from "@/lib/i18n/content/faq";
import type { Locale } from "@/lib/i18n";


/**
 * Structured data built from the same `faqs` array the page renders.
 *
 * Generated rather than hand-written: FAQ markup that describes answers the
 * page does not actually display is a guidelines violation, and hand-maintained
 * duplicates drift the first time an answer is edited.
 */
function FaqJsonLd({ faqs }: { faqs: { q: string; a: string }[] }) {
  const data = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map(f => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export default function FaqClient({ locale = "en" }: { locale?: Locale }) {
  const faqs = faqsFor(locale);
  const [open, setOpen] = useState<number | null>(null);

  return (
    <ContentPage>
      <FaqJsonLd faqs={faqs} />
        <h1 className="text-3xl font-bold mb-2 text-gray-900 dark:text-white">{FAQ_TITLE[locale]}</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-10">
          Everything you need to know about renting with Anadyon. Can&apos;t find the answer?{" "}
          <a href="/contact" className="text-orange-600 dark:text-orange-400 hover:underline">Contact us</a>.
        </p>

        <div className="space-y-3">
          {faqs.map((faq, i) => (
            <div key={i} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-6 py-4 text-left font-medium text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                onClick={() => setOpen(open === i ? null : i)}
              >
                <span>{faq.q}</span>
                <ChevronDown
                  size={18}
                  className={`flex-shrink-0 ml-4 text-orange-500 dark:text-orange-400 transition-transform ${open === i ? "rotate-180" : ""}`}
                />
              </button>
              {open === i && (
                <div className="px-6 pb-5 text-sm text-gray-600 dark:text-gray-400 border-t border-gray-100 dark:border-gray-700 pt-4">
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
    </ContentPage>
  );
}
