import type { Metadata } from "next";
import { loadRateCard } from "@/lib/ratesServer";
import BikesClient from "./BikesClient";

export const metadata: Metadata = {
  title: "Bike Rental Zakynthos | Anadyon Rentals",
  description: "Rent a city bike, trekking bike or mountain bike in Zakynthos. Wide range of quality bikes, collected from our office in Zakynthos Town.",
  alternates: {
    canonical: "/bikes",
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

export default async function Bikes() {
  const card = await loadRateCard();
  return <BikesClient initialRates={card?.rates} initialExtras={card?.extras} />;
}
