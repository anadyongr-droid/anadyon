import { describe, expect, it } from "vitest";
import {
  blockNote,
  releaseNeedsAdmin,
  severityBars,
  shouldOpenBlock,
} from "./damageBlock";

/**
 * Recording major damage now takes the vehicle off the road at once, and only
 * an administrator puts it back. Tasos's decision, 30 August.
 *
 * The risk he was weighed against — a car marked `major` in haste becoming
 * unbookable in August — is smaller than it first looks: `refuseNonAdmin` gates
 * the ledger POST, so only an administrator can record a damage at all. The
 * person who can create the bar is the person who can lift it.
 */
describe("which damage bars a vehicle", () => {
  it("bars on major", () => {
    expect(severityBars("major")).toBe(true);
  });

  it("does not bar on minor or moderate", () => {
    // Barring on everything would train people to log damage as `minor` to
    // dodge the consequence, and the record would rot.
    expect(severityBars("minor")).toBe(false);
    expect(severityBars("moderate")).toBe(false);
  });

  it("does not bar on a missing or unknown severity", () => {
    for (const s of [null, undefined, "", "catastrophic"]) {
      expect(severityBars(s), `${s} barred`).toBe(false);
    }
  });
});

describe("deciding whether to open a block", () => {
  it("opens one for unrepaired major damage", () => {
    expect(shouldOpenBlock({ severity: "major", description: "wing mirror off" })).toBe(true);
  });

  it("does not open one for damage already repaired", () => {
    // Back-filling a historic repair so the ledger is complete must not take a
    // perfectly good car off the road. This is the guard most likely to be
    // dropped by someone simplifying the condition.
    expect(shouldOpenBlock({ severity: "major", repaired_on: "2026-07-20" })).toBe(false);
  });

  it("does not open one for lesser severities", () => {
    expect(shouldOpenBlock({ severity: "moderate" })).toBe(false);
    expect(shouldOpenBlock({ severity: "minor" })).toBe(false);
  });
});

describe("the note left on the block", () => {
  it("carries the description so the fleet row says why", () => {
    expect(blockNote({ severity: "major", description: "gearbox failure" }))
      .toBe("Major damage: gearbox failure");
  });

  it("survives an empty description", () => {
    expect(blockNote({ severity: "major", description: "" })).toBe("Major damage recorded");
    expect(blockNote({ severity: "major" })).toBe("Major damage recorded");
  });

  it("truncates rather than overflowing the row", () => {
    const note = blockNote({ severity: "major", description: "x".repeat(400) });
    expect(note.length).toBeLessThanOrEqual(135);
    expect(note.endsWith("…")).toBe(true);
  });
});

describe("who may release", () => {
  it("a damage block needs an administrator", () => {
    expect(releaseNeedsAdmin("damage")).toBe(true);
  });

  it("every other reason keeps the staff-releasable behaviour", () => {
    // §7.4 deliberately let staff release a block: "a release that only an
    // admin can perform is a release that waits." That reasoning still holds
    // for a van back from the mechanic. It does not hold for deciding a
    // vehicle with unrepaired major damage is fit to hand to a customer.
    for (const r of ["maintenance", "statutory", "hold", "other", null, undefined]) {
      expect(releaseNeedsAdmin(r), `${r} was made admin-only`).toBe(false);
    }
  });
});
