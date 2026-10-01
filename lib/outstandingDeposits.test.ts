import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEPOSIT_OWED_STATUSES,
  daysToPickup,
  depositUrgency,
  describeOutstandingDeposit,
  isDepositOutstanding,
  summariseOutstandingDeposits,
  waitingDays,
  type DepositRow,
} from "./outstandingDeposits";

const NOW = new Date("2026-10-01T09:00:00Z");

function row(over: Partial<DepositRow> = {}): DepositRow {
  return {
    id: "r1",
    status: "pending",
    deposit: 120,
    deposit_paid_at: null,
    pickup_date: "2026-10-20",
    created_at: "2026-09-26T10:00:00Z",
    ...over,
  };
}

describe("what counts as an outstanding deposit", () => {
  it("a live booking with a deposit and no payment", () => {
    expect(isDepositOutstanding(row())).toBe(true);
  });

  it("not once a payment has been recorded", () => {
    expect(isDepositOutstanding(row({ deposit_paid_at: "2026-09-27T10:00:00Z" }))).toBe(false);
  });

  it("not when there is no deposit to owe", () => {
    // Plenty of rows legitimately carry none; treating those as work would make
    // the list useless.
    for (const deposit of [0, null, undefined, "0", "", "abc"]) {
      expect(isDepositOutstanding(row({ deposit: deposit as never }))).toBe(false);
    }
  });

  it("includes confirmed, which is the state a missed reconciliation produces", () => {
    // Confirmation normally follows payment. A confirmed booking with no
    // deposit_paid_at is exactly the case this exists to catch, so excluding it
    // would hide the bug.
    expect(isDepositOutstanding(row({ status: "confirmed" }))).toBe(true);
  });

  it("includes active, where the vehicle is already out", () => {
    expect(isDepositOutstanding(row({ status: "active" }))).toBe(true);
  });

  it("excludes finished and cancelled rentals", () => {
    // The rental is over or off, so an unpaid deposit is an accounting question
    // rather than outstanding work — and listing it would bury the live ones.
    for (const status of ["returned", "cancelled", "no_show", "voided"]) {
      expect(isDepositOutstanding(row({ status }))).toBe(false);
    }
  });

  it("names the statuses it treats as owing", () => {
    expect([...DEPOSIT_OWED_STATUSES].sort()).toEqual(["active", "confirmed", "pending"]);
  });

  it("reads a numeric string deposit, as the database may return", () => {
    expect(isDepositOutstanding(row({ deposit: "150.50" }))).toBe(true);
  });
});

describe("the ageing §5.3 asks for", () => {
  it("counts whole days since the booking was taken", () => {
    expect(waitingDays(row({ created_at: "2026-09-26T10:00:00Z" }), NOW)).toBe(5);
  });

  it("reports today as zero, not as one", () => {
    expect(waitingDays(row({ created_at: "2026-10-01T06:00:00Z" }), NOW)).toBe(0);
  });

  it("returns null rather than zero when there is nothing to count from", () => {
    // Unknown and "arrived today" are different facts, and the wording depends
    // on which one it is.
    expect(waitingDays(row({ created_at: null }), NOW)).toBeNull();
    expect(waitingDays(row({ created_at: "not a date" }), NOW)).toBeNull();
  });

  it("never goes negative on a future creation time", () => {
    expect(waitingDays(row({ created_at: "2026-10-05T10:00:00Z" }), NOW)).toBe(0);
  });
});

describe("urgency, because age alone does not rank these", () => {
  it("treats a vehicle already out as money at risk now", () => {
    expect(depositUrgency(row({ status: "active" }), NOW)).toBe("collected");
  });

  it("treats a passed pick-up date the same way", () => {
    expect(depositUrgency(row({ pickup_date: "2026-09-30" }), NOW)).toBe("collected");
  });

  it("flags a pick-up within two days as imminent", () => {
    expect(depositUrgency(row({ pickup_date: "2026-10-01" }), NOW)).toBe("imminent");
    expect(depositUrgency(row({ pickup_date: "2026-10-03" }), NOW)).toBe("imminent");
  });

  it("leaves a distant booking as waiting", () => {
    expect(depositUrgency(row({ pickup_date: "2026-10-20" }), NOW)).toBe("waiting");
  });

  it("counts the days to pick-up either side of today", () => {
    expect(daysToPickup(row({ pickup_date: "2026-10-04" }), NOW)).toBe(3);
    expect(daysToPickup(row({ pickup_date: "2026-10-01" }), NOW)).toBe(0);
    expect(daysToPickup(row({ pickup_date: "2026-09-28" }), NOW)).toBe(-3);
    expect(daysToPickup(row({ pickup_date: null }), NOW)).toBeNull();
  });

  it("ranks an older but distant deposit below a newer imminent one", () => {
    // The property that matters: age is not the ranking.
    const old = row({ created_at: "2026-09-01T10:00:00Z", pickup_date: "2027-05-01" });
    const fresh = row({ created_at: "2026-09-30T10:00:00Z", pickup_date: "2026-10-02" });
    expect(waitingDays(old, NOW)!).toBeGreaterThan(waitingDays(fresh, NOW)!);
    expect(depositUrgency(old, NOW)).toBe("waiting");
    expect(depositUrgency(fresh, NOW)).toBe("imminent");
  });
});

