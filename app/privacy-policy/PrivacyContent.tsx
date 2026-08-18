import type { Locale } from "@/lib/i18n";
import { privacyCopy } from "@/lib/i18n/content/legal";
import ContentPage, { ContentCard } from "../components/ContentPage";
import LegalSections from "../components/LegalSections";

export default function PrivacyContent({ locale = "en" }: { locale?: Locale }) {
  const copy = privacyCopy(locale);
  return (
    <ContentPage>
      <div>
        <h1 className="text-3xl font-bold mb-2 text-gray-900 dark:text-white">{copy.title}</h1>
        {copy.intro && <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">{copy.intro}</p>}
        <ContentCard>
          <LegalSections sections={copy.sections} locale={locale} />
        </ContentCard>
      </div>
    </ContentPage>
  );
}
