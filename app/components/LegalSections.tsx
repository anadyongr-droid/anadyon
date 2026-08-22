import type { ReactNode } from "react";
import type { Locale } from "@/lib/i18n";
import { localePath } from "@/lib/i18n";
import type { Section } from "@/lib/i18n/content/legal";

/**
 * Renders the bilingual legal and reference copy.
 *
 * Two pieces of light markup are supported inside the strings so translators
 * never touch JSX:
 *
 *   {contact}, {privacy}, {cars}, … — internal links, resolved against the
 *   current locale so a Greek page links to /el/contact rather than /contact.
 *   {email}, {googlePrivacy}, {googleTerms}, {hdpa}, {vercelPrivacy} — fixed
 *   external links.
 *   **text** — bold, used for the defined terms in the rights list.
 *
 * Anything else is rendered as plain text, so an unrecognised placeholder shows
 * up visibly rather than silently disappearing.
 */

const LINK_CLASS = "text-orange-700 dark:text-orange-400 hover:underline";
const EXTERNAL_CLASS = "text-blue-600 dark:text-blue-400 hover:underline";

interface LinkSpec { href: string; label: Record<Locale, string>; external?: boolean }

const INTERNAL: Record<string, LinkSpec> = {
  contact:     { href: "/contact",        label: { en: "contact us",     el: "επικοινωνήστε μαζί μας" } },
  privacy:     { href: "/privacy-policy", label: { en: "Privacy Policy", el: "Πολιτική Απορρήτου" } },
  terms:       { href: "/terms",          label: { en: "Terms & Conditions", el: "Όροι και Προϋποθέσεις" } },
  cars:        { href: "/cars",           label: { en: "car",            el: "αυτοκίνητο" } },
  motorbikes:  { href: "/motorbikes",     label: { en: "motorbike",      el: "μηχανή" } },
  bikes:       { href: "/bikes",          label: { en: "bike",           el: "ποδήλατο" } },
};

const EXTERNAL: Record<string, LinkSpec> = {
  email:         { href: "mailto:customerservice@anadyon.gr", label: { en: "customerservice@anadyon.gr", el: "customerservice@anadyon.gr" } },
  googlePrivacy: { href: "https://policies.google.com/privacy", label: { en: "Google's Privacy Policy", el: "Πολιτική Απορρήτου της Google" }, external: true },
  googleTerms:   { href: "https://policies.google.com/terms",   label: { en: "Terms of Service",        el: "Όρους Παροχής Υπηρεσιών" }, external: true },
  hdpa:          { href: "https://www.dpa.gr",                  label: { en: "Hellenic Data Protection Authority (HDPA)", el: "Αρχή Προστασίας Δεδομένων Προσωπικού Χαρακτήρα (ΑΠΔΠΧ)" }, external: true },
};

/** Splits on {placeholder} and **bold**, resolving each against the locale. */
export function rich(text: string, locale: Locale): ReactNode[] {
  return text.split(/(\{[a-zA-Z]+\}|\*\*[^*]+\*\*)/g).map((part, i) => {
    const bold = /^\*\*(.+)\*\*$/.exec(part);
    if (bold) return <strong key={i}>{bold[1]}</strong>;

    const token = /^\{([a-zA-Z]+)\}$/.exec(part);
    if (!token) return part;

    const key = token[1];
    const internal = INTERNAL[key];
    if (internal) {
      return (
        <a key={i} href={localePath(internal.href, locale)} className={LINK_CLASS}>
          {internal.label[locale]}
        </a>
      );
    }
    const external = EXTERNAL[key];
    if (external) {
      return (
        <a
          key={i}
          href={external.href}
          className={external.external ? EXTERNAL_CLASS : LINK_CLASS}
          {...(external.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        >
          {external.label[locale]}
        </a>
      );
    }
    // Unknown placeholder: show it rather than swallow it, so it is caught.
    return part;
  });
}

export default function LegalSections({ sections, locale }: { sections: Section[]; locale: Locale }) {
  return (
    <>
      {sections.map((section, i) => (
        <div key={i}>
          {section.heading && (
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{section.heading}</h2>
          )}
          {section.paragraphs?.map((p, j) => (
            <p key={j} className={j > 0 ? "mt-2" : undefined}>{rich(p, locale)}</p>
          ))}

          {section.list && (
            <ul className="list-disc ml-6 mt-1 space-y-1 text-sm">
              {section.list.map((item, j) => <li key={j}>{rich(item, locale)}</li>)}
            </ul>
          )}

          {section.table && (
            // Wide tables scroll inside their own box rather than pushing the
            // page sideways on a phone.
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-700 text-left">
                    {section.table.headers.map((h, j) => (
                      <th key={j} className="px-3 py-2 border border-gray-200 dark:border-gray-600 font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {section.table.rows.map((row, j) => (
                    <tr key={j}>
                      {row.map((cell, k) => (
                        <td
                          key={k}
                          className={`px-3 py-2 border border-gray-200 dark:border-gray-600${
                            section.table!.mono?.includes(k) ? " font-mono text-xs" : ""
                          }`}
                        >
                          {rich(cell, locale)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {section.after?.map((p, j) => (
            <p key={j} className="mt-3 text-sm">{rich(p, locale)}</p>
          ))}
        </div>
      ))}
    </>
  );
}