describe("what the operator is told", () => {
  it("says the amount, the age and why it matters", () => {
    const text = describeOutstandingDeposit(row(), NOW)!;
    expect(text).toContain("€120.00");
    expect(text).toContain("for 5 days");
    expect(text).toContain("No payment has been matched");
  });

  it("says plainly when the vehicle is already out", () => {
    const text = describeOutstandingDeposit(row({ status: "active" }), NOW)!;
    expect(text).toContain("money at risk now");
  });

  it("names the bank, because that is where the answer is", () => {
    // §5.3's "not sit unnoticed until someone checks the bank" cuts both ways:
    // an operator told only "unpaid" does not know what to do next.
    expect(describeOutstandingDeposit(row(), NOW)).toContain("checks the bank");
  });

  it("says 'since today' rather than 'for 0 days'", () => {
    expect(describeOutstandingDeposit(row({ created_at: "2026-10-01T06:00:00Z" }), NOW))
      .toContain("since today");
  });

  it("admits an unknown age instead of implying it is new", () => {
    expect(describeOutstandingDeposit(row({ created_at: null }), NOW))
      .toContain("for an unknown time");
  });

  it("says nothing at all when nothing is owed", () => {
    expect(describeOutstandingDeposit(row({ deposit_paid_at: "2026-09-27T10:00:00Z" }), NOW))
      .toBeNull();
  });
});

describe("the summary read before deciding whether to open the bank", () => {
  it("counts, totals, and reports the worst case alongside", () => {
    const s = summariseOutstandingDeposits(
      [
        row({ id: "a", deposit: 100, created_at: "2026-09-21T10:00:00Z", pickup_date: "2026-11-01" }),
        row({ id: "b", deposit: 50.5, status: "active" }),
        row({ id: "c", deposit: 200, pickup_date: "2026-10-02" }),
        row({ id: "d", deposit_paid_at: "2026-09-30T10:00:00Z" }), // paid, excluded
        row({ id: "e", status: "cancelled" }), // off, excluded
      ],
      NOW
    );
    expect(s.count).toBe(3);
    expect(s.total).toBe(350.5);
    expect(s.oldestDays).toBe(10);
    expect(s.collected).toBe(1);
    expect(s.imminent).toBe(1);
  });

  it("is all zeroes when nothing is owed", () => {
    const s = summariseOutstandingDeposits([row({ deposit_paid_at: "2026-09-30T10:00:00Z" })], NOW);
    expect(s).toEqual({ count: 0, total: 0, oldestDays: null, collected: 0, imminent: 0 });
  });

  it("handles an empty list", () => {
    expect(summariseOutstandingDeposits([], NOW).count).toBe(0);
  });
});

/**
 * §5.3 asks for this to be *visible*. A module nothing renders satisfies none of
 * it, and Vitest runs here in `node` with no DOM, so the wiring is asserted
 * against the source.
 */
describe("the reservations screen actually shows it", () => {
  const raw = readFileSync(
    new URL("../app/admin/reservations/page.tsx", import.meta.url).pathname,
    "utf8"
  );
  /**
   * Imports stripped before scanning, and that is not fussiness.
   *
   * An earlier draft of these tests scanned the whole file for the function
   * names, so they passed on the `import` line alone — removing both the row
   * warning and the banner left them green. A test that cannot tell "used" from
   * "imported" is a test that agrees with itself.
   */
  const page = raw.replace(/^import[\s\S]*?from\s+"[^"]*";$/gm, "");

  it("warns on the row", () => {
    expect(page).toMatch(/describeOutstandingDeposit\(/);
  });

  it("summarises above the table", () => {
    expect(page).toMatch(/summariseOutstandingDeposits\(/);
  });

  it("renders the summary, rather than only computing it", () => {
    // The count has to reach the screen. §5.3 asks for visible, not computed.
    expect(page).toMatch(/deposits\.count/);
    expect(page).toMatch(/deposits\.total/);
  });

  it("types the two fields it needs, which the API already returned", () => {
    expect(page).toMatch(/deposit\??:/);
    expect(page).toMatch(/deposit_paid_at\??:/);
  });
});
