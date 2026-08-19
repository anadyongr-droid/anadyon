"use client";
import { usePathname } from "next/navigation";
import Header from "./Header";
import CookieBanner, { openCookieSettings } from "./CookieBanner";
import AuthFragmentRedirect from "./AuthFragmentRedirect";
import { translator, localePath, isLocale, DEFAULT_LOCALE, type Locale } from "@/lib/i18n";

export default function PublicShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const isAdmin = pathname.startsWith("/admin");

  if (isAdmin) return <>{children}</>;

  // Taken from the URL rather than passed down, so a page added later is
  // translated by virtue of where it sits and not by remembering to thread a
  // prop through it.
  const segment = pathname.split("/")[1] ?? "";
  const locale: Locale = isLocale(segment) ? segment : DEFAULT_LOCALE;
  const tr = translator(locale);
  const href = (p: string) => localePath(p, locale);

  const footerLinks = [
    { path: "/faq",            key: "footer.faq" },
    { path: "/terms",          key: "footer.terms" },
    { path: "/terms-of-use",   key: "footer.termsOfUse" },
    { path: "/privacy-policy", key: "footer.privacy" },
    { path: "/sitemap",        key: "footer.sitemap" },
    { path: "/contact",        key: "footer.contact" },
  ];

  return (
    <>
      <Header locale={locale} />
      {/* Rescues an invitation or reset that Supabase sent to the wrong page. */}
      <AuthFragmentRedirect />
      <CookieBanner locale={locale} />
      <main className="flex-1">{children}</main>
      <footer className="bg-gray-900 dark:bg-gray-950 text-gray-400 border-t border-orange-700">
        <nav aria-label="Footer" className="bg-orange-700 w-full">
          <div className="flex flex-wrap justify-center">
            {footerLinks.map(l => (
              <a
                key={l.path}
                href={href(l.path)}
                className="text-center text-sm font-semibold text-white px-5 py-3 hover:bg-orange-800 visited:text-white transition cursor-pointer"
              >
                {tr(l.key)}
              </a>
            ))}
          </div>
        </nav>
        <div className="max-w-6xl mx-auto px-4 text-center text-xs pt-6 pb-2 text-gray-300">
          <p>{tr("footer.copyright")}</p>
          <p className="mt-1.5">{tr("footer.address")}</p>
          {/* Tapping a number to call is a primary action on mobile, so these keep
              a 44px target rather than the 16px the bare text would give. That
              target carries ~14px of invisible padding above and below, which is
              what opened the gap under the address — the negative margin takes it
              back visually without shrinking the touch area. */}
          {/* Withdrawal has to be as easy as giving consent; without this the
              only way to change a choice was to clear site storage. */}
          <p className="-mt-1.5">
            <button
              onClick={openCookieSettings}
              className="inline-flex items-center min-h-11 px-2 underline hover:text-white transition"
            >
              {tr("cookie.settings")}
            </button>
          </p>
          <p className="flex flex-wrap justify-center gap-x-4 -mt-3">
            <a href="tel:+302695041878" className="inline-flex items-center min-h-11 px-2 hover:text-white transition">+30 26950 41878</a>
            <a href="tel:+306988010188" className="inline-flex items-center min-h-11 px-2 hover:text-white transition">+30 6988 010188</a>
            <a href="mailto:customerservice@anadyon.gr" className="inline-flex items-center min-h-11 px-2 hover:text-white transition">customerservice@anadyon.gr</a>
          </p>
        </div>
      </footer>
    </>
  );
}
