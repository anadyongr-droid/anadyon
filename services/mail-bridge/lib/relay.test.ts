import { beforeEach, describe, expect, it } from "vitest";
import { handleListSenders, handleSend, handleStatus, type Authenticator, type RelayDeps } from "./relay";
import { DEFAULT_LIMITS, type ApprovedSender } from "./sendRequest";
import { InMemoryBridgeStore } from "./store";
import { FakeZohoMailClient, type SendOutcome, type ZohoMailClient } from "./zohoClient";
import type { ValidatedSend } from "./sendRequest";

/**
 * The relay's send path, tested for the things that would be invisible in
 * production until they mattered.
 *
 * **The ordering tests are the point.** Each control in §6.2 can be present
 * and inert if it runs after the irreversible step. So these do not merely
 * assert that a refusal happens — they assert that **nothing was sent** when it
 * does, by inspecting the fake client. A kill switch that returns 503 after
 * calling Zoho would pass a status-code test and fail these.
 */

const senders: ApprovedSender[] = [
  { address: "customerservice@anadyon.gr", displayName: "Anadyon Customer Service" },
];

const user = { userId: "office-1", approvedSenders: senders };

const auth: Authenticator = {
  async authenticate(token) {
    return token === "good-token" ? user : undefined;
  },
};

const body = (key = "idem-0123456789abcdef") => ({
  senderAddress: "customerservice@anadyon.gr",
  to: ["guest@example.com"],
  subject: "Your reservation",
  text: "Kind regards",
  idempotencyKey: key,
});

let store: InMemoryBridgeStore;
let zoho: FakeZohoMailClient;
let deps: RelayDeps;

beforeEach(() => {
  store = new InMemoryBridgeStore();
  zoho = new FakeZohoMailClient();
  deps = { auth, store, zoho, limits: DEFAULT_LIMITS };
});

describe("the happy path, so the refusals below mean something", () => {
  it("sends once and reports the provider id", async () => {
    const res = await handleSend("good-token", body(), deps);
    expect(res.status).toBe(200);
    expect(res.body.sent).toBe(true);
    expect(zoho.sent).toHaveLength(1);
    expect(store.intents).toHaveLength(1);
  });

  it("records attribution without the subject text", async () => {
    await handleSend("good-token", body(), deps);
    const record = store.intents[0];
    expect(record.userId).toBe("office-1");
    expect(record.senderAddress).toBe("customerservice@anadyon.gr");
    expect(record.subjectLength).toBe("Your reservation".length);
    // §2.2 forbids retaining bodies; a subject is body-adjacent.
    expect(JSON.stringify(record)).not.toContain("Your reservation");
    expect(JSON.stringify(record)).not.toContain("Kind regards");
  });
});

describe("the kill switch runs before anything irreversible", () => {
  it("refuses, and NOTHING was sent", async () => {
    store.setSendingEnabled(false);
    const res = await handleSend("good-token", body(), deps);
    expect(res.status).toBe(503);
    expect(zoho.sent).toEqual([]); // the assertion that makes this test worth having
  });

  it("beats a valid session, which is the case it exists for", async () => {
    store.setSendingEnabled(false);
    const res = await handleSend("good-token", body(), deps);
    expect(res.status).toBe(503);
    expect(res.body.error).toContain("Zoho webmail");
  });
});

describe("authentication", () => {
  it.each([["no token", undefined], ["a wrong token", "nope"]])("%s sends nothing", async (_l, token) => {
    const res = await handleSend(token as string | undefined, body(), deps);
    expect(res.status).toBe(401);
    expect(zoho.sent).toEqual([]);
  });

  it("resolves the sender allowlist from the USER, not the request", async () => {
    // A request naming an address the user does not hold must fail even though
    // the address is otherwise a real Anadyon identity.
    const res = await handleSend("good-token", { ...body(), senderAddress: "rentals@anadyon.gr" }, deps);
    expect(res.status).toBe(400);
    expect(zoho.sent).toEqual([]);
  });
});

