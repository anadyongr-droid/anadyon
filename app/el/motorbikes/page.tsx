import type { Metadata } from "next";
import MotorbikesClient from "../../motorbikes/MotorbikesClient";

export const metadata: Metadata = {
  title: "Ενοικίαση Μηχανακιού & Σκούτερ Ζάκυνθος | Anadyon Rentals",
  description: "Ενοικίαση σκούτερ ή μηχανακιού στη Ζάκυνθο. Kymco Agility 50cc και 125cc, δωρεάν παράδοση, όλοι οι φόροι συμπεριλαμβάνονται.",
  alternates: {
    canonical: "/el/motorbikes",
    // Declares the pair so the two language versions are read as translations
    // of one another rather than as competing duplicates.
    languages: { en: "/motorbikes", el: "/el/motorbikes", "x-default": "/motorbikes" },
  },
};

export default function Page() {
  return <MotorbikesClient locale="el" />;
}
