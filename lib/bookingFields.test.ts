import { describe, expect, it } from "vitest";
import { dateInputValue } from "./bookingFields";

describe("dateInputValue", () => {
  it("renders missing SQL date values as a blank controlled input", () => {
    expect(dateInputValue(null)).toBe("");
    expect(dateInputValue(undefined)).toBe("");
  });

  it("preserves an explicitly stored date without substituting a date", () => {
    expect(dateInputValue("2002-01-16")).toBe("2002-01-16");
  });

  it("does not coerce non-string values into a misleading date", () => {
    expect(dateInputValue(new Date("2026-08-22"))).toBe("");
    expect(dateInputValue(0)).toBe("");
  });
});
