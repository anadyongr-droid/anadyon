import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Script } from "node:vm";
import { describe, expect, it } from "vitest";
// Plain MV3 JavaScript with JSDoc, deliberately not TypeScript: these files
// are loaded by Chrome as they are, with no build step between.
import { RELAY_CALLS, createRelayClient } from "./relayClient.js";
import { FALLBACK_MESSAGE, newIdempotencyKey, submitCorporateSend } from "./corporateSend.js";

const here = new URL(".", import.meta.url).pathname;
const read = (name: string) => readFileSync(`${here}${name}`, "utf8");

/**
 * The manifest and the script forms are asserted rather than reviewed, because
 * both failures are silent: a widened permission is one word in a diff nobody
 * re-reads, and an ES module in a content script simply never runs.
 */
describe("the manifest stays as narrow as it was argued to be", () => {
  const manifest = JSON.parse(read("manifest.json"));

  it("asks for storage and nothing else", () => {
    expect(manifest.permissions).toEqual(["storage"]);
  });

  it("can reach Gmail and exactly one relay origin, and nothing else", () => {
    // **Review finding 3.** Chrome's documentation: a service worker "can talk
    // to remote servers outside of its origin, as long as the extension
    // requests host permissions". Without the relay host granted, the send is
    // an ordinary cross-origin request that works only while the relay's CORS
    // headers are right — a dependency nobody should take on a send path. So
    // the grant is a deliberate widening, and this test holds it to two
    // entries rather than letting the next one in unnoticed.
    expect(manifest.host_permissions).toHaveLength(2);
    expect(manifest.host_permissions[0]).toBe("https://mail.google.com/*");
    const relay = manifest.host_permissions[1];
    expect(relay).toMatch(/^https:\/\/[a-z0-9.-]+\/\*$/);
    expect(relay).not.toContain("*.");
    // The content script still only runs on Gmail: the relay host is a fetch
    // destination, not a page to inject into.
    expect(manifest.content_scripts.map((s: { matches: string[] }) => s.matches)).toEqual([
      ["https://mail.google.com/*"],
    ]);
  });

  it("grants no wildcard or plaintext host", () => {
    for (const host of manifest.host_permissions as string[]) {
      expect(host.startsWith("https://")).toBe(true);
      expect(host).not.toContain("<all_urls>");
      expect(host).not.toMatch(/^https:\/\/\*/);
    }
  });

  it("grants host permission for the same origin the worker is compiled with", () => {
    const worker = read("background.js");
    const match = /const RELAY_ORIGIN = "(https:\/\/[^"]+)"/.exec(worker);
    expect(match).not.toBeNull();
    const origin = new URL(match![1]).origin;
    expect(manifest.host_permissions).toContain(`${origin}/*`);
  });

  it("declares no optional permissions, which would be a request at runtime nobody reviews", () => {
    expect(manifest.optional_permissions).toBeUndefined();
    expect(manifest.optional_host_permissions).toBeUndefined();
  });

  it("holds the CSP to its own scripts", () => {
    expect(manifest.content_security_policy.extension_pages).toContain("script-src 'self'");
  });

  it("is MV3, because MV2 keeps background pages and blocking requests", () => {
    expect(manifest.manifest_version).toBe(3);
  });

  it("names every script file it declares, so a renamed file fails here", () => {
    expect(() => read(manifest.background.service_worker)).not.toThrow();
    for (const script of manifest.content_scripts) {
      for (const file of script.js) expect(() => read(file)).not.toThrow();
    }
  });
});

