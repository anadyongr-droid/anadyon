import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  FILING_FAILED,
  FILING_STUCK,
  daysSincePickup,
  describeFailedFiling,
  filingUrgency,
  isFilingOutstanding,
  isRetryable,
  summariseFilingBacklog,
  type FilingRow,
} from "./filingBacklog";

const NOW = new Date("2026-10-02T09:00:00Z");

function row(over: Partial<FilingRow> = {}): FilingRow {
  return {
    id: "r1",
    dcl_status: "error",
    pickup_date: "2026-09-28",
    return_date: "2026-10-05",
    status: "active",
    ...over,
  };
}

describe("what counts as an outstanding filing", () => {
  it("a failed filing does", () => {
    expect(isFilingOutstanding(row())).toBe(true);
  });

  it("a filing stuck mid-submission does, and that is the point", () => {
    // claim_dcl_submission refuses anything already `submitting`, so this row
    // can never be retried. It was invisible everywhere before W26.
    expect(isFilingOutstanding(row({ dcl_status: FILING_STUCK }))).toBe(true);
  });

  it("a submitted or unattempted filing does not", () => {
    for (const status of ["submitted", "not_submitted", null, undefined, ""]) {
      expect(isFilingOutstanding(row({ dcl_status: status as never })), String(status)).toBe(false);
    }
  });

  it("names the two states it treats as outstanding", () => {
    expect([FILING_FAILED, FILING_STUCK]).toEqual(["error", "submitting"]);
  });
});

describe("whether a retry is even possible", () => {
  it("a failed filing can be retried", () => {
    expect(isRetryable(row())).toBe(true);
  });

  it("a stuck filing cannot, which is a different instruction", () => {
    // Sending someone to a button that answers 409 for ever is worse than
    // saying nothing, so the two states must not collapse into one.
    expect(isRetryable(row({ dcl_status: FILING_STUCK }))).toBe(false);
  });
});

describe("the clock is the rental, not the attempt", () => {
  it("counts days since the rental started", () => {
    expect(daysSincePickup(row({ pickup_date: "2026-09-28" }), NOW)).toBe(4);
  });

  it("is zero on the day it starts", () => {
    expect(daysSincePickup(row({ pickup_date: "2026-10-02" }), NOW)).toBe(0);
  });

  it("goes negative for a rental still to come", () => {
    expect(daysSincePickup(row({ pickup_date: "2026-10-09" }), NOW)).toBe(-7);
  });

  it("returns null rather than zero when there is no date", () => {
    expect(daysSincePickup(row({ pickup_date: null }), NOW)).toBeNull();
    expect(daysSincePickup(row({ pickup_date: "not a date" }), NOW)).toBeNull();
  });
});

describe("urgency, because a statutory deadline is not the attempt time", () => {
  it("a started rental with no filing is overdue", () => {
    expect(filingUrgency(row({ pickup_date: "2026-09-28" }), NOW)).toBe("overdue");
  });

  it("starting today is imminent, not yet overdue", () => {
    // The declaration is due at the start of the rental; the day it starts there
    // is still time, and calling it overdue would cry wolf.
    expect(filingUrgency(row({ pickup_date: "2026-10-02" }), NOW)).toBe("imminent");
  });

  it("starting within two days is imminent", () => {
    expect(filingUrgency(row({ pickup_date: "2026-10-04" }), NOW)).toBe("imminent");
  });

  it("further out is upcoming", () => {
    expect(filingUrgency(row({ pickup_date: "2026-10-05" }), NOW)).toBe("upcoming");
  });

  it("an undated row is not assumed overdue", () => {
    // It cannot be shown to be overdue, and §8 says an unverifiable claim is
    // not filled in favourably.
    expect(filingUrgency(row({ pickup_date: null }), NOW)).toBe("upcoming");
  });
});

describe("what the operator is told", () => {
  it("says how long the rental has been running and that it is a statutory gap", () => {
    const text = describeFailedFiling(row({ pickup_date: "2026-09-28" }), NOW)!;
    expect(text).toContain("started 4 days ago");
    expect(text).toContain("statutory");
  });

  it("warns against resubmitting a filing that may have been accepted", () => {
    // Straight from W27: a timed-out submission records `error` but AADE may
    // have accepted it, and a duplicate declaration is worse than a late one.
    expect(describeFailedFiling(row(), NOW)).toContain("twice is worse than filing it late");
  });

  it("tells a stuck row something different, and says a retry is impossible", () => {
    const text = describeFailedFiling(row({ dcl_status: FILING_STUCK }), NOW)!;
    expect(text).toContain("cannot be retried");
    expect(text).toContain("409");
    expect(text).toContain("reset");
    // And it must not give the retry advice meant for a failed filing.
    expect(text).not.toContain("twice is worse");
  });

  it("reads naturally for today, yesterday and the future", () => {
    expect(describeFailedFiling(row({ pickup_date: "2026-10-02" }), NOW)).toContain("starts today");
    expect(describeFailedFiling(row({ pickup_date: "2026-10-01" }), NOW)).toContain("started yesterday");
    expect(describeFailedFiling(row({ pickup_date: "2026-10-05" }), NOW)).toContain("starts in 3 days");
  });

  it("admits an unknown date instead of implying one", () => {
    expect(describeFailedFiling(row({ pickup_date: null }), NOW)).toContain("no pick-up date");
  });

  it("says nothing at all when the filing is fine", () => {
    expect(describeFailedFiling(row({ dcl_status: "submitted" }), NOW)).toBeNull();
  });
});

