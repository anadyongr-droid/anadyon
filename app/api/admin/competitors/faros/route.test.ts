import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The abandoned-run defect, at the route.
 *
 * `lib/apifyRunRecovery.test.ts` covers the decision itself. These cover the
 * wiring, which is where the money is: every branch below is one that would
 * otherwise only be reachable by starting a real Apify run and paying for it.
 */

const startFarosRun = vi.fn();
const getRunStatus = vi.fn();
const ingestFarosDataset = vi.fn();
const recordImportCompleted = vi.fn();

vi.mock("@/lib/farosRates", () => ({
  startFarosRun: (...a: unknown[]) => startFarosRun(...a),
  getRunStatus: (...a: unknown[]) => getRunStatus(...a),
  ingestFarosDataset: (...a: unknown[]) => ingestFarosDataset(...a),
}));
vi.mock("@/lib/rateImportLog", () => ({
  recordImportCompleted: (...a: unknown[]) => recordImportCompleted(...a),
}));

/** The single `system_settings` row this route reads and writes. */
let stored: string | null = null;
const upsert = vi.fn(async (row: { value: string }) => {
  stored = row.value;
  return { error: null };
});

vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: stored ? { value: stored } : null }) }),
      }),
      upsert: (row: { value: string }) => upsert(row),
    }),
  },
}));

const { POST } = await import("./route");

const ISO = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

beforeEach(() => {
  stored = null;
  vi.clearAllMocks();
  process.env.APIFY_TOKEN = "token";
  startFarosRun.mockResolvedValue({ runId: "new", datasetId: "ds-new" });
  ingestFarosDataset.mockResolvedValue({ stored: 42 });
});

describe("POST /api/admin/competitors/faros", () => {
  it("collects a finished run nobody read instead of paying for another", async () => {
    // The reported defect: the tab was closed, the run finished on Apify's
    // servers, and pressing the button again started a second one.
    stored = JSON.stringify({ runId: "old", datasetId: "ds-old", startedAt: ISO(20 * MINUTE), ingested: false });
    getRunStatus.mockResolvedValue({
      status: "SUCCEEDED",
      datasetId: "ds-live",
      finishedAt: ISO(18 * MINUTE),
    });

    const body = await (await POST()).json();

    expect(startFarosRun).not.toHaveBeenCalled();
    expect(ingestFarosDataset).toHaveBeenCalledWith("token", "ds-live");
    expect(body).toMatchObject({ ok: true, recovered: true, stored: 42 });
    // And it is marked so the next press does not ingest it twice.
    expect(JSON.parse(stored!).ingested).toBe(true);
  });

  it("dates the recovered data by when Apify finished, not by the press", async () => {
    // Recording `now` would report last night's prices as this morning's — the
    // overstatement the import log was introduced to remove.
    const finishedAt = ISO(9 * HOUR);
    stored = JSON.stringify({ runId: "old", datasetId: "ds-old", startedAt: ISO(10 * HOUR) });
    getRunStatus.mockResolvedValue({ status: "SUCCEEDED", datasetId: "ds", finishedAt });

    await POST();

    expect(recordImportCompleted).toHaveBeenCalledWith("faros", new Date(finishedAt));
  });

  it("does not start a second run alongside one still going", async () => {
    stored = JSON.stringify({ runId: "old", startedAt: ISO(MINUTE) });
    getRunStatus.mockResolvedValue({ status: "RUNNING", datasetId: "", finishedAt: null });

    const body = await (await POST()).json();

    expect(startFarosRun).not.toHaveBeenCalled();
    expect(ingestFarosDataset).not.toHaveBeenCalled();
    expect(body).toMatchObject({ status: "RUNNING", recovered: true });
  });

  it("starts afresh when the finished run is more than a day old", async () => {
    stored = JSON.stringify({ runId: "old", datasetId: "ds-old", startedAt: ISO(30 * HOUR) });
    getRunStatus.mockResolvedValue({ status: "SUCCEEDED", datasetId: "ds", finishedAt: ISO(29 * HOUR) });

    const body = await (await POST()).json();

    expect(ingestFarosDataset).not.toHaveBeenCalled();
    expect(startFarosRun).toHaveBeenCalled();
    expect(body.note).toContain("more than a day old");
  });

  it("starts afresh after a failed run", async () => {
    stored = JSON.stringify({ runId: "old", startedAt: ISO(MINUTE) });
    getRunStatus.mockResolvedValue({ status: "FAILED", datasetId: "", finishedAt: ISO(MINUTE) });

    await POST();

    expect(startFarosRun).toHaveBeenCalled();
    expect(ingestFarosDataset).not.toHaveBeenCalled();
  });

  it("starts afresh when Apify cannot be reached, rather than refusing", async () => {
    // A button that does nothing and says nothing is worse than a re-run.
    stored = JSON.stringify({ runId: "old", startedAt: ISO(MINUTE) });
    getRunStatus.mockRejectedValue(new Error("network"));

    expect((await POST()).status).toBe(200);
    expect(startFarosRun).toHaveBeenCalled();
  });

  it("does not re-ingest a run that was already collected", async () => {
    stored = JSON.stringify({ runId: "old", startedAt: ISO(MINUTE), ingested: true });

    await POST();

    // Not even asked about: an ingested run is finished business, so the status
    // call is skipped entirely.
    expect(getRunStatus).not.toHaveBeenCalled();
    expect(startFarosRun).toHaveBeenCalled();
  });

  it("stores the start time of a new run, so it can be recovered later", async () => {
    await POST();
    const written = JSON.parse(stored!);
    expect(written).toMatchObject({ runId: "new", datasetId: "ds-new", ingested: false });
    expect(Date.parse(written.startedAt)).not.toBeNaN();
  });

  it("refuses without a token and touches nothing", async () => {
    delete process.env.APIFY_TOKEN;
    expect((await POST()).status).toBe(400);
    expect(startFarosRun).not.toHaveBeenCalled();
  });
});
