import type { Metadata } from "next";
import CarsClient from "../../cars/CarsClient";

export const metadata: Metadata = {
  title: "Ενοικίαση Αυτοκινήτου Ζάκυνθος | Anadyon Rentals",
  description: "Ενοικίαση αυτοκινήτου στη Ζάκυνθο με δωρεάν παράδοση σε αεροδρόμιο, λιμάνι ή ξενοδοχείο. Απεριόριστα χιλιόμετρα, όλοι οι φόροι συμπεριλαμβάνονται.",
  alternates: {
    canonical: "/el/cars",
    // Declares the pair so the two language versions are read as translations
    // of one another rather than as competing duplicates.
    languages: { en: "/cars", el: "/el/cars", "x-default": "/cars" },
  },
};

export default function Page() {
  return <CarsClient locale="el" />;
}
