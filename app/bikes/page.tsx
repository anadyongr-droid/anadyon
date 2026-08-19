import type { Metadata } from "next";
import BikesClient from "./BikesClient";

export const metadata: Metadata = {
  title: "Bike Rental Zakynthos | Anadyon Rentals",
  description: "Rent a city bike, trekking bike or mountain bike in Zakynthos. Wide range of quality bikes, collected from our office in Zakynthos Town.",
  alternates: {
    canonical: "/bikes",
    languages: { en: "/bikes", el: "/el/bikes", "x-default": "/bikes" },
  },
};

export default function Bikes() {
  return <BikesClient />;
}