describe("content.js must stay a classic script", () => {
  const source = read("content.js");

  it("parses as one — an MV3 content script is not a module", () => {
    expect(() => new Script(source)).not.toThrow();
  });

  it("has no top-level import or export, which would be a syntax error in the page", () => {
    // The 26 October skeleton had `export`, and would have failed silently:
    // the script never runs, so nothing appears in the extension's own log.
    expect(/^\s*(import|export)\b/m.test(source)).toBe(false);
  });

  it("the service worker, by contrast, is declared as a module and may import", () => {
    const manifest = JSON.parse(read("manifest.json"));
    expect(manifest.background.type).toBe("module");
    expect(read("background.js")).toContain('from "./relayClient.js"');
  });

  it("the worker holds an https relay origin and does not read it from storage", () => {
    const source = read("background.js");
    expect(source).toMatch(/const RELAY_ORIGIN = "https:\/\//);
    expect(source).not.toMatch(/storage\.(local|sync)\.get\(\s*["']relayOrigin/);
  });

  it("the session is in session storage, so a locked machine cannot send in the morning", () => {
    expect(read("background.js")).toContain("chrome.storage.session.get");
    expect(read("background.js")).not.toContain("chrome.storage.local.get");
  });
});

describe("the relay client", () => {
  type Call = { url: string; init: Record<string, unknown> };

  const client = (
    response: { ok?: boolean; status?: number; body?: unknown } | Error = { ok: true, status: 200, body: {} },
    session: string | null = "sess-1",
  ) => {
    const calls: Call[] = [];
    const fetchImpl = async (url: string, init: Record<string, unknown>) => {
      calls.push({ url, init });
      if (response instanceof Error) throw response;
      return {
        ok: response.ok ?? true,
        status: response.status ?? 200,
        json: async () => response.body ?? {},
      };
    };
    return {
      calls,
      client: createRelayClient({ origin: "https://relay.example", fetchImpl, getSession: async () => session }),
    };
  };

  it("refuses a plaintext origin at construction, not per call", () => {
    expect(() =>
      createRelayClient({ origin: "http://relay.example", fetchImpl: async () => ({}), getSession: async () => "s" }),
    ).toThrow(/https/);
  });

  it("knows exactly three calls", () => {
    expect(Object.keys(RELAY_CALLS).sort()).toEqual(["listSenders", "status", "submit"]);
  });

  it("refuses an unknown kind without reaching the network", async () => {
    const { calls, client: c } = client();
    const result = await c.call({ kind: "deleteEverything" });
    expect(result.ok).toBe(false);
    expect(calls).toEqual([]);
  });

  it("refuses when there is no session, without reaching the network", async () => {
    const { calls, client: c } = client({ ok: true }, null);
    const result = await c.call({ kind: "submit", payload: {} });
    expect(result.ok).toBe(false);
    expect(String((result.body as Record<string, unknown>).error)).toContain("not signed in");
    expect(calls).toEqual([]);
  });

  it("sends the bearer token and never a cookie", async () => {
    const { calls, client: c } = client();
    await c.call({ kind: "submit", payload: { subject: "x" } });
    expect(calls[0].init.headers).toMatchObject({ authorization: "Bearer sess-1" });
    expect(calls[0].init.credentials).toBe("omit");
  });

  it("refuses to follow a redirect, so the token cannot be replayed elsewhere", async () => {
    const { calls, client: c } = client();
    await c.call({ kind: "submit", payload: {} });
    expect(calls[0].init.redirect).toBe("error");
  });

  it("puts the idempotency key in the query string for a status read, encoded", async () => {
    const { calls, client: c } = client();
    await c.call({ kind: "status", idempotencyKey: "a b&c" });
    expect(calls[0].url).toBe("https://relay.example/status?idempotencyKey=a%20b%26c");
    expect(calls[0].init.body).toBeUndefined();
  });

  it("refuses a status read with no key rather than reading someone else's", async () => {
    const { calls, client: c } = client();
    expect((await c.call({ kind: "status" })).ok).toBe(false);
    expect(calls).toEqual([]);
  });

  it("declares a content type only on the post", async () => {
    const { calls, client: c } = client();
    await c.call({ kind: "listSenders" });
    expect(calls[0].init.headers).not.toHaveProperty("content-type");
    await c.call({ kind: "submit", payload: {} });
    expect(calls[1].init.headers).toHaveProperty("content-type", "application/json");
  });

  it("says nothing about a thrown fetch, which carries the url and sometimes the headers", async () => {
    const { client: c } = client(new Error("failed to fetch https://relay.example with Bearer sess-1"));
    const result = await c.call({ kind: "submit", payload: {} });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("sess-1");
    expect(JSON.stringify(result)).not.toContain("relay.example");
  });

  it("survives a non-JSON response rather than throwing into the page", async () => {
    const { client: c } = client({ ok: false, status: 502, body: undefined });
    const result = await c.call({ kind: "submit", payload: {} });
    expect(result).toMatchObject({ ok: false, status: 502 });
  });
});

describe("only the relay's own sent flag counts as a send — review finding 4", () => {
  const answering = (status: number, body: unknown, httpOk = true) => {
    const fetchImpl = async () => ({ ok: httpOk, status, json: async () => body });
    return createRelayClient({ origin: "https://relay.example", fetchImpl, getSession: async () => "s" });
  };

  it("rejects a 200 with an empty body, and marks it unrecognised", async () => {
    const result = await answering(200, {}).call({ kind: "submit", payload: {} });
    expect(result.ok).toBe(false);
    expect(result.unrecognised).toBe(true);
  });

  it("rejects a 200 whose body is not the relay's shape", async () => {
    for (const body of [null, [], "sent", 1, { sent: "true" }, { sent: 1 }]) {
      const result = await answering(200, body).call({ kind: "submit", payload: {} });
      expect(result.ok).toBe(false);
    }
  });

  it("rejects a 200 that is not JSON at all, which is what a captive portal returns", async () => {
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("Unexpected token < in JSON");
      },
    });
    const c = createRelayClient({ origin: "https://relay.example", fetchImpl, getSession: async () => "s" });
    const result = await c.call({ kind: "submit", payload: {} });
    expect(result.ok).toBe(false);
    expect(result.unrecognised).toBe(true);
  });

  it("accepts a 200 that does carry sent: true", async () => {
    const result = await answering(200, { sent: true }).call({ kind: "submit", payload: {} });
    expect(result.ok).toBe(true);
    expect(result.unrecognised).toBe(false);
  });

  it("does not require sent: true on the read endpoints, only a JSON object", async () => {
    expect((await answering(200, { senders: [] }).call({ kind: "listSenders" })).ok).toBe(true);
    expect((await answering(200, "nope").call({ kind: "listSenders" })).ok).toBe(false);
  });

  it("does not mark a genuine 4xx unrecognised — that is the relay answering", async () => {
    const result = await answering(400, { error: "Rejected." }, false).call({ kind: "submit", payload: {} });
    expect(result.ok).toBe(false);
    expect(result.unrecognised).toBe(false);
  });
});

describe("the corporate send never falls back to Gmail's own Send", () => {
  const press = (
    reply: { ok?: boolean; status?: number; body?: Record<string, unknown> } | Error,
    key = "abcdef0123456789abcdef0123456789",
  ) => {
    const seen: unknown[] = [];
    const send = async (message: unknown) => {
      seen.push(message);
      if (reply instanceof Error) throw reply;
      return reply;
    };
    return { seen, run: () => submitCorporateSend({ subject: "Your booking" }, { send, idempotencyKey: key }) };
  };

  it("reports a send on success and passes the key through", async () => {
    const { seen, run } = press({ ok: true, status: 200, body: { sent: true, providerMessageId: "zm-1" } });
    const result = await run();
    expect(result).toMatchObject({ sent: true, providerMessageId: "zm-1" });
    expect(seen[0]).toMatchObject({ kind: "submit", payload: { idempotencyKey: "abcdef0123456789abcdef0123456789" } });
  });

  it("reports not-sent on every failure shape, and never sent: true", async () => {
    for (const reply of [
      { ok: false, status: 400, body: { error: "Rejected." } },
      { ok: false, status: 401, body: { error: "Not authenticated." } },
      { ok: false, status: 429, body: { error: "Send limit reached for this period." } },
      { ok: false, status: 500, body: {} },
      { ok: false, status: 503, body: { error: "Bridge sending is disabled." } },
      new Error("the messenger exploded"),
    ]) {
      const result = await press(reply).run();
      expect(result.sent).toBe(false);
      expect(result.key).toBe("abcdef0123456789abcdef0123456789");
    }
  });

  it("shows the relay's own refusal, because it names the rule that was broken", async () => {
    const result = await press({ ok: false, status: 503, body: { error: "Bridge sending is disabled." } }).run();
    expect(result.message).toBe("Bridge sending is disabled.");
  });

  it("falls back to the fixed message when the relay said nothing useful", async () => {
    expect((await press({ ok: false, status: 500, body: {} }).run()).message).toBe(FALLBACK_MESSAGE);
    expect((await press(new Error("boom")).run()).message).toBe(FALLBACK_MESSAGE);
  });

  it("names Zoho webmail in that message, which is the thing that always works", () => {
    expect(FALLBACK_MESSAGE).toContain("Zoho webmail");
    expect(FALLBACK_MESSAGE).toContain("draft is kept");
  });

  it("marks in-flight retryable, and only trusts the relay's own retryable flag otherwise", async () => {
    expect((await press({ ok: false, status: 409, body: {} }).run()).retryable).toBe(true);
    // The relay says so explicitly when the request was never made.
    expect((await press({ ok: false, status: 502, body: { retryable: true } }).run()).retryable).toBe(true);
    // A bare 502 is NOT retryable any more: it may be an unknown delivery.
    expect((await press({ ok: false, status: 502, body: {} }).run()).retryable).toBe(false);
    expect((await press({ ok: false, status: 400, body: {} }).run()).retryable).toBe(false);
    expect((await press({ ok: false, status: 401, body: {} }).run()).retryable).toBe(false);
  });

  it("never offers a retry on an UNKNOWN delivery, and says to check Sent — review finding 1", async () => {
    const result = await press({ ok: false, status: 502, body: { delivery: "unknown" } }).run();
    expect(result.sent).toBe(false);
    expect(result.retryable).toBe(false);
    expect(result.message).toContain("Sent folder");
    expect(result.message).toContain("do not resend");
  });

  it("does not treat a 2xx without the relay's own sent flag as a send — review finding 4", async () => {
    // A captive portal, a proxy courtesy page or an empty 200 all satisfied the
    // first version's `response.ok`, and the user was told the message had gone.
    for (const body of [{}, { ok: true }, { status: "fine" }, { sent: "yes" }, { sent: 1 }]) {
      const result = await press({ ok: false, status: 200, body, unrecognised: true } as never).run();
      expect(result.sent).toBe(false);
      expect(result.retryable).toBe(false);
      expect(result.message).toContain("NOT sent");
    }
  });

  it("reuses the key on a retry of the same press, so the relay can deduplicate", async () => {
    const first = await press({ ok: false, status: 502, body: {} }).run();
    const retry = await press({ ok: true, status: 200, body: { sent: true, deduplicated: true } }, first.key).run();
    expect(retry).toMatchObject({ sent: true, deduplicated: true, key: first.key });
  });

  it("requires sent: true even if the messenger claims ok — defence in depth", async () => {
    // Found by mutation sweep: relayClient already guarantees ok implies
    // sent: true, so this layer's own check was unasserted. It matters because
    // the messenger is injected: a different one, or a future change to
    // relayClient, must not be able to turn a non-send into a send here.
    const send = async () => ({ ok: true, status: 200, body: {} });
    const result = await submitCorporateSend({ subject: "x" }, { send, idempotencyKey: "abcdef0123456789abcdef0123456789" });
    expect(result.sent).toBe(false);

    const lying = async () => ({ ok: true, status: 200, body: { sent: "yes" } });
    expect((await submitCorporateSend({ subject: "x" }, { send: lying, idempotencyKey: "abcdef0123456789abcdef0123456789" })).sent).toBe(false);
  });

  it("mentions neither Gmail's send nor any fallback path in its source", () => {
    const source = read("corporateSend.js");
    // A guard against the convenient edit, not a proof: the tests above are
    // the proof. This catches the shape of change that would add one.
    expect(source).not.toMatch(/nativeSend|gmailSend|document\.querySelector/);
  });
});

describe("the idempotency key", () => {
  it("is 32 hex characters, inside the relay's 16-200 url-safe range", () => {
    const key = newIdempotencyKey({ getRandomValues: (b: Uint8Array) => b.fill(7) });
    expect(key).toMatch(/^[0-9a-f]{32}$/);
  });

  it("refuses to exist without a cryptographic source, rather than using Math.random", () => {
    expect(() => newIdempotencyKey({} as never)).toThrow(/random/);
  });

  it("differs between presses", () => {
    const real = createRequire(import.meta.url)("node:crypto").webcrypto;
    expect(newIdempotencyKey(real)).not.toBe(newIdempotencyKey(real));
  });
});
