import { describe, expect, it } from "vitest";
import { reservationRef } from "./wise";

describe("customer-facing reservation references", () => {
  it("uses the website quote reference shown in the reservation request acknowledgment email", () => {
    expect(reservationRef("aabbccdd-1111-2222-3333-444455556666", "Quote ref: C8GW5C. Customer notes: Hi"))
      .toBe("C8GW5C");
  });

  it("prefers the linked quote over an editable legacy note", () => {
    expect(reservationRef("aabbccdd-1111-2222-3333-444455556666", "Quote ref: OLD123", "C8GW5C"))
      .toBe("C8GW5C");
  });

  it("uses a short stable reference for an office walk-in", () => {
    expect(reservationRef("aabbccdd-1111-2222-3333-444455556666", null)).toBe("AABBCC");
  });
});
