import type { Metadata } from "next";
import { loadRateCard } from "@/lib/ratesServer";
import CarsClient from "../../cars/CarsClient";

export const metadata: Metadata = {
  title: "Ενοικίαση Αυτοκινήτου Ζάκυνθος | Anadyon Rentals",
  description: "Ενοικίαση αυτοκινήτου στη Ζάκυνθο με δωρεάν παράδοση σε αεροδρόμιο, λιμάνι ή ξενοδοχείο. Απεριόριστα χιλιόμετρα, όλοι οι φόροι συμπεριλαμβάνονται.",
  alternates: {
    canonical: "/el/cars",
    // Declares the pair so the two language versions are read as translations
    // of one another rather than as competing duplicates.
    languages: { en: "/cars", el: "/el/cars", "x-default": "/cars" },
  },
};

// Static, but refreshed. The rate card is read at render time so the booking
// form opens with prices instead of a skeleton; ISR keeps this page
// prerendered rather than turning it dynamic, which reading live data would
// otherwise do. Five minutes matches the API route's own CDN window, and an
// admin price change calls revalidatePath to land immediately rather than
// waiting it out.
export const revalidate = 300;

export default async function Page() {
  const card = await loadRateCard();
  return <CarsClient locale="el" initialRates={card?.rates} initialExtras={card?.extras} />;
}
