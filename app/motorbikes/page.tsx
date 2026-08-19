import type { Metadata } from "next";
import MotorbikesClient from "./MotorbikesClient";

export const metadata: Metadata = {
  title: "Motorbike & Scooter Rental Zakynthos | Anadyon Rentals",
  description: "Rent a scooter or motorbike in Zakynthos. 50cc and 125cc Kymco Agility scooters, free delivery, all taxes included. Perfect for exploring the island.",
  alternates: {
    canonical: "/motorbikes",
    languages: { en: "/motorbikes", el: "/el/motorbikes", "x-default": "/motorbikes" },
  },
};

export default function Motorbikes() {
  return <MotorbikesClient />;
}
