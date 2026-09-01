import { describe, expect, it } from "vitest";
import { handoverErrorMessage, handoverErrorStatus } from "@/lib/handoverErrors";

/**
 * What the counter's database refusals become on the way to a tablet.
 *
 * Two properties matter and they pull against each other: a deliberate refusal
 * must reach the person holding the tablet in the words the database chose,
 * because those words say what to fix; and anything *not* deliberate must not,
 * because a Postgres error can carry a constraint name, a column list or a
 * fragment of a query, none of which belongs on a screen at a rental counter.
 */

describe("status", () => {
  it("maps each code the counter raises to what it means to a caller", () => {
    expect(handoverErrorStatus({ code: "AN401" })).toBe(401);
    expect(handoverErrorStatus({ code: "AN403" })).toBe(403);
    expect(handoverErrorStatus({ code: "AN404" })).toBe(404);
    expect(handoverErrorStatus({ code: "AN409" })).toBe(409);
    expect(handoverErrorStatus({ code: "AN422" })).toBe(422);
  });

  it("treats a duplicate handover as a conflict, not a server fault", () => {
    // The partial unique index refusing a second live handover for a
    // reservation and direction. The caller can act on it; a 500 says they
    // cannot.
    expect(handoverErrorStatus({ code: "23505" })).toBe(409);
  });

  it("treats a malformed id and a broken reference as the caller's problem", () => {
    expect(handoverErrorStatus({ code: "22P02" })).toBe(400);
    expect(handoverErrorStatus({ code: "23503" })).toBe(400);
    expect(handoverErrorStatus({ code: "23514" })).toBe(400);
  });

  it("falls back to 500 for anything it does not recognise", () => {
    expect(handoverErrorStatus({ code: "XX000" })).toBe(500);
    expect(handoverErrorStatus({})).toBe(500);
    expect(handoverErrorStatus(null)).toBe(500);
    expect(handoverErrorStatus(undefined)).toBe(500);
  });
});

describe("message", () => {
  it("passes a deliberate refusal through, minus the prefix naming the function", () => {
    // The list is the whole point of collecting the reasons: staff read all
    // three and fix all three, rather than discovering them one submit at a time.
    expect(handoverErrorMessage({
      code: "AN422",
      message: "check-out refused: vehicle is marked maintenance; the rental agreement is not recorded as signed",
    })).toBe("vehicle is marked maintenance; the rental agreement is not recorded as signed");
  });

  it("strips the check-in and correction prefixes too", () => {
    expect(handoverErrorMessage({ code: "AN422", message: "check-in refused: cleanliness was not recorded" }))
      .toBe("cleanliness was not recorded");
    expect(handoverErrorMessage({ code: "AN422", message: "correction refused: cleanliness was not recorded" }))
      .toBe("cleanliness was not recorded");
  });

  it("keeps a refusal that names no function", () => {
    expect(handoverErrorMessage({ code: "AN409", message: "handover was voided and cannot be completed" }))
      .toBe("handover was voided and cannot be completed");
  });

  it("explains a duplicate handover in words rather than in a constraint name", () => {
    const message = handoverErrorMessage({
      code: "23505",
      message: 'duplicate key value violates unique constraint "rental_handovers_one_live_per_direction"',
    });
    expect(message).toBe("There is already a live handover for this rental and direction.");
    expect(message).not.toMatch(/constraint|duplicate key/i);
  });

  it("never passes an unrecognised database error to the screen", () => {
    // The property that matters: whatever Postgres said, a caller sees a
    // sentence rather than internals. Asserted on the shape of the output, not
    // on this one input, because the risk is the input nobody thought of.
    for (const message of [
      'null value in column "completed_by" of relation "rental_handovers" violates not-null constraint',
      "could not serialize access due to concurrent update",
      "permission denied for table users",
    ]) {
      const out = handoverErrorMessage({ code: "XX000", message });
      expect(out).toBe("Something went wrong saving this. Nothing was changed.");
      expect(out).not.toContain("relation");
      expect(out).not.toContain("permission denied");
    }
  });

  it("does not pass a message through on a recognised code with no message", () => {
    expect(handoverErrorMessage({ code: "AN422", message: "" }))
      .toBe("Something went wrong saving this. Nothing was changed.");
  });
});
