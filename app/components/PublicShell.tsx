"use client";
import { usePathname } from "next/navigation";
import Header from "./Header";
import CookieBanner from "./CookieBanner";

export default function PublicShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith("/admin");

  if (isAdmin) return <>{children}</>;

  return (
    <>
      <Header />
      <CookieBanner />
      <main className="flex-1">{children}</main>
      <footer className="bg-gray-900 dark:bg-gray-950 text-gray-400 border-t border-orange-700">
        <nav className="bg-orange-600 dark:bg-orange-700 w-full">
          <div className="flex flex-wrap justify-center">
            {[
              { href: "/faq", label: "FAQ" },
              { href: "/terms", label: "Terms & Conditions" },
              { href: "/terms-of-use", label: "Terms of Use" },
              { href: "/privacy-policy", label: "Privacy Policy" },
              { href: "/sitemap", label: "Sitemap" },
              { href: "/contact", label: "Contact Us" },
            ].map(l => (
              <a
                key={l.href}
                href={l.href}
                className="text-center text-sm font-semibold text-white px-5 py-3 hover:bg-orange-700 dark:hover:bg-orange-600 visited:text-white transition cursor-pointer"
              >
                {l.label}
              </a>
            ))}
          </div>
        </nav>
        <div className="max-w-6xl mx-auto px-4 text-center text-xs pt-6 pb-2 text-gray-300">
          <p>Copyright © 2014–2026 Anadyon Rentals. All Rights Reserved.</p>
          <p className="mt-1.5">20 Lomvardou Str. (Seafront Road, Zakynthos Town), 29100, Zakynthos, Greece</p>
          {/* Tapping a number to call is a primary action on mobile, so these keep
              a 44px target rather than the 16px the bare text would give. That
              target carries ~14px of invisible padding above and below, which is
              what opened the gap under the address — the negative margin takes it
              back visually without shrinking the touch area. */}
          <p className="flex flex-wrap justify-center gap-x-4 -mt-1.5">
            <a href="tel:+302695041878" className="inline-flex items-center min-h-11 px-2 hover:text-white transition">+30 26950 41878</a>
            <a href="tel:+306988010188" className="inline-flex items-center min-h-11 px-2 hover:text-white transition">+30 6988 010188</a>
            <a href="mailto:customerservice@anadyon.gr" className="inline-flex items-center min-h-11 px-2 hover:text-white transition">customerservice@anadyon.gr</a>
          </p>
        </div>
      </footer>
    </>
  );
}
