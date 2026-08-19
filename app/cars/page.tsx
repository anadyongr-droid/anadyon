import type { Metadata } from "next";
import { loadRateCard } from "@/lib/ratesServer";
import CarsClient from "./CarsClient";

export const metadata: Metadata = {
  title: "Car Rental Zakynthos | Anadyon Rentals",
  description: "Rent a car in Zakynthos with free delivery to the airport, port or your hotel. Economy and compact cars, unlimited mileage, all taxes included.",
  alternates: {
    canonical: "/cars",
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

export default async function Cars() {
  const card = await loadRateCard();
  return <CarsClient initialRates={card?.rates} initialExtras={card?.extras} />;
}
