"use client";
import ContentPage, { ContentCard } from "../components/ContentPage";
import { aboutCopy, ABOUT_CONTACT_PROMPT } from "@/lib/i18n/content/pages";
import { localePath, type Locale } from "@/lib/i18n";

export default function AboutClient({ locale = "en" }: { locale?: Locale }) {
  const copy = aboutCopy(locale);
  const prompt = ABOUT_CONTACT_PROMPT[locale];

  return (
    <ContentPage>
      <div>
        <h1 className="text-3xl font-bold mb-6 text-gray-900 dark:text-white">{copy.title}</h1>
        <ContentCard className="space-y-5">
          {copy.blocks.flatMap(b => b.paragraphs).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          <p>
            {prompt.text}{" "}
            <a href={localePath("/contact", locale)} className="text-orange-700 dark:text-orange-400 hover:underline font-medium">
              {prompt.link}
            </a>.
          </p>
        </ContentCard>
      </div>
    </ContentPage>
  );
}
