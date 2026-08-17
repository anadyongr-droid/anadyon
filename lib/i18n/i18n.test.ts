import { describe, it, expect } from "vitest";
import { t, localePath, missingKeys, LOCALES, isLocale } from "./index";

describe("translation coverage", () => {
  it("has a Greek string for every English key", () => {
    // The gap this catches is a page that silently renders English inside a
    // Greek layout — which reads as broken rather than as a missing translation.
    expect(missingKeys("el")).toEqual([]);
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
