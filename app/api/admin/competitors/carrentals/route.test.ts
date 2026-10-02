import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * CarRentals' pass is nine searches, run one at a time and ingested by the
 * polling GET. Abandoning it used to strand the searches already paid for and
 * replan from scratch on the next press — through residential proxies billed by
 * traffic, so the restart costs real money rather than only time.
 */

const planRuns = vi.fn();
const startRun = vi.fn();
const getRunStatus = vi.fn();
const ingestDataset = vi.fn();
const usdToEur = vi.fn();
const recordImportCompleted = vi.fn();

vi.mock("@/lib/carRentalsRates", () => ({
  planRuns: () => planRuns(),
  startRun: (...a: unknown[]) => startRun(...a),
  getRunStatus: (...a: unknown[]) => getRunStatus(...a),
  ingestDataset: (...a: unknown[]) => ingestDataset(...a),
  usdToEur: () => usdToEur(),
}));
vi.mock("@/lib/rateImportLog", () => ({
  recordImportCompleted: (...a: unknown[]) => recordImportCompleted(...a),
}));

let stored: string | null = null;
vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: stored ? { value: stored } : null }) }),
      }),
      upsert: (row: { value: string }) => {
        stored = row.value;
        return Promise.resolve({ error: null });
      },
    }),
  },
}));

const { POST, GET } = await import("./route");

const ISO = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const plan = (n = 9) =>
  Array.from({ length: n }, (_, i) => ({ checkIn: `2026-10-0${i + 1}`, days: 3, url: `u${i}` }));

/** A stored pass with the first `done` searches finished. */
function pass(done: number, { plannedAt = ISO(20 * MINUTE), total = 9 } = {}) {
  return JSON.stringify({
    plannedAt,
    slots: plan(total).map((s, i) => ({
      ...s,
      runId: i <= done ? `run${i}` : undefined,
      datasetId: i <= done ? `ds${i}` : undefined,
      done: i < done,
      stored: i < done ? 5 : undefined,
      collectedAt: i < done ? ISO(30 * MINUTE) : undefined,
    })),
  });
}

beforeEach(() => {
  stored = null;
  vi.clearAllMocks();
  process.env.APIFY_TOKEN = "token";
  planRuns.mockReturnValue(plan());
  startRun.mockResolvedValue({ runId: "r", datasetId: "ds" });
  usdToEur.mockResolvedValue(0.92);
  ingestDataset.mockResolvedValue(7);
});

describe("POST /api/admin/competitors/carrentals", () => {
  it("resumes an unfinished pass rather than paying for it again", async () => {
    stored = pass(4);

    const body = await (await POST()).json();

    // Nothing is started here: the poll that follows drives the plan on, which
    // is the path it would have taken had the tab never been closed.
    expect(startRun).not.toHaveBeenCalled();
    expect(planRuns).not.toHaveBeenCalled();
    expect(body).toMatchObject({ resumed: true, finished: 4, total: 9 });
  });

  it("does not clobber the stored plan when resuming", async () => {
    const before = pass(4);
    stored = before;
    await POST();
    expect(stored).toBe(before);
  });

  it("plans afresh once the last pass finished", async () => {
    stored = pass(9);
    const body = await (await POST()).json();
    expect(planRuns).toHaveBeenCalled();
    expect(body).toMatchObject({ started: 1, total: 9 });
  });

  it("plans afresh when the unfinished pass is more than a day old", async () => {
    stored = pass(4, { plannedAt: ISO(30 * HOUR) });
    const body = await (await POST()).json();
    expect(startRun).toHaveBeenCalled();
    // Says what it threw away. A bare "started" would hide four finished
    // searches being abandoned.
    expect(body).toMatchObject({ discarded: 4 });
  });

  it("treats state written before plannedAt existed as too old to resume", async () => {
    // The old shape was a bare array of slots, with no plan timestamp at all.
    stored = JSON.stringify(plan(9).map((s, i) => ({ ...s, done: i < 3 })));
    await POST();
    expect(planRuns).toHaveBeenCalled();
  });

  it("records when a new plan was made, so the next press can judge its age", async () => {
    await POST();
    expect(Date.parse(JSON.parse(stored!).plannedAt)).not.toBeNaN();
  });
});

describe("GET /api/admin/competitors/carrentals", () => {
  it("does not log an import until the last search is in", async () => {
    // A half-done pass has refreshed some searches and not others. Dating the
    // import from it overstates how current the prices are — the exact fault
    // the import log replaced MAX(scraped_at) to remove.
    stored = pass(4);
    getRunStatus.mockResolvedValue({ status: "SUCCEEDED", datasetId: "ds", finishedAt: ISO(MINUTE) });

    const body = await (await GET()).json();

    expect(body.status).toBe("RUNNING");
    expect(recordImportCompleted).not.toHaveBeenCalled();
  });

  it("logs the import once, when the pass completes", async () => {
    stored = pass(8);
    getRunStatus.mockResolvedValue({ status: "SUCCEEDED", datasetId: "ds", finishedAt: ISO(MINUTE) });

    const body = await (await GET()).json();

    expect(body.status).toBe("DONE");
    expect(recordImportCompleted).toHaveBeenCalledTimes(1);
  });

  it("dates a completed pass by its oldest search", async () => {
    // A resumed pass mixes this morning's searches with yesterday evening's,
    // and the comparison shows them in one grid.
    const oldest = ISO(11 * HOUR);
    stored = JSON.stringify({
      plannedAt: ISO(12 * HOUR),
      slots: [
        { ...plan(1)[0], runId: "a", done: true, collectedAt: oldest },
        { ...plan(2)[1], runId: "b", done: false },
      ],
    });
    getRunStatus.mockResolvedValue({ status: "SUCCEEDED", datasetId: "ds", finishedAt: ISO(MINUTE) });

    await GET();

    expect(recordImportCompleted).toHaveBeenCalledWith("carrentals", new Date(oldest));
  });

  it("reports idle when there is no pass at all", async () => {
    expect((await (await GET()).json()).status).toBe("IDLE");
  });
});
