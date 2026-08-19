import type { Metadata } from "next";
import ContactClient from "../../contact/ContactClient";

export const metadata: Metadata = {
  title: "Επικοινωνία | Anadyon Rentals",
  description: "Επικοινωνήστε με την Anadyon Rentals στη Ζάκυνθο — τηλέφωνο, email, διεύθυνση και ώρες λειτουργίας.",
  alternates: { canonical: "/el/contact", languages: { en: "/contact", el: "/el/contact", "x-default": "/contact" } },
};

export default function Page() {
  return <ContactClient locale="el" />;
}
