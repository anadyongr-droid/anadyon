import { describe, it, expect } from "vitest";
import { formatHealthAlert, spfProblems, type CheckResult } from "@/lib/healthChecks";

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

describe("SPF analysis", () => {
  /**
   * The record that was live on 11 September 2026. It raised nothing from the
   * previous check — no `+a`, a real record, correctly scoped to the mail
   * server — while Resend, which sends every booking confirmation from this
   * domain, was absent from it. That is the case this function exists for.
   */
  const LIVE_2026_09_11 = "v=spf1 +mx include:_spf.fastmail.gr -all";

  it("catches a sender that is not authorised, on the record that was actually live", () => {
    const problems = spfProblems(LIVE_2026_09_11);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("Resend");
    expect(problems[0]).toContain("DKIM alone");
  });

  it("passes once that sender is added, changing nothing else", () => {
    expect(spfProblems("v=spf1 +mx include:_spf.fastmail.gr include:amazonses.com -all")).toEqual([]);
  });

  it("accepts either spelling Resend has published", () => {
    for (const token of ["amazonses.com", "spf.resend.com", "_spf.resend.com"]) {
      expect(spfProblems(`v=spf1 +mx include:${token} -all`)).toEqual([]);
    }
  });

  it("still reports a missing record", () => {
    expect(spfProblems(undefined)).toEqual(["no SPF record"]);
    expect(spfProblems("")).toEqual(["no SPF record"]);
  });

  it("keeps the `+a` finding the previous check was written for", () => {
    const problems = spfProblems("v=spf1 a +mx include:amazonses.com -all");
    expect(problems.some((p) => p.includes("`+a`"))).toBe(true);
  });

  it("reports a record that authorises the whole internet", () => {
    const problems = spfProblems("v=spf1 +mx include:amazonses.com +all");
    expect(problems.some((p) => p.includes("+all"))).toBe(true);
  });

  it("does not mistake an unrelated include for the sender", () => {
    // `amazonses.com` must match as a token, not as a coincidence inside some
    // other hostname that merely mentions a sender's name.
    expect(spfProblems("v=spf1 include:_spf.fastmail.gr -all").length).toBe(1);
  });
});
