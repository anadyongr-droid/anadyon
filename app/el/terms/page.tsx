import type { Metadata } from "next";
import TermsContent from "../../terms/TermsContent";

export const metadata: Metadata = {
  title: "Όροι και Προϋποθέσεις | Anadyon Rentals",
  description: "Όροι και προϋποθέσεις ενοικίασης οχημάτων της Anadyon Rentals στη Ζάκυνθο: ηλικία οδηγού, ασφάλιση, πολιτική ακύρωσης και άλλα.",
  alternates: { canonical: "/el/terms", languages: { en: "/terms", el: "/el/terms" } },
};

export default function Page() {
  return <TermsContent locale="el" />;
}
