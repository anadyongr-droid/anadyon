import { describe, expect, it } from "vitest";
import { damageLabel, summariseOpenDamage, type OpenDamageRow } from "./openDamage";

/**
 * Open damage was recorded faithfully and surfaced nowhere.
 *
 * `vehicle_damages` carries severity, repair cost, `repaired_on` and whether the
 * cost was recharged, and 011_fleet_and_customer_records.sql even created a
 * partial index for exactly this query — `vehicle_damages_open_idx ... WHERE
 * repaired_on IS NULL`. Nothing ever ran it. The only place an open-damage count
 * rendered was the Damages tab inside one vehicle's modal, so answering "which
 * cars have unrepaired damage?" meant opening all twenty-nine in turn.
 *
 * Same shape as the licence gate before it: the data was right, and no screen
 * asked it a question.
 */
const at = (iso: string) => new Date(`${iso}T09:00:00Z`);

const row = (over: Partial<OpenDamageRow> & { vehicle_id: string }): OpenDamageRow => ({
  severity: "minor",
  reported_on: "2026-08-01",
  description: "scuff",
  ...over,
});

describe("summarising open damage", () => {
  it("groups by vehicle and counts each severity", () => {
    const out = summariseOpenDamage(
      [
        row({ vehicle_id: "a", severity: "major" }),
        row({ vehicle_id: "a", severity: "minor" }),
        row({ vehicle_id: "b", severity: "moderate" }),
      ],
      at("2026-08-10")
    );
    expect(out).toHaveLength(2);
    const a = out.find((v) => v.vehicle_id === "a")!;
    expect(a.total).toBe(2);
    expect(a.bySeverity).toEqual({ minor: 1, moderate: 0, major: 1 });
  });

  it("reports the worst severity present, not the most recent", () => {
    // A minor scuff reported yesterday must not mask a major reported in June.
    const out = summariseOpenDamage(
      [
        row({ vehicle_id: "a", severity: "major", reported_on: "2026-06-01" }),
        row({ vehicle_id: "a", severity: "minor", reported_on: "2026-08-09" }),
      ],
      at("2026-08-10")
    );
    expect(out[0].worst).toBe("major");
  });

  it("ages from the oldest unrepaired report", () => {
    const out = summariseOpenDamage(
      [
        row({ vehicle_id: "a", reported_on: "2026-08-01" }),
        row({ vehicle_id: "a", reported_on: "2026-08-08" }),
      ],
      at("2026-08-10")
    );
    expect(out[0].oldestReportedOn).toBe("2026-08-01");
    expect(out[0].daysOpen).toBe(9);
  });

  it("puts the longest-standing damage first", () => {
    // The briefing reads top-down, so the car nobody has dealt with leads.
    const out = summariseOpenDamage(
      [
        row({ vehicle_id: "fresh", reported_on: "2026-08-09" }),
        row({ vehicle_id: "stale", reported_on: "2026-05-02" }),
      ],
      at("2026-08-10")
    );
    expect(out.map((v) => v.vehicle_id)).toEqual(["stale", "fresh"]);
  });

  it("counts a report made today as zero days open, not one", () => {
    const out = summariseOpenDamage([row({ vehicle_id: "a", reported_on: "2026-08-10" })], at("2026-08-10"));
    expect(out[0].daysOpen).toBe(0);
  });

  it("returns nothing when every damage is repaired", () => {
    // Repaired rows are filtered in the query, so an empty input is the normal
    // healthy case and must not produce a phantom row.
    expect(summariseOpenDamage([], at("2026-08-10"))).toEqual([]);
  });
});

describe("the label a human reads", () => {
  it("names the severity when there is only one", () => {
    const [v] = summariseOpenDamage([row({ vehicle_id: "a", severity: "major" })], at("2026-08-02"));
    expect(damageLabel(v)).toBe("1 open damage — major");
  });

  it("leads with the worst when there are several", () => {
    const [v] = summariseOpenDamage(
      [
        row({ vehicle_id: "a", severity: "major" }),
        row({ vehicle_id: "a", severity: "minor" }),
        row({ vehicle_id: "a", severity: "minor" }),
      ],
      at("2026-08-02")
    );
    expect(damageLabel(v)).toBe("3 open damages — worst major");
  });

  it("says nothing about money", () => {
    // repair_cost is deliberately not carried this far: staff need to know a
    // car is damaged before handing it over, and the cost of putting it right
    // is a different question with a different audience.
    const [v] = summariseOpenDamage([row({ vehicle_id: "a", severity: "moderate" })], at("2026-08-02"));
    expect(damageLabel(v)).not.toMatch(/€|\d+\.\d{2}|cost/i);
  });
});
