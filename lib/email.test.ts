import { describe, expect, it } from "vitest";
import { looksLikeEmail } from "./email";

describe("looksLikeEmail", () => {
  it("accepts ordinary addresses", () => {
    expect(looksLikeEmail("tasos@anadyon.gr")).toBe(true);
    expect(looksLikeEmail("first.last@sub.example.com")).toBe(true);
  });

  it("rejects missing/duplicate @ and missing domain dot", () => {
    expect(looksLikeEmail("no-at-sign.example.com")).toBe(false);
    expect(looksLikeEmail("two@@example.com")).toBe(false);
    expect(looksLikeEmail("a@b@example.com")).toBe(false);
    expect(looksLikeEmail("a@example")).toBe(false);
    expect(looksLikeEmail("@example.com")).toBe(false);
    expect(looksLikeEmail("a@.com")).toBe(false);
    expect(looksLikeEmail("a@example.")).toBe(false);
  });

  it("rejects whitespace in either part", () => {
    expect(looksLikeEmail("a b@example.com")).toBe(false);
    expect(looksLikeEmail("a@exam ple.com")).toBe(false);
  });

  it("stays fast on the pathological input that made the old regex polynomial", () => {
    const adversarial = "!.".repeat(50_000) + "!";
    const start = performance.now();
    looksLikeEmail(adversarial);
    expect(performance.now() - start).toBeLessThan(50);
  });
});
