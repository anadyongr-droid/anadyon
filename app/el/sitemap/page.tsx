import type { Metadata } from "next";
import Page_ from "../../sitemap/page";

// Chrome is Greek; the body copy is still English. Routed now so the Greek
// navigation never dead-ends — a 404 mid-site reads as broken, untranslated
// prose reads as unfinished, and the second is the honest state.
export const metadata: Metadata = {
  title: "Χάρτης Ιστότοπου | Anadyon Rentals",
  alternates: {
    canonical: "/el/sitemap",
    languages: { en: "/sitemap", el: "/el/sitemap" },
  },
};

export default function Page() {
  return <Page_ />;
}
