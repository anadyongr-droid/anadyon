import type { Metadata } from "next";
import QuoteLookupPage from "../../../quote/[ref]/page";

export const metadata: Metadata = {
  title: "Η Προσφορά σας | Anadyon Rentals",
  // A quote belongs to one customer; it should never be indexed or followed.
  robots: { index: false, follow: false },
};

export default function Page({ params }: { params: Promise<{ ref: string }> }) {
  return <QuoteLookupPage params={params} locale="el" />;
}
