import type { Metadata } from "next";
import ContactClient from "./ContactClient";

export const metadata: Metadata = {
  title: "Contact Us | Anadyon Rentals Zakynthos",
  description: "Get in touch with Anadyon Rentals in Zakynthos. Call, email or visit us at our office on the seafront road of Zakynthos Town.",
  alternates: { canonical: "https://anadyon.gr/contact" },
};

export default function Contact() {
  return <ContactClient />;
}
