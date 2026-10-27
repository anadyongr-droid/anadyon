import { beforeEach, describe, expect, it } from "vitest";
import { MAX_BODY_BYTES, bearerToken, byteLength, handleHttp, type HttpRequest, type TransportOptions } from "./http";
import type { Authenticator, RelayDeps } from "./relay";
import { DEFAULT_LIMITS, type ApprovedSender } from "./sendRequest";
import { InMemoryBridgeStore } from "./store";
import { FakeZohoMailClient } from "./zohoClient";

const senders: ApprovedSender[] = [{ address: "customerservice@anadyon.gr", displayName: "Anadyon" }];
const auth: Authenticator = {
  async authenticate(token) {
    return token === "good-token" ? { userId: "office-1", approvedSenders: senders } : undefined;
  },
};

const EXTENSION = "chrome-extension://abcdefghijklmnopabcdefghijklmnop";
const options: TransportOptions = { allowedOrigins: [EXTENSION] };

let store: InMemoryBridgeStore;
let zoho: FakeZohoMailClient;
let deps: RelayDeps;

beforeEach(() => {
  store = new InMemoryBridgeStore();
  zoho = new FakeZohoMailClient();
  deps = { auth, store, zoho, limits: DEFAULT_LIMITS };
});

const sendBody = (key = "idem-0123456789abcdef") =>
  JSON.stringify({
    senderAddress: "customerservice@anadyon.gr",
    to: ["guest@example.com"],
    subject: "Your reservation",
    text: "Kind regards",
    idempotencyKey: key,
  });

const req = (over: Partial<HttpRequest> = {}): HttpRequest => ({
  method: "POST",
  path: "/send",
  query: {},
  headers: { origin: EXTENSION, authorization: "Bearer good-token", "content-type": "application/json" },
  body: sendBody(),
  ...over,
});

