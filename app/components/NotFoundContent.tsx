"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { translator, localePath, isLocale, DEFAULT_LOCALE, type Locale } from "@/lib/i18n";

/**
 * The page a visitor lands on when a link into the site is wrong.
 *
 * Until 19 September 2026 this was Next's built-in 404: a full viewport of
 * white with "404 This page could not be found." in 24px system font. The
 * header and footer were around it, because the root layout still wraps the
 * default — but the page itself offered nothing to click and no indication the
 * site had what the visitor came for.
 *
 * That is the expensive kind of 404. The visitor is not lost inside the site;
 * they were sent here by somebody else's link, so they have no history to go
 * back through and no reason to assume a second attempt will work. A French
 * travel guide has been sending readers to `/en/` — a URL this site has never
 * served — and every one of them met that blank page. The redirect added
 * alongside this fixes that one link. This fixes the next one, which we will
 * not hear about in advance.
 *
 * Client-side rather than server-side purely for the locale. An unmatched URL
 * has no route segment to read it from, so it comes from the path, the same way
 * PublicShell derives it — `/el/anything-wrong` keeps a Greek reader in Greek.
 */
export default function NotFoundContent() {
  const pathname = usePathname() ?? "/";
  const segment = pathname.split("/")[1] ?? "";
  const locale: Locale = isLocale(segment) ? segment : DEFAULT_LOCALE;
  const tr = translator(locale);
  const href = (p: string) => localePath(p, locale);

  /**
   * Report the dead URL and who sent the visitor to it.
   *
   * This is the half of the problem the redirect cannot solve. We fixed `/en`
   * because a referral happened to surface in Analytics and somebody happened to
   * click it; the next wrong link will not announce itself. A 404 that names its
   * own referrer turns "somebody noticed" into a report that can be read.
   *
   * A custom event rather than relying on the page view: `not-found.tsx` cannot
   * export metadata, so this page carries the site's generic <title> and is
   * indistinguishable from any other page view in GA4.
   *
   * Pushed onto dataLayer directly instead of calling gtag(). The consent gate
   * loads gtag.js `afterInteractive`, so on a fast render this component mounts
   * before the function exists and a gtag() call would be dropped silently;
   * queued entries are processed when the library arrives.
   *
   * KNOWN BLIND SPOT, and it is a wide one. Nothing here runs for a visitor who
   * declined analytics cookies, and nothing runs for a crawler. Search engines
   * are the population that matters most for finding stale inbound links, and
   * they are exactly the population this cannot see. It is a supplement to the
   * Search Console and Bing reports in docs/INBOUND-LINKS.md, never a substitute.
   */
  useEffect(() => {
    try {
      const w = window as unknown as { dataLayer?: unknown[] };
      w.dataLayer = w.dataLayer || [];
      w.dataLayer.push({
        event: "page_not_found",
        not_found_path: window.location.pathname + window.location.search,
        not_found_referrer: document.referrer || "(none)",
      });
    } catch {
      /* Analytics must never be the reason a 404 page fails to render. */
    }
  }, []);

  // The fleet first, then the pages a stranded visitor most often actually
  // wants. Ordered by what earns money, not alphabetically.
  const destinations = [
    { path: "/cars", key: "nav.cars" },
    { path: "/motorbikes", key: "nav.motorbikes" },
    { path: "/bikes", key: "nav.bikes" },
    { path: "/", key: "nav.home" },
    { path: "/contact", key: "nav.contact" },
    { path: "/faq", key: "footer.faq" },
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 py-16 sm:py-24">
      <p className="text-sm font-bold uppercase tracking-widest text-orange-700 dark:text-orange-400">
        404
      </p>
      <h1 className="mt-3 text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white">
        {tr("notFound.heading")}
      </h1>
      <p className="mt-4 text-gray-600 dark:text-gray-300 leading-relaxed">
        {tr("notFound.body")}
      </p>

      <h2 className="mt-10 text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {tr("notFound.browse")}
      </h2>
      <ul className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {destinations.map(({ path, key }) => (
          <li key={path}>
            <a
              href={href(path)}
              className="flex items-center min-h-12 px-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-orange-700 dark:text-orange-400 font-medium hover:border-orange-700 dark:hover:border-orange-400 transition"
            >
              {tr(key)}
            </a>
          </li>
        ))}
      </ul>

      <p className="mt-10 text-gray-600 dark:text-gray-300">
        {tr("notFound.helpLead")}{" "}
        <a href="tel:+302695041878" className="text-orange-700 dark:text-orange-400 font-medium hover:underline">
          +30 26950 41878
        </a>
      </p>
      <p className="mt-2">
        <a href={href("/quote")} className="text-orange-700 dark:text-orange-400 hover:underline">
          {tr("notFound.lookup")}
        </a>
      </p>
    </div>
  );
}
