import { describe, expect, it } from "vitest";
import { daysInMonth, joinIsoDate, splitIsoDate } from "./dateFields";

describe("segmented date fields", () => {
  it("keeps a missing date visibly blank", () => {
    expect(splitIsoDate(null)).toEqual({ day: "", month: "", year: "" });
    expect(joinIsoDate({ day: "", month: "", year: "" })).toBe("");
  });

  it("round-trips a stored ISO date", () => {
    const parts = splitIsoDate("2031-09-07");
    expect(parts).toEqual({ day: "07", month: "09", year: "2031" });
    expect(joinIsoDate(parts)).toBe("2031-09-07");
  });

  it("handles leap years and refuses impossible dates", () => {
    expect(daysInMonth("02", "2028")).toBe(29);
    expect(daysInMonth("02", "2027")).toBe(28);
    expect(joinIsoDate({ day: "31", month: "02", year: "2027" })).toBe("");
  });
});

