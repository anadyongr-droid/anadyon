import type { Metadata } from "next";

// The page itself is a client component and cannot export metadata, so it is
// declared here.
export const metadata: Metadata = {
  title: "Find Your Quote",
  description: "Look up an existing Anadyon Rentals quote using your reference and surname.",
  alternates: {
    canonical: "/quote",
    languages: { en: "/quote", el: "/el/quote", "x-default": "/quote" },
  },
  // noindex, but follow.
  //
  // This is an account-style lookup: a reference box and a surname box, with no
  // content anyone could arrive here searching for. Indexing it invites a
  // customer to reach their own quote through a search engine rather than
  // through the link they were emailed, and the individual quote pages are
  // already noindex. `follow` is kept so the links out of it still carry.
  //
  // Declared in metadata rather than relying on robots.txt: the Disallow there
  // is "/quote/" with a trailing slash, which does not cover "/quote" itself.
  robots: { index: false, follow: true },
};

export default function QuoteLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
