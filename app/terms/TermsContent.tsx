import type { Locale } from "@/lib/i18n";
import { DRIVER_AGE_POLICY, DRIVER_AGE_POLICY_EL } from "@/lib/rentalPolicy";
import { termsCopy } from "@/lib/i18n/content/legal";
import ContentPage, { ContentCard } from "../components/ContentPage";
import LegalSections from "../components/LegalSections";

export default function TermsContent({ locale = "en" }: { locale?: Locale }) {
  const copy = termsCopy(locale);
  const agePolicy = locale === "el" ? DRIVER_AGE_POLICY_EL : DRIVER_AGE_POLICY;

  // The age rule lives in lib/rentalPolicy.ts so the terms, the FAQ and the
  // booking form can never quote three different minimum ages.
  const sections = copy.sections.map((s) => ({
    ...s,
    paragraphs: s.paragraphs?.map((p) => (p === "__AGE_POLICY__" ? agePolicy : p)),
  }));

  return (
    <ContentPage>
      <div>
        <h1 className="text-3xl font-bold mb-8 text-gray-900 dark:text-white">{copy.title}</h1>
        <ContentCard>
          <LegalSections sections={sections} locale={locale} />
        </ContentCard>
      </div>
    </ContentPage>
  );
}
