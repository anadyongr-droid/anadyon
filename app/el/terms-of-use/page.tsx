import type { Metadata } from "next";
import TermsOfUseContent from "../../terms-of-use/TermsOfUseContent";

export const metadata: Metadata = {
  title: "Όροι Χρήσης | Anadyon Rentals",
  description: "Όροι που διέπουν τη χρήση του ιστότοπου της Anadyon Rentals: αποδεκτή χρήση, ακρίβεια τιμών και διαθεσιμότητας, πνευματική ιδιοκτησία και ευθύνη.",
  alternates: { canonical: "/el/terms-of-use", languages: { en: "/terms-of-use", el: "/el/terms-of-use", "x-default": "/terms-of-use" } },
};

export default function Page() {
  return <TermsOfUseContent locale="el" />;
}
