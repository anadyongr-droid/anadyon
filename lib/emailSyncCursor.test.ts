/**
 * The sync cursor must be saved as the run goes, not at the end of it.
 *
 * This is a regression test for a two-day stall found in production:
 * gmail_last_sync sat at 2026-08-18T04:11:26 while messages received on 18
 * August were being stored on the 19th and the 20th. The cursor was written on
 * the last line of syncEmails, the cron raced that call against a 25s timeout,
 * and when the race fired Vercel froze the instance before the write landed.
 *
 * Nothing was corrupted, which is why it went unnoticed — each run re-fetched
 * a widening window, skipped what it had already stored, and paid for a
 * classification on whatever was new before running out of time again.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const cursorWrites: string[] = [];
const stored: string[] = [];

let batch: Array<{ gmailMessageId: string; gmailThreadId: string; receivedAt: Date; subject: string; bodyText: string; senderEmail: string; senderName: string }> = [];

vi.mock("@/lib/gmail", () => ({
  fetchNewEmails: async () => ({ emails: batch, remaining: 0 }),
  advanceSyncCursor: async (d: Date) => { cursorWrites.push(d.toISOString()); },
  fetchRepliedThreadIds: async () => [],
}));

vi.mock("@/lib/emailClassifier", () => ({
  // Deliberately slow, so a budget can expire part-way through a batch.
  classifyEmail: async () => {
    await new Promise((r) => setTimeout(r, 60));
    return { category: "Booking", greek_summary: "s", urgency: 1, reservation_date: null, suggested_action: "-" };
  },
}));

vi.mock("@/lib/telegram", () => ({ sendTelegram: async () => {} }));

vi.mock("@/lib/supabase", () => {
  // A chainable stub: every builder method returns the same object, so the
  // real code can call .select().eq().ilike().maybeSingle() in any order
  // without the mock having to mirror each exact chain.
  const make = (table: string) => {
    const q: Record<string, unknown> = {};
    const chain = () => q;
    for (const m of ["select", "eq", "neq", "in", "ilike", "like", "order", "limit", "is", "update"]) {
      q[m] = chain;
    }
    q.maybeSingle = async () => ({ data: null, error: null });
    q.single = async () => ({ data: { id: `row-${stored.length}`, urgency: 1 }, error: null });
    q.upsert = async () => ({ error: null });
    q.insert = (row: Record<string, unknown>) => {
      if (table === "emails") stored.push(row.gmail_message_id as string);
      return q;
    };
    // Awaiting the builder itself resolves like a PostgREST response.
    q.then = (res: (v: unknown) => unknown) =>
      res({ data: table === "emails" ? [] : [], error: null });
    return q;
  };
  return { supabaseAdmin: { from: (t: string) => make(t) } };
});

function makeBatch(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    gmailMessageId: `m${i}`,
    gmailThreadId: `t${i}`,
    receivedAt: new Date(Date.UTC(2026, 7, 18, 4, 11, 26 + i)),
    subject: `s${i}`, bodyText: "b", senderEmail: "a@b.c", senderName: "A",
  }));
}

describe("email sync cursor", () => {
  beforeEach(() => { cursorWrites.length = 0; stored.length = 0; vi.resetModules(); });

  it("saves the cursor after each message, not once at the end", async () => {
    batch = makeBatch(4);
    const { syncEmails } = await import("./emailSync");
    const res = await syncEmails({ budgetMs: 10_000 });

    expect(res.inserted).toBe(4);
    // One write per stored message — the property that makes progress durable.
    expect(cursorWrites).toHaveLength(4);
    expect(cursorWrites[cursorWrites.length - 1]).toBe(batch[3].receivedAt.toISOString());
  });

  it("keeps the progress it made when the budget runs out mid-batch", async () => {
    // The exact shape of the production failure: a batch too big for the time.
    batch = makeBatch(12);
    const { syncEmails } = await import("./emailSync");
    const res = await syncEmails({ budgetMs: 150 });

    expect(res.stoppedEarly).toBe(true);
    expect(res.inserted).toBeLessThan(12);
    // The point of the fix. Before it, an interrupted run saved nothing at all
    // and the next run began from exactly the same place.
    expect(cursorWrites.length).toBeGreaterThan(0);
    expect(cursorWrites).toHaveLength(res.inserted);
  });

  it("advances past messages that are already stored", async () => {
    batch = makeBatch(2);
    const { syncEmails } = await import("./emailSync");
    const res = await syncEmails({ budgetMs: 10_000 });
    expect(res.fetched).toBe(2);
    expect(cursorWrites).toHaveLength(2);
  });
});
