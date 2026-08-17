import type { Metadata } from "next";
import Page_ from "../../terms-of-use/page";

// Chrome is Greek; the body copy is still English. Routed now so the Greek
// navigation never dead-ends — a 404 mid-site reads as broken, untranslated
// prose reads as unfinished, and the second is the honest state.
export const metadata: Metadata = {
  title: "Όροι Χρήσης | Anadyon Rentals",
  alternates: {
    canonical: "/el/terms-of-use",
    languages: { en: "/terms-of-use", el: "/el/terms-of-use" },
  },
};

export default function Page() {
  return <Page_ />;
}
