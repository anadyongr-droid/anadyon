import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The wiring that carries open damage out of the database and onto a screen.
 *
 * The arithmetic is covered by openDamage.test.ts. What is checked here is that
 * the three call sites are actually connected — and, more importantly, that the
 * money stays behind.
 *
 * `vehicle_damages` holds `repair_cost` and `charged_to_customer` in the same
 * row as the severity. The per-vehicle ledger guards those with an explicit
 * administrator check, because proxy.ts admits staff to "/api/admin/vehicles"
 * by prefix and every route beneath it is in staff reach by default. The
 * fleet-wide endpoint is deliberately open to staff — they are the ones handing
 * over the car — which means its `select` is the only thing keeping the
 * financial columns out of a staff response. A later `select("*")` for
 * convenience would silently undo that, so it is pinned here.
 */
const root = new URL("../", import.meta.url).pathname;
const read = (p: string) => readFileSync(join(root, p), "utf8");

/**
 * The column list of every `.select(...)` in a file.
 *
 * Matching the raw source for "repair_cost" cannot tell a query from a comment,
 * and the first version of this check failed on the endpoint's own note saying
 * the column is deliberately excluded. What matters is what is *asked for*, so
 * that is what is read.
 */
function selectedColumns(src: string): string[] {
  return [...src.matchAll(/\.select\(\s*(["'`])([\s\S]*?)\1/g)].map((m) => m[2]);
}

const endpoint = read("app/api/admin/vehicles/damages/route.ts");
const briefing = read("app/api/cron/morning-briefing/route.ts");
const fleet = read("app/admin/fleet/page.tsx");

describe("the fleet-wide damage endpoint", () => {
  it("asks only for unrepaired rows, in SQL", () => {
    // Migration 011 built `vehicle_damages_open_idx ... WHERE repaired_on IS
    // NULL` for this. Filtering in JavaScript would read every damage ever
    // recorded and leave the index unused.
    expect(endpoint).toMatch(/\.is\("repaired_on", null\)/);
  });

  it("never selects a financial column", () => {
    const cols = selectedColumns(endpoint);
    expect(cols.length, "no select found — the check would pass vacuously").toBeGreaterThan(0);
    for (const c of cols) {
      expect(c, "select(*) would carry repair_cost to a staff session").not.toContain("*");
      expect(c).not.toMatch(/repair_cost|charged_to_customer/);
    }
  });

  it("selects the fields the summary needs and no others", () => {
    expect(endpoint).toMatch(/\.select\("vehicle_id, severity, reported_on, description"\)/);
  });
});

describe("the morning briefing", () => {
  it("reads open damage", () => {
    expect(briefing).toMatch(/from\("vehicle_damages"\)/);
    expect(briefing).toMatch(/\.is\("repaired_on", null\)/);
  });

  it("carries no repair cost into a Telegram group", () => {
    const damageSelects = selectedColumns(briefing).filter((c) => c.includes("severity"));
    expect(damageSelects.length, "the damage query was not found").toBeGreaterThan(0);
    for (const c of damageSelects) expect(c).not.toMatch(/repair_cost|charged_to_customer/);
  });

  it("renders a section rather than only computing one", () => {
    // The failure this whole change exists to prevent: the data is fetched,
    // summarised, and then nothing is done with it.
    expect(briefing).toMatch(/if \(damaged\.length\)/);
    expect(briefing).toContain("Ζημιές σε εκκρεμότητα");
  });

  it("puts damage below the escalated blocks, not above", () => {
    // A car out of the fleet for four days needs action today; damage needs
    // remembering. The order encodes the difference in urgency.
    const blocks = briefing.indexOf("ΟΧΗΜΑΤΑ ΕΚΤΟΣ ΣΤΟΛΟΥ");
    const damage = briefing.indexOf("Ζημιές σε εκκρεμότητα");
    expect(blocks).toBeGreaterThan(-1);
    expect(damage).toBeGreaterThan(blocks);
  });
});

describe("the fleet list", () => {
  it("fetches damage alongside the other two reads, not after them", () => {
    // Serial awaits would paint a row as fine before its damage line arrives —
    // the same lie the out-of-fleet line was added to stop.
    expect(fleet).toMatch(/Promise\.all\(\[[\s\S]{0,300}?vehicles\/damages/);
  });

  it("actually renders the label", () => {
    expect(fleet).toMatch(/damageLabel\(damage\[v\.id\]\)/);
  });

  it("does not colour damage as a bar on renting", () => {
    // fleetStatus.ts keeps red for the two statutory expiries that void
    // insurance cover. Damage is a fact to weigh, so it must not borrow the
    // colour that means "this vehicle must not leave the yard".
    const line = fleet.slice(fleet.indexOf("damageLabel(damage[v.id])") - 400, fleet.indexOf("damageLabel(damage[v.id])"));
    expect(line).toMatch(/text-amber-700/);
    expect(line).not.toMatch(/text-red-600/);
  });
});
