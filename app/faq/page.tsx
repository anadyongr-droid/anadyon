import type { Metadata } from "next";
import FaqClient from "./FaqClient";

export const metadata: Metadata = {
  title: "FAQ | Anadyon Rentals Zakynthos",
  description: "Frequently asked questions about renting a car, motorbike or bike with Anadyon Rentals in Zakynthos. Licences, insurance, delivery, cancellation and more.",
  alternates: {
    canonical: "/faq",
    languages: { en: "/faq", el: "/el/faq", "x-default": "/faq" },
  },
};

export default function FAQ() {
  return <FaqClient />;
}
