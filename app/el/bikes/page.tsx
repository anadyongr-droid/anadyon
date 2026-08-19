import type { Metadata } from "next";
import BikesClient from "../../bikes/BikesClient";

export const metadata: Metadata = {
  title: "Ενοικίαση Ποδηλάτου Ζάκυνθος | Anadyon Rentals",
  description: "Ενοικίαση ποδηλάτου πόλης, περιήγησης ή βουνού στη Ζάκυνθο. Μεγάλη ποικιλία ποδηλάτων, παραλαβή από το γραφείο μας στη Ζάκυνθο.",
  alternates: {
    canonical: "/el/bikes",
    // Declares the pair so the two language versions are read as translations
    // of one another rather than as competing duplicates.
    languages: { en: "/bikes", el: "/el/bikes", "x-default": "/bikes" },
  },
};

export default function Page() {
  return <BikesClient locale="el" />;
}
