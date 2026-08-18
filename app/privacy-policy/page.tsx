import type { Metadata } from "next";
import PrivacyContent from "./PrivacyContent";

export const metadata: Metadata = {
  title: "Privacy Policy | Anadyon Rentals",
  description: "How Anadyon Rentals collects, uses, and protects your personal data in accordance with GDPR.",
  alternates: { canonical: "/privacy-policy", languages: { en: "/privacy-policy", el: "/el/privacy-policy" } },
};

export default function PrivacyPolicy() {
  return <PrivacyContent locale="en" />;
}
