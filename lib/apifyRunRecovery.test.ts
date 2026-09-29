import { describe, expect, it } from "vitest";
import {
  decidePlanRecovery,
  decideRunRecovery,
  oldestCollection,
  RECOVERABLE_WITHIN_MS,
} from "./apifyRunRecovery";

const NOW = new Date("2026-09-29T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

describe("a finished run nobody read is collected, not paid for again", () => {
  it("ingests a successful run that was never ingested", () => {
    // The whole point of the item. The operator closed the tab, the run
    // finished on Apify's servers, and pressing the button again used to start
    // a second one and bill for it.
    const d = decideRunRecovery(
      { runId: "r1", startedAt: ago(20 * MINUTE), ingested: false },
      { status: "SUCCEEDED", finishedAt: ago(18 * MINUTE) },
      NOW
    );
    expect(d.action).toBe("ingest");
    expect(d.collectedAt?.toISOString()).toBe(ago(18 * MINUTE));
  });

  it("dates the data by when it was collected, not by when it was picked up", () => {
    // Recording `now` would report last night's prices as this morning's —
    // exactly the overstatement the import log replaced MAX(scraped_at) to fix.
    const d = decideRunRecovery(
      { runId: "r1", startedAt: ago(10 * HOUR), ingested: false },
      { status: "SUCCEEDED", finishedAt: ago(9 * HOUR) },
      NOW
    );
    expect(d.collectedAt?.toISOString()).toBe(ago(9 * HOUR));
  });

  it("falls back to the start time when Apify gives no finish time", () => {
    const d = decideRunRecovery(
      { runId: "r1", startedAt: ago(30 * MINUTE), ingested: false },
      { status: "SUCCEEDED", finishedAt: null },
      NOW
    );
    expect(d.action).toBe("ingest");
    expect(d.collectedAt?.toISOString()).toBe(ago(30 * MINUTE));
  });
});

describe("what is not recovered, and why each one is a start rather than a wait", () => {
  it("starts when there is no stored run", () => {
    expect(decideRunRecovery(null, null, NOW).action).toBe("start");
    expect(decideRunRecovery({}, null, NOW).action).toBe("start");
  });

  it("starts when the stored run was already ingested", () => {
    const d = decideRunRecovery(
      { runId: "r1", startedAt: ago(MINUTE), ingested: true },
      { status: "SUCCEEDED", finishedAt: ago(MINUTE) },
      NOW
    );
    expect(d.action).toBe("start");
  });

  it("waits rather than starting a second run alongside a live one", () => {
    // Starting here is the expensive mistake: the first run is still going and
    // will still finish.
    for (const status of ["RUNNING", "READY"]) {
      expect(
        decideRunRecovery({ runId: "r1", startedAt: ago(MINUTE) }, { status }, NOW).action
      ).toBe("wait");
    }
  });

  it("starts after a run that failed, aborted or timed out", () => {
    for (const status of ["FAILED", "ABORTED", "TIMED-OUT"]) {
      const d = decideRunRecovery({ runId: "r1", startedAt: ago(MINUTE) }, { status }, NOW);
      expect(d.action).toBe("start");
      expect(d.reason).toContain(status.toLowerCase());
    }
  });

  it("starts when Apify could not be asked", () => {
    // Refusing would leave a button that does nothing and no way to find out
    // why; a start can still produce prices.
    const d = decideRunRecovery({ runId: "r1", startedAt: ago(MINUTE) }, null, NOW);
    expect(d.action).toBe("start");
  });

  it("starts when the finished run is more than a day old", () => {
    const stale = decideRunRecovery(
      { runId: "r1", startedAt: ago(RECOVERABLE_WITHIN_MS + 2 * MINUTE) },
      { status: "SUCCEEDED", finishedAt: ago(RECOVERABLE_WITHIN_MS + MINUTE) },
      NOW
    );
    expect(stale.action).toBe("start");

    // And is still recovered just inside the window, so the boundary is where
    // it is stated to be rather than an hour either side.
    const fresh = decideRunRecovery(
      { runId: "r1", startedAt: ago(RECOVERABLE_WITHIN_MS) },
      { status: "SUCCEEDED", finishedAt: ago(RECOVERABLE_WITHIN_MS - MINUTE) },
      NOW
    );
    expect(fresh.action).toBe("ingest");
  });

  it("starts when the stored timestamps are unusable", () => {
    const d = decideRunRecovery(
      { runId: "r1", startedAt: "not a date" },
      { status: "SUCCEEDED", finishedAt: "also not a date" },
      NOW
    );
    expect(d.action).toBe("start");
    expect(d.collectedAt).toBeNull();
  });

  it("never offers a collection time for anything but an ingest", () => {
    const decisions = [
      decideRunRecovery(null, null, NOW),
      decideRunRecovery({ runId: "r1", startedAt: ago(MINUTE) }, { status: "RUNNING" }, NOW),
      decideRunRecovery({ runId: "r1", startedAt: ago(MINUTE) }, { status: "FAILED" }, NOW),
    ];
    for (const d of decisions) expect(d.collectedAt).toBeNull();
  });
});

describe("CarRentals, whose pass is nine searches rather than one", () => {
  const slots = (done: number, total = 9) =>
    Array.from({ length: total }, (_, i) => ({ done: i < done }));

  it("resumes a half-finished plan instead of replanning it", () => {
    // The finished searches hold their prices already; re-running them pays
    // twice for the same residential-proxy traffic.
    const d = decidePlanRecovery(ago(20 * MINUTE), slots(4), NOW);
    expect(d.action).toBe("resume");
    expect(d).toMatchObject({ finished: 4, total: 9 });
  });

  it("starts a new pass once the last one finished", () => {
    expect(decidePlanRecovery(ago(20 * MINUTE), slots(9), NOW).action).toBe("start");
  });

  it("starts when there is no plan at all", () => {
    expect(decidePlanRecovery(null, null, NOW).action).toBe("start");
    expect(decidePlanRecovery(ago(MINUTE), [], NOW).action).toBe("start");
  });

  it("treats a plan written before this field existed as stale", () => {
    // Resuming a plan of unknown age could ingest searches for pickup dates
    // that have already passed.
    const d = decidePlanRecovery(undefined, slots(4), NOW);
    expect(d.action).toBe("start");
    expect(d.reason).toContain("no start time");
  });

  it("starts when the unfinished plan is more than a day old", () => {
    expect(
      decidePlanRecovery(ago(RECOVERABLE_WITHIN_MS + MINUTE), slots(4), NOW).action
    ).toBe("start");
    expect(
      decidePlanRecovery(ago(RECOVERABLE_WITHIN_MS - MINUTE), slots(4), NOW).action
    ).toBe("resume");
  });

  it("reports progress even when it decides to start afresh", () => {
    // The screen says what happened to the previous attempt; a bare "started"
    // hides that eight searches were thrown away.
    const d = decidePlanRecovery(ago(3 * 24 * HOUR), slots(8), NOW);
    expect(d).toMatchObject({ action: "start", finished: 8, total: 9 });
  });
});

describe("dating a pass made of several searches", () => {
  it("reports the oldest search, not the last one to finish", () => {
    // A resumed pass mixes this morning's searches with yesterday evening's,
    // and the comparison shows them in one grid. Reporting the newest would say
    // the whole set is as fresh as its freshest member — the same mistake
    // summariseFreshness avoids by reporting the oldest source.
    const oldest = oldestCollection([
      { collectedAt: ago(2 * HOUR) },
      { collectedAt: ago(11 * HOUR) },
      { collectedAt: ago(40 * MINUTE) },
    ]);
    expect(oldest?.toISOString()).toBe(ago(11 * HOUR));
  });

  it("ignores searches that carry no time", () => {
    const oldest = oldestCollection([
      { collectedAt: null },
      {},
      { collectedAt: ago(HOUR) },
    ]);
    expect(oldest?.toISOString()).toBe(ago(HOUR));
  });

  it("is null when nothing carries a time, rather than inventing one", () => {
    expect(oldestCollection([])).toBeNull();
    expect(oldestCollection([{ collectedAt: null }, { collectedAt: "not a date" }])).toBeNull();
  });
});
