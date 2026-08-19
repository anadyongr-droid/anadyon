import type { Metadata } from "next";
import QuoteLookupLanding from "../../quote/page";

export const metadata: Metadata = {
  title: "Η Κράτησή μου | Anadyon Rentals",
  description: "Δείτε την προσφορά σας εισάγοντας τον αριθμό αναφοράς και το επώνυμό σας.",
  alternates: { canonical: "/el/quote", languages: { en: "/quote", el: "/el/quote", "x-default": "/quote" } },
  // Mirrors app/quote/layout.tsx, which reasons this out in full. The English
  // lookup page was set noindex and this one was not, so the same reference-box
  // form was excluded from search in one language and indexed in the other.
  // Whatever is decided about this page has to be decided for both, or the
  // hreflang pair points from a noindex page to an indexable one.
  robots: { index: false, follow: true },
};

export default function Page() {
  return <QuoteLookupLanding locale="el" />;
}
