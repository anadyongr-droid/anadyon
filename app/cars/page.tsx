import type { Metadata } from "next";
import CarsClient from "./CarsClient";

export const metadata: Metadata = {
  title: "Car Rental Zakynthos | Anadyon Rentals",
  description: "Rent a car in Zakynthos with free delivery to the airport, port or your hotel. Economy and compact cars, unlimited mileage, all taxes included.",
  alternates: {
    canonical: "/cars",
    languages: { en: "/cars", el: "/el/cars", "x-default": "/cars" },
  },
};

export default function Cars() {
  return <CarsClient />;
}
