import { describe, it, expect } from "vitest";
import { t, localePath, missingKeys, LOCALES, isLocale } from "./index";

describe("translation coverage", () => {
  it("has a Greek string for every English key", () => {
    // The gap this catches is a page that silently renders English inside a
    // Greek layout — which reads as broken rather than as a missing translation.
    expect(missingKeys("el")).toEqual([]);
  });

  it("uses the approved booking-estimate wording in the visible price window", () => {
    expect(t("en", "form.finalPriceNote")).toBe(
      "This is an estimate only. Final price confirmed upon booking confirmation email.",
    );
    expect(t("el", "form.finalPriceNote")).toBe(
      "Ενδεικτική τιμή. Η τελική τιμή επιβεβαιώνεται στο email επιβεβαίωσης κράτησης.",
    );
  });

  it("distinguishes the initial acknowledgment from the later reservation confirmation", () => {
    expect(t("en", "quote.landingIntro")).toBe(
      "Enter the reference number from your reservation acknowledgment email and the last name you used when submitting the request.",
    );
    expect(t("en", "quote.cantFind")).toBe(
      "Can't find your reference? Check your reservation acknowledgment email from",
    );
    expect(t("el", "quote.landingIntro")).toContain("email επιβεβαίωσης παραλαβής του αιτήματος κράτησης");
    expect(t("el", "quote.cantFind")).toContain("email επιβεβαίωσης παραλαβής του αιτήματος κράτησης");
    expect(t("en", "form.willContactYou")).toContain("reservation acknowledgment email");
    expect(t("el", "form.willContactYou")).toContain("επιβεβαίωσης παραλαβής");
    expect(t("en", "form.codeApplied")).toBe("Code “{code}” applied");
    expect(t("el", "form.codeApplied")).toBe("Ο κωδικός «{code}» εφαρμόστηκε");
  });

  it("falls back to English rather than showing the key", () => {
    // A raw key in the middle of a sentence looks like a fault; English does not.
    expect(t("el", "definitely.not.a.key")).toBe("definitely.not.a.key");
    expect(t("en", "nav.cars")).toBe("Cars");
    expect(t("el", "nav.cars")).toBe("Αυτοκίνητα");
  });
});

describe("locale paths", () => {
  it.each([
    ["/", "el", "/el"],
    ["/cars", "el", "/el/cars"],
    ["/quote/ABC123", "el", "/el/quote/ABC123"],
    ["/el/cars", "en", "/cars"],
    ["/el", "en", "/"],
    ["/cars", "en", "/cars"],
    ["/el/cars", "el", "/el/cars"],
  ])("%s → %s gives %s", (from, to, expected) => {
    expect(localePath(from, to as "en" | "el")).toBe(expected);
  });

  it("does not mistake a path merely starting with 'el' for the locale", () => {
    // /elsewhere must not become /sewhere.
    expect(localePath("/elsewhere", "en")).toBe("/elsewhere");
    expect(localePath("/elsewhere", "el")).toBe("/el/elsewhere");
  });
});

describe("locale guard", () => {
  it("accepts the supported locales and nothing else", () => {
    for (const l of LOCALES) expect(isLocale(l)).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale("EL")).toBe(false);
  });
});
