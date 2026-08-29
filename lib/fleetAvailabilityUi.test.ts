import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * What the fleet screens may and may not say about a vehicle that is out.
 *
 * Asserted against the source, like lib/emailReplyPolicy.test.ts, because these
 * are rules about what a screen offers rather than about what a function
 * returns — and every one of them was a real failure in this system: a table
 * that drew a booking on the wrong day, a status that claimed a car was
 * available, an alert that looked like an ordinary message.
 *
 * The common rule: **never offer an action the write path will refuse.**
 * Offering it and then refusing teaches staff the screen cannot be trusted,
 * and a screen nobody trusts gets worked around.
 */
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const calendar = read("app/admin/calendar/page.tsx");
const fleet = read("app/admin/fleet/page.tsx");
const modal = read("app/admin/components/VehicleModal.tsx");
const today = read("app/admin/today/page.tsx");

describe("the calendar", () => {
  it("shades a blocked day rather than leaving it empty", () => {
    // Empty space is exactly where a dispatcher decides to put a booking.
    expect(calendar).toContain("outOfFleet[vehicle.id]");
    expect(calendar).toContain("isOut ? \"bg-orange-100\" : \"\"");
  });

  it("does not offer a new booking on a blocked day", () => {
    expect(calendar).toMatch(/!isMaint && !isOut && setModal/);
    expect(calendar).toMatch(/\{!isMaint && !isOut && \(/);
  });

  it("shades from the day the vehicle went out, with no end date", () => {
    // An open block has no far end: out for October as much as for tomorrow.
    expect(calendar).toContain("cell.date >= out.starts_on");
    expect(calendar, "an upper bound would let the estimate free it").not.toContain("cell.date <= out.expected_return");
  });
});

describe("the fleet screen", () => {
  it("says a blocked vehicle is out, rather than showing its status", () => {
    // A row reading "available" for a car on a ramp is how staff learn to
    // disbelieve the refusal they later get.
    expect(fleet).toContain("out of fleet");
    expect(fleet).toMatch(/outOfFleet\[v\.id\] \? \(/);
  });

  it("does not offer the status dropdown for a vehicle that is out", () => {
    // Status cannot end a block. A control that looks as though it might is a
    // lie about what the system will do.
    const cell = fleet.match(/\{outOfFleet\[v\.id\] \? \([\s\S]*?\n {24}\)\}/)?.[0] ?? "";
    expect(cell, "status cell not found").not.toBe("");
    const beforeElse = cell.split(") : (")[0];
    expect(beforeElse).not.toContain("<select");
  });
});

describe("the vehicle dialog", () => {
  it("labels the expected return as an estimate", () => {
    // The whole design rests on nobody reading it as a release date.
    expect(modal).toContain("Expected back (estimate)");
    expect(modal).toMatch(/never returns the vehicle to the fleet on its own/);
  });

  it("offers deletion only for a block that has not started", () => {
    // A vehicle that was actually out is released, not erased — deleting is how
    // a hard stop gets worked around, and the record goes with it.
    expect(modal).toMatch(/b\.starts_on > today\(\) && \(/);
  });

  it("shows the bookings a new block does not cancel", () => {
    expect(modal).toContain("covered_reservations");
    expect(modal).toMatch(/does not cancel them/);
  });
});

describe("the today screen", () => {
  it("releases through PATCH, never by deleting the block", () => {
    const block = today.match(/const release = useCallback[\s\S]*?\}, \[load\]\);/)?.[0] ?? "";
    expect(block, "release action not found").not.toBe("");
    expect(block).toContain('method: "PATCH"');
    expect(block).not.toContain("DELETE");
  });

  it("reloads after a release rather than patching the list in place", () => {
    // Releasing changes what is bookable. A screen showing a stale answer about
    // availability is the failure this whole area is about.
    const block = today.match(/const release = useCallback[\s\S]*?\}, \[load\]\);/)?.[0] ?? "";
    expect(block).toContain("await load()");
  });

  it("shows how long is left on the estimate beside how long it has been out", () => {
    expect(today).toContain("expected back in");
    expect(today).toContain("overdue by");
  });
});
