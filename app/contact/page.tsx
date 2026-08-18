import type { Metadata } from "next";
import ContactClient from "./ContactClient";

export const metadata: Metadata = {
  title: "Contact Us",
  description: "Get in touch with Anadyon Rentals in Zakynthos — phone, email, address and office hours.",
  alternates: { canonical: "/contact", languages: { en: "/contact", el: "/el/contact" } },
};

export default function Contact() {
  return <ContactClient locale="en" />;
}