describe("idempotency — a double click must not send twice", () => {
  it("returns the first result and does not send again", async () => {
    const first = await handleSend("good-token", body("same-key-0123456789"), deps);
    const second = await handleSend("good-token", body("same-key-0123456789"), deps);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.deduplicated).toBe(true);
    expect(zoho.sent).toHaveLength(1);
  });

  it("refuses a concurrent duplicate rather than racing it", async () => {
    // A slow client: the second request arrives while the first is in flight.
    let release!: () => void;
    const slow: ZohoMailClient = {
      send: async (s: ValidatedSend) => {
        zoho.sent.push(s);
        await new Promise<void>((r) => { release = r; });
        return { ok: true, providerMessageId: "slow-1", savedToSent: true } as SendOutcome;
      },
    };
    const d = { ...deps, zoho: slow };
    const inflight = handleSend("good-token", body("race-key-0123456789"), d);
    await Promise.resolve();
    const second = await handleSend("good-token", body("race-key-0123456789"), d);
    expect(second.status).toBe(409);
    release();
    await inflight;
    expect(zoho.sent).toHaveLength(1);
  });

  it("a NEVER-ATTEMPTED failure releases the key so a genuine retry can proceed", async () => {
    const failing = new FakeZohoMailClient({ ok: false, delivery: "not_attempted", failure: "no token" });
    const first = await handleSend("good-token", body("retry-key-0123456789"), { ...deps, zoho: failing });
    expect(first.status).toBe(502);
    expect(first.body.retryable).toBe(true);
    const second = await handleSend("good-token", body("retry-key-0123456789"), deps);
    expect(second.status).toBe(200);
    expect(second.body.deduplicated).toBeUndefined();
  });

  it("a REJECTION is settled, so a retry gets the same answer not a second attempt", async () => {
    const failing = new FakeZohoMailClient({ ok: false, delivery: "rejected", failure: "rejected" });
    const d = { ...deps, zoho: failing };
    await handleSend("good-token", body("perm-key-0123456789"), d);
    const again = await handleSend("good-token", body("perm-key-0123456789"), d);
    expect(again.body.deduplicated).toBe(true);
    expect(failing.sent).toHaveLength(1);
  });
});

describe("failures never leak upstream detail", () => {
  it("does not return the provider's message", async () => {
    const failing = new FakeZohoMailClient({ ok: false, delivery: "rejected", failure: "token xyzsecret expired at host internal.zoho" });
    const res = await handleSend("good-token", body(), { ...deps, zoho: failing });
    expect(JSON.stringify(res.body)).not.toContain("xyzsecret");
    expect(JSON.stringify(res.body)).not.toContain("internal.zoho");
  });

  it("treats a thrown client as an UNKNOWN delivery and does NOT release the key", async () => {
    // Review finding 1. A client that throws may have thrown after Zoho
    // accepted the message, so releasing the key would let the next attempt
    // send the customer a second copy.
    const throwing: ZohoMailClient = { send: async () => { throw new Error("ECONNRESET"); } };
    const res = await handleSend("good-token", body("throw-0123456789ab"), { ...deps, zoho: throwing });
    expect(res.status).toBe(502);
    expect(res.body.delivery).toBe("unknown");
    expect(JSON.stringify(res.body)).not.toContain("ECONNRESET");

    const retry = await handleSend("good-token", body("throw-0123456789ab"), deps);
    expect(retry.status).toBe(502);
    expect(retry.body.sent).toBeUndefined();
    expect(String(retry.body.error)).toContain("Sent folder");
    expect(zoho.sent).toEqual([]);
  });
});

