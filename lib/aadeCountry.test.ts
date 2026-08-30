import { describe, expect, it } from "vitest";
import { COUNTRY_CODES, toIsoCountry } from "./aadeCountry";

/**
 * Both AADE modules filed a country name where the schema wants a code, and
 * defaulted to "GR" when they had nothing. For a business whose customers are
 * mostly foreign, that is a wrong statutory record on nearly every filing —
 * and a silent one, because AADE would accept "GR" without complaint.
 */
describe("resolving a stored country to an ISO code", () => {
  it("resolves what the booking form actually stores", () => {
    // The form's <option value> is the *English display name*, not the code.
    expect(toIsoCountry("United Kingdom")).toBe("GB");
    expect(toIsoCountry("Greece")).toBe("GR");
    expect(toIsoCountry("Germany")).toBe("DE");
  });

  it("accepts a code that is already a code", () => {
    expect(toIsoCountry("GB")).toBe("GB");
    expect(toIsoCountry("gb")).toBe("GB");
  });

  it("forgives the casing and spacing of hand typing", () => {
    expect(toIsoCountry("  united   kingdom ")).toBe("GB");
    expect(toIsoCountry("UNITED KINGDOM")).toBe("GB");
  });

  it("handles the aliases people actually type", () => {
    expect(toIsoCountry("UK")).toBe("GB");
    expect(toIsoCountry("England")).toBe("GB");
    expect(toIsoCountry("USA")).toBe("US");
    expect(toIsoCountry("Holland")).toBe("NL");
    expect(toIsoCountry("Ελλάδα")).toBe("GR");
  });

  it("returns null rather than guessing", () => {
    // The whole point. A caller that cannot resolve a country must refuse to
    // file, because a filing AADE *accepts* with the wrong country is a false
    // record nobody will ever notice.
    expect(toIsoCountry("British")).toBeNull();      // a demonym, not a country
    expect(toIsoCountry("Narnia")).toBeNull();
    expect(toIsoCountry("")).toBeNull();
    expect(toIsoCountry(null)).toBeNull();
    expect(toIsoCountry(undefined)).toBeNull();
  });

  it("never silently answers GR for something it does not know", () => {
    // The old behaviour, named so it cannot come back by accident.
    for (const junk of ["British", "Narnia", "  ", "??"]) {
      expect(toIsoCountry(junk), `${junk} resolved to a country`).not.toBe("GR");
    }
  });

  it("covers every country the form can offer", () => {
    // If the dropdown can produce it, the filer must be able to resolve it.
    const names = new Intl.DisplayNames(["en"], { type: "region" });
    for (const code of COUNTRY_CODES) {
      const shown = names.of(code);
      expect(toIsoCountry(shown!), `${shown} (${code}) does not round-trip`).toBe(code);
    }
  });
});
