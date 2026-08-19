import type { Metadata } from "next";
import QuoteLookupLanding from "../../quote/page";

export const metadata: Metadata = {
  title: "Η Κράτησή μου | Anadyon Rentals",
  description: "Δείτε την προσφορά σας εισάγοντας τον αριθμό αναφοράς και το επώνυμό σας.",
  alternates: { canonical: "/el/quote", languages: { en: "/quote", el: "/el/quote", "x-default": "/quote" } },
};

export default function Page() {
  return <QuoteLookupLanding locale="el" />;
}
