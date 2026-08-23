import type { Metadata } from "next";

// The page itself is a client component and cannot export metadata, so it is
// declared here.
export const metadata: Metadata = {
  title: "Your Quote",
  description: "View your Anadyon Rentals quote for Zakynthos using your reference and surname.",
  robots: { index: false, follow: true },
};

export default function QuoteLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
