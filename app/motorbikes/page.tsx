import type { Metadata } from "next";
import { loadRateCard } from "@/lib/ratesServer";
import MotorbikesClient from "./MotorbikesClient";

export const metadata: Metadata = {
  title: "Motorbike & Scooter Rental Zakynthos | Anadyon Rentals",
  description: "Rent a scooter or motorbike in Zakynthos. 50cc and 125cc Kymco Agility scooters, free delivery, all taxes included. Perfect for exploring the island.",
  alternates: {
    canonical: "/motorbikes",
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

export default async function Motorbikes() {
  const card = await loadRateCard();
  return <MotorbikesClient initialRates={card?.rates} initialExtras={card?.extras} />;
}
