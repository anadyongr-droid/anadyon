import type { Metadata } from "next";
import SitemapContent from "../../sitemap/SitemapContent";

export const metadata: Metadata = {
  title: "Χάρτης Ιστότοπου",
  description: "Όλες οι σελίδες του ιστότοπου της Anadyon Rentals — αυτοκίνητα, μηχανές, ποδήλατα, προσφορές και στοιχεία επικοινωνίας για τη Ζάκυνθο.",
  alternates: { canonical: "/el/sitemap", languages: { en: "/sitemap", el: "/el/sitemap" } },
};

export default function Page() {
  return <SitemapContent locale="el" />;
}
