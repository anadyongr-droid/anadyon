import type { Metadata } from "next";
import { loadRateCard } from "@/lib/ratesServer";
import MotorbikesClient from "../../motorbikes/MotorbikesClient";

export const metadata: Metadata = {
  title: "Ενοικίαση Μηχανακιού & Σκούτερ Ζάκυνθος | Anadyon Rentals",
  description: "Ενοικίαση σκούτερ ή μηχανακιού στη Ζάκυνθο. Kymco Agility 50cc και 125cc, δωρεάν παράδοση, όλοι οι φόροι συμπεριλαμβάνονται.",
  alternates: {
    canonical: "/el/motorbikes",
    // Declares the pair so the two language versions are read as translations
    // of one another rather than as competing duplicates.
    languages: { en: "/motorbikes", el: "/el/motorbikes", "x-default": "/motorbikes" },
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
  return <MotorbikesClient locale="el" initialRates={card?.rates} initialExtras={card?.extras} />;
}
