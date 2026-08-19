import type { Metadata } from "next";
import BlogClient from "../../blog/BlogClient";

export const metadata: Metadata = {
  title: "Blog | Anadyon Rentals",
  description: "Οδηγοί και συμβουλές για την οδήγηση και την εξερεύνηση της Ζακύνθου από την Anadyon Rentals.",
  alternates: { canonical: "/el/blog", languages: { en: "/blog", el: "/el/blog", "x-default": "/blog" } },
};

export default function Page() {
  return <BlogClient locale="el" />;
}
