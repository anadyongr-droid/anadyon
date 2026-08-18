import Image from "next/image";
import type { Locale } from "@/lib/i18n";
import { sights, SIGHTS_COPY } from "@/lib/i18n/content/legal";
import ContentPage from "../components/ContentPage";
import { rich } from "../components/LegalSections";

export default function SightsContent({ locale = "en" }: { locale?: Locale }) {
  const copy = SIGHTS_COPY[locale];
  const list = sights(locale);

  return (
    <ContentPage>
      <h1 className="text-3xl font-bold mb-2 text-gray-900 dark:text-white">{copy.title}</h1>
      <p className="text-gray-600 dark:text-gray-400 mb-10 leading-relaxed">{copy.intro}</p>

      <div className="space-y-5">
        {list.map((s, i) => (
          <div key={i} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            {s.image && (
              <div className="relative w-full h-56">
                <Image src={s.image} alt={s.name} fill sizes="(max-width: 768px) 100vw, 768px" quality={82} className="object-cover" />
              </div>
            )}
            <div className="p-6">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{s.name}</h2>
              <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">{s.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-10 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl p-6">
        <p className="text-base font-semibold mb-2 text-gray-900 dark:text-white">{copy.ctaTitle}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400">{rich(copy.ctaBody, locale)}</p>
      </div>
    </ContentPage>
  );
}
