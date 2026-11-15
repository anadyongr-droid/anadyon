import { describe, expect, it } from "vitest";
import { hasVerifiedMfaAssurance } from "./mfaAssurance";

describe("protected admin MFA assurance", () => {
  it("permits only a verified aal2 session", () => {
    expect(hasVerifiedMfaAssurance("aal2")).toBe(true);
  });

  it.each([undefined, null, "", "aal1", "aal3", "unknown"])(
    "fails closed when current assurance is %s",
    (level) => {
      expect(hasVerifiedMfaAssurance(level)).toBe(false);
    },
  );
});
