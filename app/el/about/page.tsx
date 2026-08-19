import type { Metadata } from "next";
import AboutClient from "../../about/AboutClient";

export const metadata: Metadata = {
  title: "Σχετικά με εμάς | Anadyon Rentals Ζάκυνθος",
  description: "Οικογενειακή επιχείρηση ενοικίασης οχημάτων στη Ζάκυνθο από το 2014. Αυτοκίνητα, μηχανές και ποδήλατα — προσωπική εξυπηρέτηση, διαφανείς τιμές, χωρίς κρυφές χρεώσεις.",
  alternates: { canonical: "/el/about", languages: { en: "/about", el: "/el/about", "x-default": "/about" } },
};

export default function Page() {
  return <AboutClient locale="el" />;
}
