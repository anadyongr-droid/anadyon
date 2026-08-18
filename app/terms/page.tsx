import type { Metadata } from "next";
import TermsContent from "./TermsContent";

export const metadata: Metadata = {
  title: "Terms & Conditions | Anadyon Rentals",
  description: "Vehicle rental terms and conditions for Anadyon Rentals, Zakynthos. Driver age, insurance, cancellation policy, and more.",
  alternates: { canonical: "/terms", languages: { en: "/terms", el: "/el/terms" } },
};

export default function Terms() {
  return <TermsContent locale="en" />;
}
