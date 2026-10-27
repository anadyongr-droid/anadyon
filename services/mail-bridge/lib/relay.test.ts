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

describe("an expired claim is resolved, NEVER re-admitted — re-review finding 1", () => {
  it("answers a lease-expired key as unknown, and does not send again", async () => {
    // The first fix for finding 7 made an expired claim re-admittable, so a
    // lease timeout automatically permitted a second send — the same defect as
    // finding 1, reintroduced by the mechanism meant to close finding 7. The
    // previous worker may already have reached Zoho, and a fencing token is
    // local: Zoho has no idea the second send is a duplicate.
    //
    // The test this replaces started a stalled provider call and then asserted
    // that a second send WAS admitted. It asserted the bug.
    const leased = new InMemoryBridgeStore(1000);
    const stalled: ZohoMailClient = { send: () => new Promise(() => {}) };
    const sentCount = { n: 0 };
    const counting: ZohoMailClient = {
      send: async () => {
        sentCount.n += 1;
        return { ok: true, delivery: "sent", providerMessageId: "zm-1", savedToSent: true };
      },
    };

    void handleSend("good-token", body("lease-0123456789ab"), { ...deps, store: leased, zoho: stalled });
    await new Promise((r) => setTimeout(r, 5));

    // Inside the lease: refused as in-flight.
    expect((await handleSend("good-token", body("lease-0123456789ab"), { ...deps, store: leased, zoho: counting })).status).toBe(409);

    await new Promise((r) => setTimeout(r, 1100));

    // Past the lease: a definite answer, not permission to send.
    const after = await handleSend("good-token", body("lease-0123456789ab"), { ...deps, store: leased, zoho: counting });
    expect(after.status).toBe(502);
    expect(after.body.sent).toBeUndefined();
    expect(after.body.delivery).toBe("unknown");
    expect(String(after.body.error)).toContain("Sent folder");
    // The whole point: the second worker did not call Zoho.
    expect(sentCount.n).toBe(0);
  });

  it("keeps answering unknown rather than drifting back to sendable", async () => {
    const leased = new InMemoryBridgeStore(50);
    const stalled: ZohoMailClient = { send: () => new Promise(() => {}) };
    void handleSend("good-token", body("lease2-0123456789ab"), { ...deps, store: leased, zoho: stalled });
    await new Promise((r) => setTimeout(r, 120));

    for (let i = 0; i < 3; i += 1) {
      const res = await handleSend("good-token", body("lease2-0123456789ab"), { ...deps, store: leased });
      expect(res.status).toBe(502);
      expect(res.body.delivery).toBe("unknown");
    }
    expect(zoho.sent).toEqual([]);
  });

  it("still stops a message being stranded in silence — the answer is definite", async () => {
    // Finding 7's complaint was that a dead worker left every retry on 409
    // forever, with no information. That is fixed: the key now reaches a
    // settled, explicit `unknown` with instructions.
    const leased = new InMemoryBridgeStore(10);
    const stalled: ZohoMailClient = { send: () => new Promise(() => {}) };
    void handleSend("good-token", body("lease3-0123456789ab"), { ...deps, store: leased, zoho: stalled });
    await new Promise((r) => setTimeout(r, 30));
    const res = await handleSend("good-token", body("lease3-0123456789ab"), { ...deps, store: leased });
    expect(res.status).not.toBe(409);
    expect(res.body.delivery).toBe("unknown");
  });

  it("will not let a stale holder settle or release a claim somebody else holds", async () => {
    const leased = new InMemoryBridgeStore(50);
    const first = await leased.admit("fence-key", "office-1", DEFAULT_LIMITS, 0);
    expect(first.state).toBe("claimed");
    const staleToken = first.state === "claimed" ? first.token : "";

    // The lease expiry now settles the key rather than handing it over, so the
    // stale holder's token is stale against a SETTLED entry.
    const after = await leased.admit("fence-key", "office-1", DEFAULT_LIMITS, 1000);
    expect(after.state).toBe("settled");

    await expect(
      leased.recordOutcome({ idempotencyKey: "fence-key", delivery: "sent", at: 1001 }, staleToken),
    ).rejects.toThrow(/fencing/);
    await leased.release("fence-key", staleToken);
    // Still settled: a stale release cannot resurrect it into sendability.
    expect((await leased.admit("fence-key", "office-1", DEFAULT_LIMITS, 1002)).state).toBe("settled");
  });
});

