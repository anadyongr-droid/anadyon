import type { Metadata } from "next";
import SightsContent from "./SightsContent";

export const metadata: Metadata = {
  title: "Zakynthos Sights",
  description: "Navagio, the Blue Caves, Keri and more — where to go on Zakynthos and how to get there by car, motorbike or bike.",
  alternates: { canonical: "/sights", languages: { en: "/sights", el: "/el/sights", "x-default": "/sights" } },
};

export default function Sights() {
  return <SightsContent locale="en" />;
}
