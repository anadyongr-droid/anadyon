import type { Metadata } from "next";
import { Geist } from "next/font/google";
import PublicShell from "./components/PublicShell";
import "./globals.css";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Anadyon Rentals | Zakynthos",
  description: "Car, motorbike and bike rentals in Zakynthos, Greece. Free delivery, unlimited mileage, all taxes included.",
  metadataBase: new URL("https://anadyon.gr"),
  openGraph: {
    title: "Anadyon Rentals | Zakynthos",
    description: "Car, motorbike and bike rentals in Zakynthos, Greece. Free delivery, unlimited mileage, all taxes included.",
    url: "https://anadyon.gr",
    siteName: "Anadyon Rentals",
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Anadyon Rentals — Car, Motorbike & Bike Rentals in Zakynthos",
      },
    ],
    locale: "en_GB",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Anadyon Rentals | Zakynthos",
    description: "Car, motorbike and bike rentals in Zakynthos, Greece.",
    images: ["/og-image.jpg"],
  },
  alternates: {
    canonical: "https://anadyon.gr",
  },
  robots: {
    index: true,
    follow: true,
  },
};

const localBusinessSchema = {
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  name: "Anadyon Rentals",
  description: "Car, motorbike and bike rentals in Zakynthos, Greece. Free delivery, unlimited mileage, all taxes included.",
  url: "https://anadyon.gr",
  telephone: ["+302695041878", "+306988010188"],
  email: "customerservice@anadyon.gr",
  address: {
    "@type": "PostalAddress",
    streetAddress: "20 Lomvardou Str.",
    addressLocality: "Zakynthos Town",
    postalCode: "29100",
    addressCountry: "GR",
  },
  geo: {
    "@type": "GeoCoordinates",
    latitude: 37.7916,
    longitude: 20.8975,
  },
  openingHoursSpecification: {
    "@type": "OpeningHoursSpecification",
    dayOfWeek: ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"],
    opens: "09:00",
    closes: "21:00",
  },
  priceRange: "€€",
  currenciesAccepted: "EUR",
  paymentAccepted: "Cash, Credit Card",
  image: "https://anadyon.gr/og-image.jpg",
  sameAs: [],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={geist.className}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessSchema) }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100">
        <PublicShell>{children}</PublicShell>
      </body>
    </html>
  );
}