describe("the summary read before opening the AADE portal", () => {
  it("counts, separates the stuck ones, and reports the worst case", () => {
    const s = summariseFilingBacklog(
      [
        row({ id: "a", pickup_date: "2026-08-20" }),                            // overdue 43d
        row({ id: "b", pickup_date: "2026-09-30" }),                            // overdue 2d
        row({ id: "c", pickup_date: "2026-10-09" }),                            // upcoming
        row({ id: "d", pickup_date: "2026-09-01", dcl_status: FILING_STUCK }),  // overdue + stuck
        row({ id: "e", dcl_status: "submitted" }),                              // excluded
        row({ id: "f", dcl_status: "not_submitted" }),                          // excluded
      ],
      NOW,
    );
    expect(s.count).toBe(4);
    expect(s.overdue).toBe(3);
    expect(s.stuck).toBe(1);
    expect(s.oldestOverdueDays).toBe(43);
  });

  it("is all zeroes when nothing is outstanding", () => {
    expect(summariseFilingBacklog([row({ dcl_status: "submitted" })], NOW)).toEqual({
      count: 0,
      overdue: 0,
      stuck: 0,
      oldestOverdueDays: null,
    });
  });

  it("handles an empty list", () => {
    expect(summariseFilingBacklog([], NOW).count).toBe(0);
  });

  it("reports no oldest when nothing is overdue, rather than zero", () => {
    const s = summariseFilingBacklog([row({ pickup_date: "2026-10-09" })], NOW);
    expect(s.count).toBe(1);
    expect(s.oldestOverdueDays).toBeNull();
  });
});

/**
 * §5.3 asks for the backlog to be *surfaced*. A module nothing renders satisfies
 * none of it, and Vitest runs here in `node` with no DOM, so the wiring is
 * asserted against the source — with imports stripped, so the assertion is about
 * use rather than presence. See the note in `lib/outstandingDeposits.test.ts` for
 * why that distinction bit.
 */
describe("the reservations screen shows the backlog", () => {
  const raw = readFileSync(
    new URL("../app/admin/reservations/page.tsx", import.meta.url).pathname,
    "utf8",
  );
  const page = raw.replace(/^import[\s\S]*?from\s+"[^"]*";$/gm, "");

  it("warns on the row", () => {
    expect(page).toMatch(/describeFailedFiling\(/);
  });

  it("summarises above the table", () => {
    expect(page).toMatch(/summariseFilingBacklog\(/);
  });

  it("renders the count and the overdue number, not just computes them", () => {
    expect(page).toMatch(/backlog\.count/);
    expect(page).toMatch(/backlog\.overdue/);
    expect(page).toMatch(/backlog\.stuck/);
  });

  it("asks the dedicated endpoint rather than counting the windowed list", () => {
    // Counting `reservations` would silently miss the oldest failed filing,
    // which is the row with the most statutory exposure.
    expect(page).toContain("/api/admin/aade/backlog");
    expect(page).toMatch(/summariseFilingBacklog\(filings/);
  });

  it("says so when the backlog response was capped", () => {
    expect(page).toMatch(/filingsTruncated/);
  });

  it("does not let a failed backlog fetch blank the reservations table", () => {
    // The W23 lesson in the other direction: this is an extra, and an extra
    // must not take the screen down.
    const loader = page.slice(page.indexOf("async function load"), page.indexOf("useEffect"));
    expect(loader).toContain("/api/admin/aade/backlog");
    expect(loader).toMatch(/setReservations[\s\S]*\/api\/admin\/aade\/backlog/);
  });
});

describe("the endpoint asks the database, not the page's window", () => {
  const route = readFileSync(
    new URL("../app/api/admin/aade/backlog/route.ts", import.meta.url).pathname,
    "utf8",
  ).replace(/^import[\s\S]*?from\s+"[^"]*";$/gm, "");

  it("filters on both outstanding states in the query", () => {
    expect(route).toMatch(/\.in\("dcl_status", \[FILING_FAILED, FILING_STUCK\]\)/);
  });

  it("orders oldest pick-up first, so the most exposed row is at the top", () => {
    expect(route).toMatch(/order\("pickup_date", \{ ascending: true \}\)/);
  });

  it("caps the response and says when the cap was hit", () => {
    // A truncated backlog that looks complete is the defect this route exists
    // to avoid, so the flag is not optional.
    expect(route).toMatch(/\.limit\(MAX_ROWS\)/);
    expect(route).toMatch(/truncated: rows\.length >= MAX_ROWS/);
  });

  it("answers a database error as an error, not as an empty backlog", () => {
    expect(route).toMatch(/if \(error\)/);
    expect(route).toMatch(/status: 500/);
  });
});
