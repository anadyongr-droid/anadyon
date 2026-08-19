import { describe, it, expect } from "vitest";
import { formatHealthAlert, type CheckResult } from "@/lib/healthChecks";

/**
 * The alert formatter is the part worth testing without a network: the checks
 * themselves ask production questions and are verified by running them against
 * production, but this decides whether anyone hears about the answer.
 */
describe("health alert formatting", () => {
  const pass = (name: string): CheckResult => ({ name, ok: true, detail: "fine" });
  const fail = (name: string, detail: string): CheckResult => ({ name, ok: false, detail });

  it("says nothing when everything passes", () => {
    // A daily "all fine" message trains the reader to ignore the channel, so
    // the one time it matters the alert is skimmed past with the rest.
    expect(formatHealthAlert([pass("a"), pass("b")])).toBeNull();
  });

  it("names the failing check and why", () => {
    const msg = formatHealthAlert([
      pass("Rate card readable"),
      fail("Analytics not blocked by CSP", "connect-src is missing https://*.google-analytics.com"),
    ]);
    expect(msg).toContain("Analytics not blocked by CSP");
    expect(msg).toContain("connect-src is missing");
    // The count tells the reader the scale without them having to add it up.
    expect(msg).toContain("1 of 2");
  });

  it("still lists what passed, so a failure is not read as total collapse", () => {
    const msg = formatHealthAlert([pass("Rate card readable"), fail("x", "y")]);
    expect(msg).toContain("Rate card readable");
  });

  it("reports every failure rather than only the first", () => {
    const msg = formatHealthAlert([fail("one", "a"), fail("two", "b"), fail("three", "c")])!;
    for (const n of ["one", "two", "three"]) expect(msg).toContain(n);
    expect(msg).toContain("3 of 3");
  });
});
