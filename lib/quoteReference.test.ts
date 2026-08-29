import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The quote reference is most of what stands between a stranger and somebody
 * else's booking: /quote/[ref] is deliberately unauthenticated, gated by the
 * reference plus a surname — and a surname is a second check, not a second
 * secret.
 *
 * It was generated with Math.random(), which is not a cryptographic generator:
 * its output is predictable from prior values, so an attacker who requests a
 * few quotes of their own can work out other people's. Length is no defence
 * against that, which is why these tests assert the SOURCE of the randomness
 * and not the size of the space. Counting characters is exactly the answer that
 * let this stand.
 */
const route = readFileSync(new URL("../app/api/quote/route.ts", import.meta.url), "utf8");
const generator = route.match(/function generateRef\(\)[\s\S]*?\n}/)?.[0] ?? "";

describe("how the quote reference is generated", () => {
  it("uses a cryptographic generator", () => {
    expect(generator, "generateRef not found").not.toBe("");
    expect(generator).toContain("randomBytes");
  });

  it("calls Math.random nowhere in the route", () => {
    // Asserted across the whole file rather than the function: the point is
    // that no security-bearing value in this path comes from it.
    //
    // Matched on the CALL, not the words — the comment above generateRef names
    // Math.random deliberately, to explain why it is not used, and a test that
    // forbade the name would delete the explanation to go green.
    expect(route).not.toContain("Math.random(");
  });

  it("imports randomBytes from node:crypto", () => {
    expect(route).toMatch(/import \{[^}]*randomBytes[^}]*\} from "node:crypto"/);
  });
});

describe("the reference alphabet", () => {
  const alphabet = route.match(/const REF_CHARS = "([^"]+)"/)?.[1] ?? "";

  it("is 32 characters, which divides 256", () => {
    // Masking a byte to five bits is uniform only because of this. A modulo by
    // a non-power-of-two would bias the early characters and quietly shrink the
    // space — a weakening nobody would notice by reading a reference.
    expect(alphabet).toHaveLength(32);
    expect(256 % alphabet.length).toBe(0);
  });

  it("omits the characters that are misread aloud or in print", () => {
    // I, O, 0 and 1. The reference is read over the phone and typed off an
    // email; this is why it is 32 symbols rather than 36 in the first place.
    for (const c of ["I", "O", "0", "1"]) expect(alphabet).not.toContain(c);
  });

  it("masks to five bits rather than taking a modulo", () => {
    expect(generator).toMatch(/&\s*31/);
  });
});

describe("a reference collision", () => {
  const block = route.match(/const REF_ATTEMPTS[\s\S]*?\n  \}\n/)?.[0] ?? "";

  it("is retried rather than shown to the customer as a failure", () => {
    // quotes.ref is UNIQUE, so a duplicate raised 23505 and the booking failed
    // with "We could not save your request" — a customer turned away by a coin
    // landing twice.
    expect(block, "retry loop not found").not.toBe("");
    expect(block).toContain("generateRef()");
    expect(block).toContain("quotePayload.ref");
  });

  it("regenerates the reservation note too, not only the quote", () => {
    // The note carries the reference. Retrying without rewriting it would file
    // the reservation under a reference that belongs to nothing.
    expect(block).toContain("reservationPayload.notes");
  });

  it("retries only on the reference constraint, never on the idempotency key", () => {
    // 23505 from the idempotency key is the replay protection WORKING. Retrying
    // that would defeat the guard rather than recover from it, and would let a
    // double-submitted booking through.
    expect(block).toContain("quotes_ref_key");
    expect(block).toContain("23505");
  });

  it("is bounded", () => {
    // An unbounded retry against a genuine constraint problem is an outage.
    expect(block).toMatch(/attempt <= REF_ATTEMPTS/);
    expect(route).toMatch(/const REF_ATTEMPTS = \d+;/);
  });
});
