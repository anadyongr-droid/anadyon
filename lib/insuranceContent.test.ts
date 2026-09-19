import { describe, expect, it } from "vitest";
import { faqs } from "@/lib/i18n/content/faq";
import { termsCopy } from "@/lib/i18n/content/legal";

function renderedTerms(locale: "en" | "el") {
  const terms = termsCopy(locale);
  return terms.sections.flatMap((section) => [
    ...(section.paragraphs ?? []),
    ...(section.list ?? []),
    ...(section.after ?? []),
  ]).join("\n");
}

describe("published insurance claims", () => {
  it("does not describe theft or CDW as included in standard rentals", () => {
    const english = [renderedTerms("en"), ...faqs("en").map((item) => item.a)].join("\n");
    const greek = [renderedTerms("el"), ...faqs("el").map((item) => item.a)].join("\n");

    expect(english).not.toContain("include Collision Damage Waiver");
    expect(english).not.toContain("include Theft insurance");
    expect(greek).not.toContain("περιλαμβάνουν Μεικτή Ασφάλεια");
    expect(greek).not.toContain("περιλαμβάνουν ασφάλιση κλοπής");
  });

  it("publishes the exclusions and qualifies 50cc roadside assistance", () => {
    const english = renderedTerms("en");
    const greek = renderedTerms("el");

    for (const exclusion of ["tyres", "mirrors", "glass", "keys", "underside", "interior"]) {
      expect(english).toContain(exclusion);
    }
    expect(english).toContain("not included for 50cc motorbikes");
    expect(greek).toContain("δεν περιλαμβάνεται για μοτοποδήλατα 50cc");
  });
});
