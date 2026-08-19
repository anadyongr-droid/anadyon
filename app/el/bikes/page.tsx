import type { Metadata } from "next";
import { loadRateCard } from "@/lib/ratesServer";
import BikesClient from "../../bikes/BikesClient";

export const metadata: Metadata = {
  title: "Ενοικίαση Ποδηλάτου Ζάκυνθος | Anadyon Rentals",
  description: "Ενοικίαση ποδηλάτου πόλης, περιήγησης ή βουνού στη Ζάκυνθο. Μεγάλη ποικιλία ποδηλάτων, παραλαβή από το γραφείο μας στη Ζάκυνθο.",
  alternates: {
    canonical: "/el/bikes",
    // Declares the pair so the two language versions are read as translations
    // of one another rather than as competing duplicates.
    languages: { en: "/bikes", el: "/el/bikes", "x-default": "/bikes" },
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
  return <BikesClient locale="el" initialRates={card?.rates} initialExtras={card?.extras} />;
}
