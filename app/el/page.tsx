import type { Metadata } from "next";
import HomePage from "../components/HomePage";

export const metadata: Metadata = {
  title: "Ενοικίαση Αυτοκινήτων Ζάκυνθος | Anadyon Rentals",
  description: "Ενοικιάσεις αυτοκινήτων, μηχανακίων και ποδηλάτων στη Ζάκυνθο. Δωρεάν παράδοση, απεριόριστα χιλιόμετρα, όλοι οι φόροι συμπεριλαμβάνονται.",
  alternates: {
    canonical: "/el",
    // Tells search engines the two pages are the same content in two languages,
    // rather than duplicates competing with one another.
    languages: { en: "/", el: "/el", "x-default": "/" },
  },
};

export default function Page() {
  return <HomePage locale="el" />;
}
