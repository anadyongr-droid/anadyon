import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A staff member who forgets their password cannot get back in.
 *
 * `app/admin/set-password/page.tsx` serves two flows through one screen — the
 * invitation link and the forgotten-password link — because Supabase delivers
 * both as the same kind of link. Its own comment explains why it calls
 * `updateUser({ password })` straight away:
 *
 *   "Someone arriving here has a session but has not enrolled a second factor
 *    yet — they cannot, they do not have a password."
 *
 * That is true of an invitation and false of a reset. proxy.ts enforces MFA
 * enrolment before the admin area opens, so **every established account has a
 * factor**, and Supabase refuses a password change from the AAL1 session a
 * recovery link produces:
 *
 *   AAL2 session is required to update email or password when MFA is enabled.
 *
 * Reported from production on 30 August. The reasoning in the comment was sound
 * for one of the two cases the page serves, and the other was never exercised —
 * the same shape as the turnaround applied to one end of a rental.
 *
 * These read the page's source rather than driving it: the screen needs a live
 * Supabase recovery session to render, which no test here can produce. Per the
 * standing rule from the same review, a source-reading test is a tripwire and
 * never the sole guard on something security-shaped — this one guards a
 * usability failure, and the security property it must not break is asserted
 * separately below.
 */
const root = new URL("../", import.meta.url).pathname;
const page = readFileSync(join(root, "app/admin/set-password/page.tsx"), "utf8");

/** Strips comments, so a note *about* a call is not mistaken for the call. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}
const body = code(page);

describe("the set-password screen and an enrolled second factor", () => {
  it("decides from listFactors, and from nothing else", () => {
    // listFactors().totp contains only verified factors — @supabase/auth-js
    // filters on status === 'verified' — and a verified factor is exactly when
    // GoTrue refuses the password change. One question, one call.
    expect(body).toMatch(/mfa\.listFactors\(\)/);

    // getAuthenticatorAssuranceLevel derives nextLevel from the *stored session
    // object* rather than the network, so it can disagree with listFactors.
    // Joined by &&, any disagreement resolved to "no factor needed" — the
    // failing direction, and what reached production on 30 August.
    expect(
      body,
      "an extra condition on this guard is another way for it to wrongly say no"
    ).not.toMatch(/getAuthenticatorAssuranceLevel/);
  });

  it("challenges and verifies the factor before changing the password", () => {
    expect(body).toMatch(/mfa\.challenge\(/);
    expect(body).toMatch(/mfa\.verify\(/);

    // Order is the point: verifying after the update would still be refused.
    const verify = body.indexOf("mfa.verify(");
    const update = body.indexOf("updateUser(");
    expect(verify).toBeGreaterThan(-1);
    expect(update).toBeGreaterThan(-1);
    expect(verify, "the password is changed before the factor is verified").toBeLessThan(update);
  });

  it("still lets an invited person through with no factor at all", () => {
    // The case the page was built for. An invitation has no factor, so
    // listFactors returns an empty totp array, factorId stays null, and no
    // code is ever asked for.
    expect(body).toMatch(/if \(totp\) setFactorId\(totp\.id\)/);
  });

  it("recovers when detection misses the factor entirely", () => {
    // The property that stops this page getting stuck again. GoTrue refusing
    // for aal2 is itself proof a factor exists, so the refusal becomes the
    // prompt rather than a message about assurance levels shown to someone who
    // just wants their password back.
    expect(body).toMatch(/aal2/i);
    const refusal = body.indexOf("updateUser(");
    const recovery = body.search(/\/aal2\/i\.test/);
    expect(recovery, "no fallback on the refusal").toBeGreaterThan(-1);
    expect(recovery).toBeGreaterThan(refusal);
  });

  it("tells the person what went wrong rather than showing a raw error", () => {
    expect(body).toMatch(/Incorrect code/);
  });
});

describe("what must not change while fixing it", () => {
  it("keeps clearing the recovery tokens from the address bar", () => {
    // A recovery URL is a credential. This was deliberate and easy to lose in
    // a refactor.
    expect(body).toMatch(/window\.history\.replaceState\(null, "", window\.location\.pathname\)/);
  });

  it("keeps the twelve-character minimum", () => {
    expect(body).toMatch(/password\.length < 12/);
  });

  it("never prints a code or a token", () => {
    expect(body).not.toMatch(/console\.(log|info|warn|error)\s*\([^)]*(token|code)/i);
  });
});
