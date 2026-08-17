import type { Metadata } from "next";
import Page_ from "../../faq/page";

// Chrome is Greek; the body copy is still English. Routed now so the Greek
// navigation never dead-ends — a 404 mid-site reads as broken, untranslated
// prose reads as unfinished, and the second is the honest state.
export const metadata: Metadata = {
  title: "Συχνές Ερωτήσεις | Anadyon Rentals",
  alternates: {
    canonical: "/el/faq",
    languages: { en: "/faq", el: "/el/faq" },
  },
};

export default function Page() {
  return <Page_ />;
}
