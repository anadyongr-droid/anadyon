import type { Metadata } from "next";
import AboutClient from "./AboutClient";

export const metadata: Metadata = {
  title: "About Us | Anadyon Rentals Zakynthos",
  description: "Family-run vehicle rental company in Zakynthos since 2014. Cars, motorbikes and bikes — personal service, transparent pricing, no hidden fees.",
  alternates: { canonical: "/about", languages: { en: "/about", el: "/el/about" } },
};

export default function About() {
  return <AboutClient locale="en" />;
}