describe("the happy path, so the refusals mean something", () => {
  it("routes a well-formed send and sets the no-sniff headers", async () => {
    const res = await handleHttp(req(), deps, options);
    expect(res.status).toBe(200);
    expect(res.body.sent).toBe(true);
    expect(res.headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(res.headers["Cache-Control"]).toBe("no-store");
    expect(zoho.sent).toHaveLength(1);
  });

  it("lists senders and reads a status", async () => {
    await handleHttp(req(), deps, options);
    const senderList = await handleHttp(req({ method: "GET", path: "/senders", body: "" }), deps, options);
    expect(senderList.status).toBe(200);
    const status = await handleHttp(
      req({ method: "GET", path: "/status", body: "", query: { idempotencyKey: "idem-0123456789abcdef" } }),
      deps,
      options,
    );
    expect(status.status).toBe(200);
    expect(status.body.sent).toBe(true);
  });

  it("tolerates a trailing slash and header casing a framework may change", async () => {
    const res = await handleHttp(
      req({
        path: "/send/",
        headers: { Origin: EXTENSION, Authorization: "Bearer good-token", "Content-Type": "application/json" },
      }),
      deps,
      options,
    );
    expect(res.status).toBe(200);
  });
});

describe("the origin check runs before anything else is considered", () => {
  it("refuses an unknown origin and sends nothing", async () => {
    const res = await handleHttp(req({ headers: { ...req().headers, origin: "https://evil.example" } }), deps, options);
    expect(res.status).toBe(403);
    expect(zoho.sent).toEqual([]);
  });

  it("refuses an unknown origin's preflight without naming the methods", async () => {
    const res = await handleHttp(
      req({ method: "OPTIONS", body: "", headers: { origin: "https://evil.example" } }),
      deps,
      options,
    );
    expect(res.status).toBe(403);
    expect(res.headers["Access-Control-Allow-Methods"]).toBeUndefined();
    expect(res.headers["Access-Control-Allow-Origin"]).toBeUndefined();
  });

  it("answers the allowlisted origin's preflight, echoing it and never a wildcard", async () => {
    const res = await handleHttp(req({ method: "OPTIONS", body: "", headers: { origin: EXTENSION } }), deps, options);
    expect(res.status).toBe(204);
    expect(res.headers["Access-Control-Allow-Origin"]).toBe(EXTENSION);
    expect(res.headers["Access-Control-Allow-Origin"]).not.toBe("*");
    expect(res.headers.Vary).toBe("Origin");
  });

  it("never allows credentials, because the relay authenticates by bearer token", async () => {
    const res = await handleHttp(req({ method: "OPTIONS", body: "", headers: { origin: EXTENSION } }), deps, options);
    expect(res.headers["Access-Control-Allow-Credentials"]).toBeUndefined();
  });

  it("permits no cross-origin caller when the allowlist is empty, which is the default before an id exists", async () => {
    const res = await handleHttp(req(), deps, { allowedOrigins: [] });
    expect(res.status).toBe(403);
    expect(zoho.sent).toEqual([]);
  });

  it("allows a request with no Origin at all, which is how a server-side caller and curl arrive", async () => {
    const { origin: _origin, ...headers } = req().headers as Record<string, string>;
    const res = await handleHttp(req({ headers }), deps, options);
    expect(res.status).toBe(200);
    expect(res.headers["Access-Control-Allow-Origin"]).toBeUndefined();
  });

  it("matches the origin exactly, not by prefix", async () => {
    const res = await handleHttp(
      req({ headers: { ...req().headers, origin: `${EXTENSION}.evil.example` } }),
      deps,
      options,
    );
    expect(res.status).toBe(403);
  });
});

describe("a malformed request never reaches the relay", () => {
  it("refuses a form-encoded post, which is how a CSRF attempt arrives", async () => {
    const res = await handleHttp(
      req({ headers: { ...req().headers, "content-type": "application/x-www-form-urlencoded" } }),
      deps,
      options,
    );
    expect(res.status).toBe(415);
    expect(zoho.sent).toEqual([]);
  });

  it("refuses a multipart post for the same reason", async () => {
    const res = await handleHttp(
      req({ headers: { ...req().headers, "content-type": "multipart/form-data; boundary=x" } }),
      deps,
      options,
    );
    expect(res.status).toBe(415);
  });

  it("accepts the charset parameter frameworks append", async () => {
    const res = await handleHttp(
      req({ headers: { ...req().headers, "content-type": "application/json; charset=utf-8" } }),
      deps,
      options,
    );
    expect(res.status).toBe(200);
  });

  it("refuses an oversized body and sends nothing", async () => {
    const res = await handleHttp(req({ body: "x".repeat(MAX_BODY_BYTES + 1) }), deps, options);
    expect(res.status).toBe(413);
    expect(zoho.sent).toEqual([]);
  });

  it("measures the body in bytes, not characters", () => {
    expect(byteLength("abc")).toBe(3);
    // Three bytes each in UTF-8: a character count would under-report by 3x.
    expect(byteLength("ΑΒΓ")).toBe(6);
    expect(byteLength("🙂")).toBe(4);
  });

  it("refuses unparseable JSON without quoting it back", async () => {
    const res = await handleHttp(req({ body: '{"secret":"leak-me",' }), deps, options);
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toContain("leak-me");
  });

  it("refuses a JSON array, string or null, each of which parses and is not a request", async () => {
    for (const body of ["[]", '"hello"', "null", "7"]) {
      const res = await handleHttp(req({ body }), deps, options);
      expect(res.status).toBe(400);
    }
    expect(zoho.sent).toEqual([]);
  });

  it("refuses the wrong method on each route rather than guessing the intent", async () => {
    expect((await handleHttp(req({ method: "GET", body: "" }), deps, options)).status).toBe(405);
    expect((await handleHttp(req({ method: "POST", path: "/senders" }), deps, options)).status).toBe(405);
    expect((await handleHttp(req({ method: "DELETE", path: "/status", body: "" }), deps, options)).status).toBe(405);
  });

  it("refuses an unknown path", async () => {
    expect((await handleHttp(req({ path: "/admin", method: "GET", body: "" }), deps, options)).status).toBe(404);
  });

  it("requires an idempotencyKey on status rather than returning something arbitrary", async () => {
    const res = await handleHttp(req({ method: "GET", path: "/status", body: "" }), deps, options);
    expect(res.status).toBe(400);
  });
});

describe("the token is read from the Authorization header and nowhere else", () => {
  it("extracts a bearer token", () => {
    expect(bearerToken(req())).toBe("good-token");
    expect(bearerToken(req({ headers: { authorization: "  Bearer good-token  " } }))).toBe("good-token");
  });

  it("ignores other schemes and a malformed header", () => {
    expect(bearerToken(req({ headers: { authorization: "Basic abc" } }))).toBeUndefined();
    expect(bearerToken(req({ headers: { authorization: "Bearer" } }))).toBeUndefined();
    expect(bearerToken(req({ headers: { authorization: "Bearer a b" } }))).toBeUndefined();
    expect(bearerToken(req({ headers: {} }))).toBeUndefined();
  });

  it("does not accept a token from the query string, which would reach access logs", async () => {
    const { authorization: _auth, ...headers } = req().headers as Record<string, string>;
    const res = await handleHttp(req({ headers, query: { token: "good-token" } }), deps, options);
    expect(res.status).toBe(401);
    expect(zoho.sent).toEqual([]);
  });

  it("refuses an unauthenticated send with 401 and sends nothing", async () => {
    const res = await handleHttp(req({ headers: { ...req().headers, authorization: "Bearer wrong" } }), deps, options);
    expect(res.status).toBe(401);
    expect(zoho.sent).toEqual([]);
  });
});

describe("the transport does not second-guess the relay", () => {
  it("passes the kill switch's refusal through unchanged", async () => {
    store.setSendingEnabled(false);
    const res = await handleHttp(req(), deps, options);
    expect(res.status).toBe(503);
    expect(zoho.sent).toEqual([]);
  });

  it("passes a validation refusal through with its reasons and sends nothing", async () => {
    const res = await handleHttp(req({ body: JSON.stringify({ subject: "no sender, no recipients" }) }), deps, options);
    expect(res.status).toBe(400);
    expect(Array.isArray(res.body.reasons)).toBe(true);
    expect(zoho.sent).toEqual([]);
  });
});
