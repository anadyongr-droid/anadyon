import type { Metadata } from "next";
import BlogClient from "./BlogClient";

export const metadata: Metadata = {
  title: "Blog",
  description: "Guides and tips for driving and exploring Zakynthos from Anadyon Rentals.",
  alternates: { canonical: "/blog", languages: { en: "/blog", el: "/el/blog" } },
};

export default function Blog() {
  return <BlogClient locale="en" />;
}
