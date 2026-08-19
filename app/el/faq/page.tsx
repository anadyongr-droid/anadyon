import type { Metadata } from "next";
import FaqClient from "../../faq/FaqClient";

export const metadata: Metadata = {
  title: "Συχνές Ερωτήσεις | Anadyon Rentals",
  description: "Απαντήσεις στις πιο συχνές ερωτήσεις για την ενοικίαση αυτοκινήτου, μηχανής ή ποδηλάτου στη Ζάκυνθο — ηλικία, ασφάλιση, χιλιόμετρα, ακυρώσεις.",
  alternates: { canonical: "/el/faq", languages: { en: "/faq", el: "/el/faq", "x-default": "/faq" } },
};

export default function Page() {
  return <FaqClient locale="el" />;
}
