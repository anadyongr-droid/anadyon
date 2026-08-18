import { describe, it, expect } from "vitest";
import { faqs, FAQ_COUNTS, FAQ_TITLE } from "./faq";

describe("FAQ translations", () => {
  it("has the same number of questions in both languages", () => {
    // Index-aligned arrays: a Greek array one entry short would silently drop a
    // question rather than fail, and nobody would notice until a customer did.
    expect(FAQ_COUNTS.el).toBe(FAQ_COUNTS.en);
  });

  it("has no empty question or answer in either language", () => {
    for (const locale of ["en", "el"] as const) {
      for (const [i, f] of faqs(locale).entries()) {
        expect(f.q.trim(), `${locale} question ${i}`).not.toBe("");
        expect(f.a.trim(), `${locale} answer ${i}`).not.toBe("");
      }
    }
  });

  it("actually contains Greek in the Greek set", () => {
    // Guards against a copy-paste that leaves English sitting in the el array.
    const greek = /[Ͱ-Ͽἀ-῿]/;
    for (const [i, f] of faqs("el").entries()) {
      expect(greek.test(f.q), `question ${i} is not Greek`).toBe(true);
      expect(greek.test(f.a), `answer ${i} is not Greek`).toBe(true);
    }
  });

  it("has a title for both languages", () => {
    expect(FAQ_TITLE.en).toBeTruthy();
    expect(FAQ_TITLE.el).toBeTruthy();
  });
});
