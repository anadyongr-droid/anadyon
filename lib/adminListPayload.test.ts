import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readListPayload, readListPayloads } from "./adminListPayload";

describe("a list response is only usable if it is a list", () => {
  it("accepts a 200 carrying an array", () => {
    expect(readListPayload({ ok: true, status: 200 }, [{ id: "a" }])).toEqual({
      rows: [{ id: "a" }],
      error: null,
    });
  });

  it("accepts an empty array, which is a real answer", () => {
    // The whole point of W23 is to tell this apart from a failure, so an empty
    // list must stay a success.
    expect(readListPayload({ ok: true, status: 200 }, [])).toEqual({ rows: [], error: null });
  });

  it("rejects a non-2xx and names what the server did", () => {
    const r = readListPayload({ ok: false, status: 500 }, { error: "boom" });
    expect(r.rows).toBeNull();
    expect(r.error).toBe("the server answered 500");
  });

  it("rejects a 200 whose body is an error object", () => {
    // This is the one that renders as "nothing here": a 200 with a JSON error
    // body, assigned straight into a rows state.
    const r = readListPayload({ ok: true, status: 200 }, { error: "not allowed" });
    expect(r.rows).toBeNull();
    expect(r.error).toBe("the server did not return a list");
  });

  it("rejects null, a string and a number", () => {
    for (const body of [null, undefined, "", "[]", 0, 42]) {
      expect(readListPayload({ ok: true, status: 200 }, body).error).toBeTruthy();
    }
  });
});

describe("a screen loading two lists is as loaded as its worst response", () => {
  const ok = { ok: true, status: 200 };

  it("passes when both are lists", () => {
    expect(
      readListPayloads([
        { name: "Reservations", res: ok, body: [] },
        { name: "Vehicles", res: ok, body: [{ id: "v" }] },
      ])
    ).toEqual({ error: null });
  });

  it("fails on the first unusable response and says which call it was", () => {
    // Showing reservations against an empty vehicle list would misreport every
    // row's vehicle as missing, so one failure fails the load.
    const r = readListPayloads([
      { name: "Reservations", res: ok, body: [] },
      { name: "Vehicles", res: { ok: false, status: 503 }, body: null },
    ]);
    expect(r.error).toBe("Vehicles: the server answered 503");
  });

  it("reports the earlier failure when both fail", () => {
    const r = readListPayloads([
      { name: "Reservations", res: { ok: false, status: 500 }, body: null },
      { name: "Vehicles", res: { ok: false, status: 503 }, body: null },
    ]);
    expect(r.error).toContain("Reservations");
  });
});

/**
 * The module is only useful if the screen that had the defect actually uses it.
 * Vitest runs in `node` here with no DOM, so the wiring is asserted against the
 * source — the same approach `lib/rateImportLog.test.ts` takes.
 */
describe("the reservations screen uses it, and distinguishes the two cases", () => {
  const raw = readFileSync(
    new URL("../app/admin/reservations/page.tsx", import.meta.url).pathname,
    "utf8"
  );
  // Imports stripped, so the assertion is about use rather than presence — see
  // the note in lib/outstandingDeposits.test.ts for why that distinction bit.
  const page = raw.replace(/^import[\s\S]*?from\s+"[^"]*";$/gm, "");

  it("reads its responses through this module", () => {
    expect(page).toMatch(/readListPayloads\(/);
  });

  it("holds an error state and renders it", () => {
    expect(page).toContain("loadError");
    // The stated error has to reach the screen, not just the state.
    expect(page).toMatch(/loadError\s*\?/);
  });

  it("still says 'No reservations found.' for a genuinely empty list", () => {
    // The fix must not trade one indistinguishable case for the other: an empty
    // day is a real answer and still reads as one.
    expect(page).toContain("No reservations found.");
  });

  it("keeps a failed background poll quiet", () => {
    // Not blanking a populated table over one dropped background request was
    // the sound half of the original comment, and it stays.
    expect(page).toMatch(/showSpinner/);
  });
});