describe("the write-ahead intent is what makes this fail closed — review finding 2", () => {
  it("refuses the send entirely when the intent cannot be recorded, and NOTHING is sent", async () => {
    // The first version wrote the audit record AFTER the send under a constant
    // claiming it failed closed. It did not: the message had already left with
    // no record of who sent it. The record now precedes the irreversible step.
    store.intentBroken = true;
    const res = await handleSend("good-token", body("intent-0123456789ab"), deps);
    expect(res.status).toBe(503);
    expect(String(res.body.error)).toContain("cannot be recorded");
    expect(zoho.sent).toEqual([]);
  });

  it("releases the key, because nothing was sent and the user may retry once the store is back", async () => {
    store.intentBroken = true;
    await handleSend("good-token", body("intent2-0123456789ab"), deps);
    store.intentBroken = false;
    const retry = await handleSend("good-token", body("intent2-0123456789ab"), deps);
    expect(retry.status).toBe(200);
    expect(retry.body.deduplicated).toBeUndefined();
    expect(zoho.sent).toHaveLength(1);
  });

  it("writes the intent BEFORE calling Zoho, with no message content in it", async () => {
    const order: string[] = [];
    const watching = new InMemoryBridgeStore();
    const originalIntent = watching.recordIntent.bind(watching);
    watching.recordIntent = async (record) => {
      order.push("intent");
      return originalIntent(record);
    };
    const watchingZoho: ZohoMailClient = {
      send: async () => {
        order.push("send");
        return { ok: true, delivery: "sent", providerMessageId: "zm-1", savedToSent: true };
      },
    };
    await handleSend("good-token", body("order-0123456789ab"), { ...deps, store: watching, zoho: watchingZoho });
    expect(order).toEqual(["intent", "send"]);

    const intent = watching.intents[0];
    expect(intent).toMatchObject({ userId: "office-1", senderAddress: "customerservice@anadyon.gr", recipientCount: 1 });
    expect(JSON.stringify(intent)).not.toContain("Your reservation");
    expect(JSON.stringify(intent)).not.toContain("guest@example.com");
    expect(intent.subjectLength).toBe("Your reservation".length);
  });

  it("keeps the send attributable when only the OUTCOME cannot be recorded", async () => {
    store.outcomeBroken = true;
    const res = await handleSend("good-token", body("outcome-0123456789ab"), deps);
    expect(res.status).toBe(500);
    expect(String(res.body.error)).toContain("Sent folder");
    // The point of write-ahead: the actor is on record even though the result
    // is not.
    expect(store.intents).toHaveLength(1);
    expect(store.intents[0].userId).toBe("office-1");
  });
});

describe("admission is one atomic step — review finding 6", () => {
  it("does not let concurrent requests with different keys all pass the limit", async () => {
    // The first version counted recent sends, compared, then claimed. Three
    // concurrent requests all read the same count and all sent.
    const limits = { ...DEFAULT_LIMITS, maxSendsPerWindow: 2 };
    const d = { ...deps, limits };
    const results = await Promise.all([
      handleSend("good-token", body("c1-0123456789abcdef"), d),
      handleSend("good-token", body("c2-0123456789abcdef"), d),
      handleSend("good-token", body("c3-0123456789abcdef"), d),
      handleSend("good-token", body("c4-0123456789abcdef"), d),
    ]);
    expect(results.filter((r) => r.status === 429)).toHaveLength(2);
    expect(zoho.sent).toHaveLength(2);
  });

  it("still refuses past the limit sequentially, and sends nothing", async () => {
    const limits = { ...DEFAULT_LIMITS, maxSendsPerWindow: 2 };
    const d = { ...deps, limits };
    await handleSend("good-token", body("k1-0123456789abcdef"), d);
    await handleSend("good-token", body("k2-0123456789abcdef"), d);
    const before = zoho.sent.length;
    expect((await handleSend("good-token", body("k3-0123456789abcdef"), d)).status).toBe(429);
    expect(zoho.sent).toHaveLength(before);
  });

  it("does not consume the idempotency key when refusing on volume", async () => {
    const limits = { ...DEFAULT_LIMITS, maxSendsPerWindow: 0 };
    const refused = await handleSend("good-token", body("unspent-0123456789"), { ...deps, limits });
    expect(refused.status).toBe(429);
    const later = await handleSend("good-token", body("unspent-0123456789"), deps);
    expect(later.status).toBe(200);
  });
});

