import type { Metadata } from "next";
import SitemapContent from "./SitemapContent";

export const metadata: Metadata = {
  title: "Site Map",
  description: "Every page on the Anadyon Rentals website — cars, motorbikes, bikes, quotes and contact details for Zakynthos.",
  alternates: { canonical: "/sitemap", languages: { en: "/sitemap", el: "/el/sitemap" } },
};

export default function Sitemap() {
  return <SitemapContent locale="en" />;
}
