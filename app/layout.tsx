import type { Metadata } from "next";
import { Geist } from "next/font/google";
import PublicShell from "./components/PublicShell";
import "./globals.css";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Anadyon Rentals | Zakynthos",
  description: "Car, motorbike and bike rentals in Zakynthos, Greece.",
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