describe("a stranded claim does not block a message forever — review finding 7", () => {
  it("re-admits a claim past its lease", async () => {
    // A worker that died between claim and send used to leave the key
    // in_flight permanently, so that message could never be sent again.
    const leased = new InMemoryBridgeStore(1000);
    const d = { ...deps, store: leased };
    const stall: ZohoMailClient = { send: () => new Promise(() => {}) };
    void handleSend("good-token", body("lease-0123456789ab"), { ...d, zoho: stall });
    await new Promise((r) => setTimeout(r, 5));

    expect((await handleSend("good-token", body("lease-0123456789ab"), d)).status).toBe(409);
    await new Promise((r) => setTimeout(r, 1100));
    expect((await handleSend("good-token", body("lease-0123456789ab"), d)).status).toBe(200);
  });

  it("will not let a stale holder settle a claim somebody else now holds", async () => {
    const leased = new InMemoryBridgeStore(50);
    const first = await leased.admit("fence-key", "office-1", DEFAULT_LIMITS, 0);
    expect(first.state).toBe("claimed");
    const staleToken = first.state === "claimed" ? first.token : "";
    const second = await leased.admit("fence-key", "office-1", DEFAULT_LIMITS, 1000);
    expect(second.state).toBe("claimed");

    await expect(
      leased.recordOutcome({ idempotencyKey: "fence-key", delivery: "sent", at: 1001 }, staleToken),
    ).rejects.toThrow(/fencing/);
    // And the stale holder cannot release the live claim either.
    await leased.release("fence-key", staleToken);
    expect((await leased.admit("fence-key", "office-1", DEFAULT_LIMITS, 1002)).state).toBe("in_flight");
  });
});

describe("the other two endpoints", () => {
  it("lists only the authenticated user's senders", async () => {
    const res = await handleListSenders("good-token", deps);
    expect(res.status).toBe(200);
    expect(res.body.senders).toEqual(senders);
    expect((await handleListSenders(undefined, deps)).status).toBe(401);
  });

  it("reports a settled send by key, and 404 for an unknown one", async () => {
    await handleSend("good-token", body("status-0123456789ab"), deps);
    const found = await handleStatus("good-token", "status-0123456789ab", deps);
    expect(found.status).toBe(200);
    expect(found.body.sent).toBe(true);
    expect((await handleStatus("good-token", "never-seen-0123456789", deps)).status).toBe(404);
  });

  it("requires authentication to read a status", async () => {
    expect((await handleStatus(undefined, "x", deps)).status).toBe(401);
  });
});

/**
 * Found by reading the store rather than by a failing test, 27 October, after
 * the rest of Stage 1 was already pushed: `lookup` took a key and nothing
 * else, so any authenticated user could read the outcome of any key — whether
 * it was sent, and Zoho's identifier for it. The office is one team and the
 * keys are long random strings, so this is small; it is also the kind of thing
 * that is free to close now and awkward later, once a second deployment shares
 * a store.
 */
describe("one user cannot read or take another user's key", () => {
  const second = { userId: "office-2", approvedSenders: senders };
  const twoUserAuth: Authenticator = {
    async authenticate(token) {
      if (token === "good-token") return user;
      if (token === "other-token") return second;
      return undefined;
    },
  };

  beforeEach(() => {
    deps = { auth: twoUserAuth, store, zoho, limits: DEFAULT_LIMITS };
  });

  it("does not show the second user the first user's settled send", async () => {
    const key = "shared-0123456789abcdef";
    await handleSend("good-token", body(key), deps);

    const mine = await handleStatus("good-token", key, deps);
    expect(mine.status).toBe(200);
    expect(mine.body.sent).toBe(true);

    const theirs = await handleStatus("other-token", key, deps);
    expect(theirs.status).toBe(404);
    expect(JSON.stringify(theirs.body)).not.toContain("fake-1");
  });

  it("refuses the second user's send on a key the first user owns, and sends nothing", async () => {
    const key = "shared-0123456789abcdef";
    await handleSend("good-token", body(key), deps);
    zoho.sent.length = 0;

    const res = await handleSend("other-token", body(key), deps);
    expect(res.status).toBe(409);
    // Not "already sent" and no provider id: the refusal says nothing about
    // the other user's message.
    expect(JSON.stringify(res.body)).not.toContain("fake-1");
    expect(JSON.stringify(res.body)).not.toContain("deduplicated");
    expect(zoho.sent).toEqual([]);
  });

  it("still deduplicates the owner's own retry", async () => {
    const key = "shared-0123456789abcdef";
    await handleSend("good-token", body(key), deps);
    zoho.sent.length = 0;

    const again = await handleSend("good-token", body(key), deps);
    expect(again.status).toBe(200);
    expect(again.body.deduplicated).toBe(true);
    expect(zoho.sent).toEqual([]);
  });
});
