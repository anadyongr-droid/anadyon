import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * A filing stranded by a slow socket, which is worse than a failed one.
 *
 * **Found by the review bot on #190**, against the W27 change that bounded the
 * AADE calls. `boundedFetch` resolves when the response *headers* arrive, and the
 * budget's signal stays attached to the body stream — so AADE answering inside
 * the budget and then stalling makes `.text()` reject.
 *
 * With that read outside the recovery block, the rejection escapes the route
 * having already taken the `claim_dcl_submission` claim, which sets
 * `dcl_status = 'submitting'`. `001_baseline.sql` refuses to re-claim anything
 * already `submitting`:
 *
 *     IF v_status IN ('submitted','submitting') THEN RETURN false;
 *
 * So the reservation is **permanently unretryable** — every later attempt gets a
 * 409 and no filing ever happens. The same shape exists on the invoice route via
 * `claim_invoice_submission` and `issuing`.
 *
 * The shape pre-dated the timeout (a connection reset mid-body did the same), but
 * bounding the call turned a rare network accident into something the budget
 * itself triggers on any slow filing.
 *
 * Asserted against the source because Vitest runs here in `node` and these are
 * route modules with a Supabase client at import time. What matters is structural
 * and is visible structurally: the body read must sit inside the block that
 * writes the re-claimable `error` status.
 */
describe("a filing whose body stalls is left re-claimable, not stranded", () => {
  const ROUTES = [
    { file: "app/api/admin/aade/submit/route.ts", status: "dcl_status", claim: "claim_dcl_submission" },
    { file: "app/api/admin/invoices/submit/route.ts", status: "invoice_status", claim: "claim_invoice_submission" },
  ];

  for (const route of ROUTES) {
    describe(route.file, () => {
      const src = readFileSync(new URL(`../${route.file}`, import.meta.url).pathname, "utf8");

      it("takes the claim that makes stranding possible", () => {
        // If this stops being true the hazard is gone and so is this test's
        // reason to exist — it should then be deleted, not weakened.
        expect(src).toContain(route.claim);
      });

      it("reads the body inside the try, not after it", () => {
        const tryAt = src.indexOf("  try {\n    aadeRes = await boundedFetch(");
        expect(tryAt, "the bounded filing call").toBeGreaterThan(-1);

        const catchAt = src.indexOf("  } catch (err) {", tryAt);
        const readAt = src.indexOf("await aadeRes.text()", tryAt);

        expect(readAt, "the body read").toBeGreaterThan(-1);
        expect(readAt, "body read must precede the catch that records the failure")
          .toBeLessThan(catchAt);
      });

      it("writes the re-claimable error status on that path", () => {
        const tryAt = src.indexOf("  try {\n    aadeRes = await boundedFetch(");
        const catchAt = src.indexOf("  } catch (err) {", tryAt);
        const block = src.slice(catchAt, catchAt + 400);
        expect(block).toContain(`${route.status}: "error"`);
      });

      it("declares the body outside the block so the rest of the route still sees it", () => {
        expect(src).toMatch(/let responseText: string;/);
      });
    });
  }

  it("the claim really does refuse a second attempt, which is why this matters", () => {
    // The consequence is in the migration, not the route, so it is asserted
    // there. A claim that allowed retries would make a stranded row recoverable
    // and this whole concern a cosmetic one.
    const baseline = readFileSync(
      new URL("../supabase/migrations/001_baseline.sql", import.meta.url).pathname,
      "utf8",
    );
    expect(baseline).toMatch(/IF v_status IN \('submitted','submitting'\) THEN\s*\n?\s*RETURN false;/);
    expect(baseline).toMatch(/IF v_status IN \('issued','issuing'\) THEN\s*\n?\s*RETURN false;/);
  });
});
