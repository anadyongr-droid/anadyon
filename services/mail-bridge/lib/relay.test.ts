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
    expect(store.audit).toHaveLength(1);
  });

  it("records attribution without the subject text", async () => {
    await handleSend("good-token", body(), deps);
    const record = store.audit[0];
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

  it("a RETRYABLE failure releases the key so a genuine retry can proceed", async () => {
    const failing = new FakeZohoMailClient({ ok: false, failure: "upstream 503", retryable: true });
    const first = await handleSend("good-token", body("retry-key-0123456789"), { ...deps, zoho: failing });
    expect(first.status).toBe(502);
    expect(first.body.retryable).toBe(true);
    const second = await handleSend("good-token", body("retry-key-0123456789"), deps);
    expect(second.status).toBe(200);
    expect(second.body.deduplicated).toBeUndefined();
  });

  it("a PERMANENT failure is settled, so a retry gets the same answer not a second attempt", async () => {
    const failing = new FakeZohoMailClient({ ok: false, failure: "rejected", retryable: false });
    const d = { ...deps, zoho: failing };
    await handleSend("good-token", body("perm-key-0123456789"), d);
    const again = await handleSend("good-token", body("perm-key-0123456789"), d);
    expect(again.body.deduplicated).toBe(true);
    expect(failing.sent).toHaveLength(1);
  });
});

describe("the rate limit is counted before a key is spent", () => {
  it("refuses past the limit, and sends nothing", async () => {
    const limits = { ...DEFAULT_LIMITS, maxSendsPerWindow: 2 };
    const d = { ...deps, limits };
    await handleSend("good-token", body("k1-0123456789abcdef"), d);
    await handleSend("good-token", body("k2-0123456789abcdef"), d);
    const before = zoho.sent.length;
    const third = await handleSend("good-token", body("k3-0123456789abcdef"), d);
    expect(third.status).toBe(429);
    expect(zoho.sent).toHaveLength(before);
  });

  it("does not consume the idempotency key when refusing", async () => {
    // Otherwise the user's later retry would be answered "already settled" and
    // they would never learn the real reason.
    const limits = { ...DEFAULT_LIMITS, maxSendsPerWindow: 0 };
    const refused = await handleSend("good-token", body("unspent-0123456789"), { ...deps, limits });
    expect(refused.status).toBe(429);
    const later = await handleSend("good-token", body("unspent-0123456789"), deps);
    expect(later.status).toBe(200);
  });
});

describe("failures never leak upstream detail", () => {
  it("does not return the provider's message", async () => {
    const failing = new FakeZohoMailClient({ ok: false, failure: "token xyzsecret expired at host internal.zoho", retryable: false });
    const res = await handleSend("good-token", body(), { ...deps, zoho: failing });
    expect(JSON.stringify(res.body)).not.toContain("xyzsecret");
    expect(JSON.stringify(res.body)).not.toContain("internal.zoho");
  });

  it("treats a thrown client as retryable transport, not a verdict", async () => {
    const throwing: ZohoMailClient = { send: async () => { throw new Error("ECONNRESET"); } };
    const res = await handleSend("good-token", body("throw-0123456789ab"), { ...deps, zoho: throwing });
    expect(res.status).toBe(502);
    expect(JSON.stringify(res.body)).not.toContain("ECONNRESET");
    // released, so a retry works
    expect((await handleSend("good-token", body("throw-0123456789ab"), deps)).status).toBe(200);
  });
});

describe("audit failure blocks, and says what to check", () => {
  it("returns 500 and tells the user to verify in Zoho rather than resending", async () => {
    store.auditBroken = true;
    const res = await handleSend("good-token", body("audit-0123456789ab"), deps);
    expect(res.status).toBe(500);
    expect(String(res.body.error)).toContain("Sent folder");
  });

  it("settles the key, so a retry cannot send a second copy", async () => {
    store.auditBroken = true;
    await handleSend("good-token", body("audit2-0123456789ab"), deps);
    store.auditBroken = false;
    const retry = await handleSend("good-token", body("audit2-0123456789ab"), deps);
    expect(retry.body.deduplicated).toBe(true);
    expect(zoho.sent).toHaveLength(1);
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