describe("releasing an attempt withdraws its OWN admission — re-review finding 2", () => {
  /**
   * **This describe block is itself a lesson.** The first version of these
   * tests drove the relay and asserted how many sends got through. They passed
   * against the broken store, because removing the wrong admission and removing
   * the right one leave the same *number* of admissions — so the count-based
   * assertion could not tell them apart. It was a test that looked like it
   * covered the defect and did not, which is the exact failure mode asked of
   * Codex on the previous round and the third time this project has recorded
   * it. It was found by re-breaking the fix and watching nothing fail.
   *
   * What distinguishes the two is **which** admission survives, and that only
   * becomes visible as the rolling window decays: the wrong one removed leaves
   * a *newer* admission in the window, so the user's allowance frees up later
   * than it should. Hence these go at the store, with the clock supplied.
   */
  const limits = { ...DEFAULT_LIMITS, maxSendsPerWindow: 2, windowMs: 1000 };

  it("leaves the real send's admission in the window, not the released one's", async () => {
    const s = new InMemoryBridgeStore();

    // A genuine send at t=0, which must keep counting until t=1000.
    const real = await s.admit("real", "u", limits, 0);
    expect(real.state).toBe("claimed");

    // An attempt at t=100 that never reaches the provider, and is withdrawn.
    const never = await s.admit("never", "u", limits, 100);
    expect(never.state).toBe("claimed");
    await s.release("never", never.state === "claimed" ? never.token : "");

    // A second genuine send at t=150.
    expect((await s.admit("real2", "u", limits, 150)).state).toBe("claimed");

    // At t=1050 the t=0 send has aged out of the window and the t=150 one has
    // not, so exactly one admission should remain and a third send is allowed.
    //
    // Against the broken store the surviving pair is the WITHDRAWN attempt
    // (t=100) plus real2 (t=150) — neither aged out — so this is refused.
    expect((await s.admit("real3", "u", limits, 1050)).state).toBe("claimed");
  });

  it("frees the allowance at the right time after several withdrawals", async () => {
    const s = new InMemoryBridgeStore();
    await s.admit("r1", "u", limits, 0);

    // Two withdrawn attempts, both later than the real send.
    for (const [key, at] of [["n1", 200], ["n2", 400]] as const) {
      const a = await s.admit(key, "u", limits, at);
      await s.release(key, a.state === "claimed" ? a.token : "");
    }

    // One real send inside the window, putting the user at the limit of 2.
    await s.admit("r2", "u", limits, 500);
    expect((await s.admit("r3", "u", limits, 600)).state).toBe("rate_limited");

    // Once r1 ages out, exactly one slot should reopen.
    expect((await s.admit("r3", "u", limits, 1001)).state).toBe("claimed");
  });

  it("withdraws nothing when the token is stale", async () => {
    const s = new InMemoryBridgeStore();
    expect((await s.admit("k", "u", limits, 0)).state).toBe("claimed");
    await s.release("k", "not-the-token");
    // Still claimed, so still counted.
    expect((await s.admit("k", "u", limits, 10)).state).toBe("in_flight");
  });

  it("does not spend the allowance on attempts that never happened", async () => {
    // The user-visible half of the same property, kept because it is the
    // behaviour that matters even though it does not distinguish the defect.
    const l = { ...DEFAULT_LIMITS, maxSendsPerWindow: 3 };
    const never = new FakeZohoMailClient({ ok: false, delivery: "not_attempted", failure: "no token" });
    for (const key of ["n1-0123456789abcdef", "n2-0123456789abcdef", "n3-0123456789abcdef"]) {
      await handleSend("good-token", body(key), { ...deps, limits: l, zoho: never });
    }
    for (const key of ["s1-0123456789abcdef", "s2-0123456789abcdef", "s3-0123456789abcdef"]) {
      expect((await handleSend("good-token", body(key), { ...deps, limits: l })).status).toBe(200);
    }
    expect(zoho.sent).toHaveLength(3);
  });
});

