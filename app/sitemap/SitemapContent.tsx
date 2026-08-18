import type { Locale } from "@/lib/i18n";
import { localePath } from "@/lib/i18n";
import { sitemapSections, SITEMAP_COPY } from "@/lib/i18n/content/legal";
import ContentPage from "../components/ContentPage";
import { rich } from "../components/LegalSections";

export default function SitemapContent({ locale = "en" }: { locale?: Locale }) {
  const copy = SITEMAP_COPY[locale];

  return (
    <ContentPage>
      <h1 className="text-3xl font-bold mb-2 text-gray-900 dark:text-white">{copy.title}</h1>
      <p className="text-gray-500 dark:text-gray-400 mb-10">{rich(copy.intro, locale)}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {sitemapSections(locale).map((section) => (
          <div key={section.title} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
            <h2 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">{section.title}</h2>
            <ul className="space-y-2">
              {section.links.map((link) => (
                <li key={link.href}>
                  {/* Resolved against the locale so the Greek site map keeps the
                      reader inside the Greek site. */}
                  <a href={localePath(link.href, locale)} className="text-orange-600 dark:text-orange-400 hover:underline text-sm">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </ContentPage>
  );
}
