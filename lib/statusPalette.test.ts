import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { RESERVATION_STATUSES } from "@/lib/reservationStatus";
import {
  STATUS_SOLID, STATUS_SOFT, STATUS_LABELS,
  BOOKING_STATUSES, statusClass,
} from "@/app/admin/lib/statusColors";

/**
 * Keeps one status meaning one colour, everywhere.
 *
 * There were three palettes: this one, a near-copy inside the quotes screen,
 * and a third in the calendar. They had already drifted — the quotes copy was
 * missing `no_show` and `voided`, so a quote in either state rendered with no
 * colour at all, because the lookup returned undefined and the class string
 * came out empty.
 *
 * Copies drift silently. A test does not.
 */

function adminFiles(dir = "app/admin"): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...adminFiles(full));
    else if (entry.endsWith(".tsx") || entry.endsWith(".ts")) out.push(full);
  }
  return out;
}

describe("status palette", () => {
  it("covers every reservation status the database accepts", () => {
    // The lifecycle list is the source of truth; a status that can be saved
    // but not coloured is how the quotes screen ended up with blank badges.
    for (const s of RESERVATION_STATUSES) {
      expect(STATUS_SOLID, `solid is missing ${s}`).toHaveProperty(s);
      expect(STATUS_SOFT, `soft is missing ${s}`).toHaveProperty(s);
      expect(STATUS_LABELS, `label is missing ${s}`).toHaveProperty(s);
    }
  });

  it("uses the same hue for a status in both weights", () => {
    // The calendar draws solid bars and the tables tinted badges. The weight
    // may differ; the colour may not, or the screens stop agreeing.
    const hue = (cls: string) => cls.match(/bg-([a-z]+)-\d+/)?.[1];
    for (const s of BOOKING_STATUSES) {
      expect(hue(STATUS_SOLID[s]), `${s} differs between weights`).toBe(hue(STATUS_SOFT[s]));
    }
  });

  it("gives each booking status a distinguishable colour", () => {
    // Two statuses sharing a hue makes the legend useless. Grey is allowed
    // twice — returned and voided are both "finished, nothing to do".
    const hues = BOOKING_STATUSES.map((s) => STATUS_SOFT[s].match(/bg-([a-z]+)-\d+/)?.[1]);
    const counts = hues.reduce<Record<string, number>>((a, h) => ({ ...a, [h!]: (a[h!] ?? 0) + 1 }), {});
    const repeated = Object.entries(counts).filter(([h, n]) => n > 1 && h !== "gray");
    expect(repeated).toEqual([]);
  });

  it("never lets an unknown status render unstyled", () => {
    // The original bug: an unmapped status produced an empty class string and
    // a badge with no background at all.
    expect(statusClass("something_new")).not.toBe("");
    expect(statusClass("something_new")).toMatch(/bg-/);
  });

  it("is the only palette — no screen keeps a private copy", () => {
    const offenders = adminFiles()
      .filter((f) => !f.endsWith("lib/statusColors.ts"))
      .filter((f) => /const\s+STATUS_(COLORS|STYLES)\s*:/.test(readFileSync(f, "utf8")));
    expect(offenders, "these files declare their own status palette").toEqual([]);
  });

  it("keeps maintenance out of the booking list", () => {
    // It describes a vehicle, not a booking: a car can be in maintenance while
    // a reservation against it is confirmed. Mixing them into one list implies
    // they are alternatives, which they are not.
    expect(BOOKING_STATUSES).not.toContain("maintenance");
    expect(STATUS_LABELS).toHaveProperty("maintenance");
  });
});
