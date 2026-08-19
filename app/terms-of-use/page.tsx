import type { Metadata } from "next";
import TermsOfUseContent from "./TermsOfUseContent";

export const metadata: Metadata = {
  title: "Terms of Use | Anadyon Rentals",
  description: "Terms of use for the Anadyon Rentals website.",
  alternates: { canonical: "/terms-of-use", languages: { en: "/terms-of-use", el: "/el/terms-of-use", "x-default": "/terms-of-use" } },
};

export default function TermsOfUse() {
  return <TermsOfUseContent locale="en" />;
}
