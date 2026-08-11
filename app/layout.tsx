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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={geist.className}>
      <body className="min-h-full flex flex-col bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100">
        <PublicShell>{children}</PublicShell>
      </body>
    </html>
  );
}
