"use client";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, Globe } from "lucide-react";
import { translator, localePath, type Locale } from "@/lib/i18n";

const routes = [
  { path: "/",           key: "nav.home" },
  { path: "/cars",       key: "nav.cars" },
  { path: "/motorbikes", key: "nav.motorbikes" },
  { path: "/bikes",      key: "nav.bikes" },
  { path: "/about",      key: "nav.about" },
  { path: "/sights",     key: "nav.sights" },
  { path: "/blog",       key: "nav.blog" },
  { path: "/contact",    key: "nav.contact" },
  { path: "/quote",      key: "nav.quote" },
];

export default function Header({ locale = "en" }: { locale?: Locale }) {
  const [open, setOpen] = useState(false);
  const tr = translator(locale);
  const pathname = usePathname() ?? "/";

  // Links stay within the current language, so a Greek visitor clicking through
  // the navigation is not silently returned to English half way round the site.
  const href = (p: string) => localePath(p, locale);
  const other: Locale = locale === "en" ? "el" : "en";

  return (
    <header className="bg-white dark:bg-gray-900 shadow-sm sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        {/* The logo is a JPEG with a white background. On the dark header that
            renders as a bare white rectangle, so in dark mode it is given a
            padded white plate with rounded corners — it then reads as a
            deliberate brand lockup rather than a broken image. Replace with a
            transparent PNG/SVG and this wrapper can go. */}
        <Link href={href("/")} className="dark:bg-white dark:rounded-lg dark:px-3 dark:py-1.5 inline-block">
          <Image
            src="/logo.jpg"
            alt="Anadyon Rentals"
            width={270}
            height={80}
            sizes="270px"
            quality={82}
            className="object-contain"
            priority
          />
        </Link>

        <div className="flex items-center gap-1">
          {/* Switches language on the page the visitor is actually reading,
              rather than returning them to the home page to find their way back. */}
          <Link
            href={localePath(pathname, other)}
            hrefLang={other}
            className="flex items-center gap-1.5 min-h-11 px-3 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-orange-700 dark:hover:text-orange-400 transition"
            aria-label={other === "el" ? "Αλλαγή γλώσσας στα Ελληνικά" : "Switch language to English"}
          >
            <Globe size={15} />
            <span className="hidden sm:inline">{tr("nav.language")}</span>
            <span className="sm:hidden">{other.toUpperCase()}</span>
          </Link>

          {/* p-2.5 lifts the tap area from the icon's bare 24px to 44px, the
              minimum in WCAG 2.5.5 and the Apple HIG. The matching negative
              margin keeps the icon optically aligned with the container padding. */}
          <button
            className={`${locale === "el" ? "lg:hidden" : "md:hidden"} text-gray-700 dark:text-gray-300 p-2.5 -mr-2.5`}
            onClick={() => setOpen(!open)}
            aria-label={tr("nav.toggleMenu")}
            aria-expanded={open}
          >
            {open ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Desktop nav — aligned to the same content column as the logo */}
      <nav aria-label="Main" className={`${locale === "el" ? "hidden lg:block" : "hidden md:block"} bg-orange-700 w-full`}>
        <div className="max-w-6xl mx-auto px-4 flex">
          {routes.map(r => (
            <a
              key={r.path}
              href={href(r.path)}
              className={`${locale === "el"
                ? "flex-auto whitespace-nowrap px-2 text-[11px] lg:text-xs xl:text-sm"
                : "flex-1 text-sm"
              } text-center font-semibold text-white py-3 hover:bg-orange-800 dark:hover:bg-orange-900 transition border-r border-orange-400/40 dark:border-orange-500/40 last:border-r-0`}
            >
              {tr(r.key)}
            </a>
          ))}
        </div>
      </nav>

      {/* Mobile menu */}
      {open && (
        <div className={`${locale === "el" ? "lg:hidden" : "md:hidden"} bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 px-4 py-2 space-y-1`}>
          {routes.map(r => (
            <a
              key={r.path}
              href={href(r.path)}
              className="flex items-center min-h-11 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-orange-700 dark:hover:text-orange-400 visited:text-gray-700 dark:visited:text-gray-300"
              onClick={() => setOpen(false)}
            >
              {tr(r.key)}
            </a>
          ))}
        </div>
      )}
    </header>
  );
}
