import type { Locale } from "@/lib/i18n";
import { termsOfUseCopy } from "@/lib/i18n/content/legal";
import ContentPage, { ContentCard } from "../components/ContentPage";
import LegalSections, { rich } from "../components/LegalSections";

export default function TermsOfUseContent({ locale = "en" }: { locale?: Locale }) {
  const copy = termsOfUseCopy(locale);
  return (
    <ContentPage>
      <div>
        <h1 className="text-3xl font-bold mb-8 text-gray-900 dark:text-white">{copy.title}</h1>
        <ContentCard>
          <LegalSections sections={copy.sections} locale={locale} />
          {copy.closing && <p>{rich(copy.closing, locale)}</p>}
        </ContentCard>
      </div>
    </ContentPage>
  );
}
