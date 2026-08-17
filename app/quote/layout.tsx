import type { Metadata } from "next";

// The page itself is a client component and cannot export metadata, so it is
// declared here.
export const metadata: Metadata = {
  title: "Find Your Quote",
  description: "Look up an existing Anadyon Rentals quote using your reference and surname.",
  alternates: { canonical: "/quote" },
  robots: { index: true, follow: true },
};

export default function QuoteLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