describe("the other two endpoints", () => {
  it("lists only the authenticated user's senders", async () => {
    const res = await handleListSenders("good-token", deps);
    expect(res.status).toBe(200);
    expect(res.body.senders).toEqual(senders);
    expect((await handleListSenders(undefined, deps)).status).toBe(401);
  });

  it("reports a settled send by key, and 404 for a key nobody submitted", async () => {
    await handleSend("good-token", body("status-0123456789ab"), deps);
    const found = await handleStatus("good-token", "status-0123456789ab", deps);
    expect(found.status).toBe(200);
    expect(found.body.state).toBe("sent");
    expect(found.body.sent).toBe(true);

    const missing = await handleStatus("good-token", "never-seen-0123456789", deps);
    expect(missing.status).toBe(404);
    expect(missing.body.state).toBe("unknown_key");
  });

  it("requires authentication to read a status", async () => {
    expect((await handleStatus(undefined, "x", deps)).status).toBe(401);
  });
});

/**
 * Found by self-audit, 27 October. The status endpoint had the defect the whole
 * send path was rebuilt to avoid: it answered an `unknown` delivery with
 * `200 { sent: false }` — a flat statement that the message was not sent, about
 * the one outcome meaning *we cannot tell*. Anyone acting on it would resend.
 * And it answered 404 both for a key nobody had claimed and for one still in
 * flight, so a person checking on a send in progress was told it did not exist.
 */
describe("the status endpoint never says not-sent about an unknown", () => {
  it("omits `sent` entirely for an unknown delivery, and says what to do", async () => {
    const throwing: ZohoMailClient = { send: async () => { throw new Error("ECONNRESET"); } };
    await handleSend("good-token", body("unk-0123456789abcd"), { ...deps, zoho: throwing });

    const res = await handleStatus("good-token", "unk-0123456789abcd", deps);
    expect(res.status).toBe(200);
    expect(res.body.state).toBe("unknown");
    // The important assertion: not `false`, ABSENT. There is no honest value.
    expect("sent" in res.body).toBe(false);
    expect(String(res.body.guidance)).toContain("Sent folder");
  });

  it("distinguishes a send still in flight from a key nobody submitted", async () => {
    const stalled: ZohoMailClient = { send: () => new Promise(() => {}) };
    void handleSend("good-token", body("flight-0123456789ab"), { ...deps, zoho: stalled });
    await new Promise((r) => setTimeout(r, 5));

    const inFlight = await handleStatus("good-token", "flight-0123456789ab", deps);
    expect(inFlight.status).toBe(200);
    expect(inFlight.body.state).toBe("in_flight");
    expect("sent" in inFlight.body).toBe(false);
    expect(String(inFlight.body.guidance)).toContain("Wait rather than resending");

    const unknownKey = await handleStatus("good-token", "nothing-0123456789ab", deps);
    expect(unknownKey.status).toBe(404);
    expect(unknownKey.body.state).toBe("unknown_key");
  });

  it("does say not-sent when the answer is definite", async () => {
    const rejecting = new FakeZohoMailClient({ ok: false, delivery: "rejected", failure: "no" });
    await handleSend("good-token", body("rej-0123456789abcd"), { ...deps, zoho: rejecting });
    const res = await handleStatus("good-token", "rej-0123456789abcd", deps);
    expect(res.body.state).toBe("not_sent");
    expect(res.body.sent).toBe(false);
  });

  it("shows another user's key as unknown rather than as in flight or settled", async () => {
    const second = { userId: "office-2", approvedSenders: senders };
    const twoUser: Authenticator = {
      async authenticate(t) {
        if (t === "good-token") return user;
        if (t === "other-token") return second;
        return undefined;
      },
    };
    const d = { ...deps, auth: twoUser };
    await handleSend("good-token", body("mine-0123456789abcd"), d);
    const theirs = await handleStatus("other-token", "mine-0123456789abcd", d);
    expect(theirs.status).toBe(404);
    expect(theirs.body.state).toBe("unknown_key");
    expect(JSON.stringify(theirs.body)).not.toContain("fake-1");
  });
});

