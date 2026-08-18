import type { Metadata } from "next";
import PrivacyContent from "../../privacy-policy/PrivacyContent";

export const metadata: Metadata = {
  title: "Πολιτική Απορρήτου | Anadyon Rentals",
  description: "Πώς η Anadyon Rentals συλλέγει, χρησιμοποιεί και προστατεύει τα προσωπικά σας δεδομένα σύμφωνα με τον ΓΚΠΔ.",
  alternates: { canonical: "/el/privacy-policy", languages: { en: "/privacy-policy", el: "/el/privacy-policy" } },
};

export default function Page() {
  return <PrivacyContent locale="el" />;
}