/**
 * Codex's third review, finding 2. Lease expiry was evaluated only inside
 * `admit`, so a worker that crashed mid-send left the status endpoint saying
 * `in_flight` for ever — and `handleStatus` turns that into "still being sent,
 * wait rather than resending". A message nobody will ever send, telling the
 * office to keep waiting, indefinitely.
 */
describe("a crashed send does not read as in progress for ever", () => {
  it("resolves an expired claim on a STATUS read, with no send attempt in between", async () => {
    const leased = new InMemoryBridgeStore(1000);
    const stalled: ZohoMailClient = { send: () => new Promise(() => {}) };
    let clock = 0;
    const d = { ...deps, store: leased, now: () => clock };

    void handleSend("good-token", body("crash-0123456789ab"), { ...d, zoho: stalled });
    await new Promise((r) => setTimeout(r, 5));

    // Inside the lease the honest answer is "wait".
    const during = await handleStatus("good-token", "crash-0123456789ab", d);
    expect(during.body.state).toBe("in_flight");

    // Past it, WITHOUT anybody attempting another send, the answer changes.
    clock = 5000;
    const after = await handleStatus("good-token", "crash-0123456789ab", d);
    expect(after.body.state).toBe("unknown");
    expect("sent" in after.body).toBe(false);
    expect(String(after.body.guidance)).toContain("Sent folder");
  });

  it("agrees with the send path about the same expired claim", async () => {
    // The two disagreeing is the defect. One resolver, one answer.
    const leased = new InMemoryBridgeStore(1000);
    const stalled: ZohoMailClient = { send: () => new Promise(() => {}) };
    let clock = 0;
    const d = { ...deps, store: leased, now: () => clock };

    void handleSend("good-token", body("agree-0123456789ab"), { ...d, zoho: stalled });
    await new Promise((r) => setTimeout(r, 5));
    clock = 5000;

    const viaStatus = await handleStatus("good-token", "agree-0123456789ab", d);
    const viaSend = await handleSend("good-token", body("agree-0123456789ab"), d);
    expect(viaStatus.body.state).toBe("unknown");
    expect(viaSend.body.delivery).toBe("unknown");
    expect(zoho.sent).toEqual([]);
  });

  it("does not resolve a claim that is still inside its lease", async () => {
    const leased = new InMemoryBridgeStore(10_000);
    const stalled: ZohoMailClient = { send: () => new Promise(() => {}) };
    const d = { ...deps, store: leased, now: () => 0 };
    void handleSend("good-token", body("live-0123456789abc"), { ...d, zoho: stalled });
    await new Promise((r) => setTimeout(r, 5));
    expect((await handleStatus("good-token", "live-0123456789abc", d)).body.state).toBe("in_flight");
  });
});

describe("the fencing token is checked on a LIVE claim, not only a settled one", () => {
  it("refuses a wrong token against an in-flight claim", async () => {
    // The mutation sweep found this unasserted: the earlier test exercised the
    // settle-once path, so removing the token comparison changed nothing.
    const s = new InMemoryBridgeStore();
    const admitted = await s.admit("k", "u", DEFAULT_LIMITS, 0);
    expect(admitted.state).toBe("claimed");

    await expect(
      s.recordOutcome({ idempotencyKey: "k", delivery: "sent", at: 1 }, "wrong-token"),
    ).rejects.toThrow(/fencing/);

    // Still in flight: the wrong token changed nothing.
    expect((await s.inspect("k", "u", 1)).state).toBe("in_flight");

    // And the right one works.
    const token = admitted.state === "claimed" ? admitted.token : "";
    await s.recordOutcome({ idempotencyKey: "k", delivery: "sent", providerMessageId: "zm", at: 2 }, token);
    expect((await s.inspect("k", "u", 2)).state).toBe("settled");
  });
});

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
