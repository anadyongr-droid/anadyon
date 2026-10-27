import { describe, expect, it } from "vitest";
import {
  NOTHING_PROVEN,
  RefreshTokenSource,
  ZOHO_EU_ACCOUNTS_HOST,
  ZohoApiMailClient,
  buildSendBody,
  classify,
  extractMessageId,
  ZOHO_ALLOWED_ORIGINS,
  ZOHO_OVERRIDE_CANDIDATES,
  isZohoHost,
  type HttpFetch,
  type TokenSource,
  type ZohoCapabilities,
} from "./zohoApi";
import type { ValidatedSend } from "./sendRequest";

const send = (over: Partial<ValidatedSend> = {}): ValidatedSend => ({
  sender: { address: "customerservice@anadyon.gr", displayName: "Anadyon" },
  to: ["one@example.com"],
  cc: [],
  bcc: [],
  subject: "Your booking",
  text: "Body",
  attachments: [],
  idempotencyKey: "k-0123456789abcdef",
  ...over,
});

const tokens = (token = "tok", apiDomain = "https://mail.zoho.eu"): TokenSource => ({
  async token() {
    return { accessToken: token, apiDomain };
  },
});

type Call = { url: string; init: Parameters<HttpFetch>[1] };

const recording = (status = 200, body = '{"data":{"messageId":"zm-1"}}') => {
  const calls: Call[] = [];
  const fetch: HttpFetch = async (url, init) => {
    calls.push({ url, init });
    return { status, text: async () => body };
  };
  return { calls, fetch };
};

const proven: ZohoCapabilities = { multipleRecipientsPerField: true, attachments: true };

describe("the request body matches what Zoho documents", () => {
  it("uses the documented field names and nothing else", () => {
    const body = buildSendBody(send({ cc: ["c@example.com"], bcc: ["b@example.com"] }));
    expect(Object.keys(body).sort()).toEqual(
      ["askReceipt", "bccAddress", "ccAddress", "content", "encoding", "fromAddress", "mailFormat", "subject", "toAddress"].sort(),
    );
  });

  it("omits ccAddress and bccAddress rather than sending empty ones", () => {
    const body = buildSendBody(send());
    expect("ccAddress" in body).toBe(false);
    expect("bccAddress" in body).toBe(false);
  });

  it("sends plaintext as plaintext and html as html", () => {
    expect(buildSendBody(send()).mailFormat).toBe("plaintext");
    expect(buildSendBody(send({ html: "<p>x</p>", text: undefined })).mailFormat).toBe("html");
  });

  it("sends the bare associated address, which is what Zoho documents — review finding 9", () => {
    // The first version sent `Display Name <address>`. Zoho documents
    // `fromAddress` as the sender address belonging to the authenticated
    // account; the display name is configured in Send Mail As, not per message.
    expect(buildSendBody(send()).fromAddress).toBe("customerservice@anadyon.gr");
  });

  it("never carries a threading field, because Zoho documents none", () => {
    const body = buildSendBody(send({ inReplyTo: "<a@b>", references: "<a@b>" }));
    expect(JSON.stringify(body)).not.toContain("a@b");
  });
});

describe("what is undocumented is refused, not guessed", () => {
  it("refuses a second recipient until the separator is proved", async () => {
    const { calls, fetch } = recording();
    const client = new ZohoApiMailClient({ accountId: "1", tokens: tokens(), fetch });
    const outcome = await client.send(send({ to: ["a@example.com", "b@example.com"] }));
    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.failure).toContain("more than one address");
    // The point of the refusal: nothing reached Zoho.
    expect(calls).toEqual([]);
  });

  it("counts cc and bcc towards that, because they are the same undocumented field", async () => {
    const { calls, fetch } = recording();
    const client = new ZohoApiMailClient({ accountId: "1", tokens: tokens(), fetch });
    const outcome = await client.send(send({ cc: ["c@example.com"] }));
    expect(outcome.ok).toBe(false);
    expect(calls).toEqual([]);
  });

  it("refuses a reply carrying In-Reply-To, rather than silently breaking the thread", async () => {
    const { calls, fetch } = recording();
    const client = new ZohoApiMailClient({ accountId: "1", tokens: tokens(), fetch });
    const outcome = await client.send(send({ inReplyTo: "<prev@example.com>" }));
    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.failure).toContain("thread");
    expect(calls).toEqual([]);
  });

  it("refuses threading even with every capability enabled — review finding 5", async () => {
    // The first version had a `threadingHeaders` flag. Turning it on removed
    // this refusal while `buildSendBody` still emitted no threading field, so
    // its only effect was to produce the silent unthreaded send the refusal
    // existed to prevent. There is no longer a flag to turn on.
    const { calls, fetch } = recording();
    const client = new ZohoApiMailClient({ accountId: "1", tokens: tokens(), fetch, capabilities: proven });
    expect((await client.send(send({ inReplyTo: "<a@b>" }))).ok).toBe(false);
    expect((await client.send(send({ references: "<a@b>" }))).ok).toBe(false);
    expect(calls).toEqual([]);
    expect(Object.keys(proven)).not.toContain("threadingHeaders");
  });

  it("refuses References for the same reason", async () => {
    const { fetch } = recording();
    const client = new ZohoApiMailClient({ accountId: "1", tokens: tokens(), fetch });
    expect((await client.send(send({ references: "<prev@example.com>" }))).ok).toBe(false);
  });

  it("refuses attachments even when the capability is on, because the bytes are not in the request", async () => {
    const { calls, fetch } = recording();
    const client = new ZohoApiMailClient({
      accountId: "1",
      tokens: tokens(),
      fetch,
      capabilities: proven,
    });
    const outcome = await client.send(
      send({ attachments: [{ filename: "a.pdf", contentType: "application/pdf", bytes: 10 }] }),
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.failure).toContain("upload step cannot run");
    expect(calls).toEqual([]);
  });

  it("allows the multi-recipient send once it is proved and enabled", async () => {
    const { calls, fetch } = recording();
    const client = new ZohoApiMailClient({ accountId: "1", tokens: tokens(), fetch, capabilities: proven });
    const outcome = await client.send(send({ to: ["a@example.com", "b@example.com"] }));
    expect(outcome.ok).toBe(true);
    expect(JSON.parse(calls[0].init.body).toAddress).toBe("a@example.com,b@example.com");
  });

  it("starts with nothing proved, and has no threading flag at all", () => {
    expect(NOTHING_PROVEN).toEqual({ multipleRecipientsPerField: false, attachments: false });
  });
});

describe("the request itself", () => {
  it("posts to the api_domain the token gave, not a compiled-in host", async () => {
    const { calls, fetch } = recording();
    const client = new ZohoApiMailClient({ accountId: "99", tokens: tokens("t", "https://mail.zoho.eu/"), fetch });
    await client.send(send());
    expect(calls[0].url).toBe("https://mail.zoho.eu/api/accounts/99/messages");
  });

  it("refuses when the token response carried no api_domain, rather than guessing one", async () => {
    const { calls, fetch } = recording();
    const client = new ZohoApiMailClient({ accountId: "1", tokens: tokens("t", ""), fetch });
    const outcome = await client.send(send());
    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.delivery).toBe("not_attempted");
    expect(calls).toEqual([]);
  });

  it("uses Zoho's own authorization scheme, not Bearer", async () => {
    const { calls, fetch } = recording();
    await new ZohoApiMailClient({ accountId: "1", tokens: tokens("secret-tok"), fetch }).send(send());
    expect(calls[0].init.headers.Authorization).toBe("Zoho-oauthtoken secret-tok");
  });

  it("reports a missing token as not_attempted, because no request was made", async () => {
    const { fetch } = recording();
    const none: TokenSource = { async token() { return undefined; } };
    const outcome = await new ZohoApiMailClient({ accountId: "1", tokens: none, fetch }).send(send());
    expect(outcome.ok === false && outcome.delivery).toBe("not_attempted");
  });

  it("reports a thrown transport as UNKNOWN, not as a failure — review finding 1", async () => {
    // The reset can land after Zoho accepted the message, and Zoho never sees
    // the relay's idempotency key, so calling this retryable invites a second
    // copy to the customer.
    const fetch: HttpFetch = async () => {
      throw new Error("ECONNRESET to mail.zoho.eu with token abc123");
    };
    const outcome = await new ZohoApiMailClient({ accountId: "1", tokens: tokens(), fetch }).send(send());
    expect(outcome.ok === false && outcome.delivery).toBe("unknown");
    expect(JSON.stringify(outcome)).not.toContain("abc123");
    expect(JSON.stringify(outcome)).not.toContain("ECONNRESET");
  });

  it("never puts the access token in the outcome", async () => {
    const { fetch } = recording(401, "unauthorised");
    const outcome = await new ZohoApiMailClient({ accountId: "1", tokens: tokens("super-secret"), fetch }).send(send());
    expect(JSON.stringify(outcome)).not.toContain("super-secret");
  });

  it("does not echo Zoho's response text into the outcome", async () => {
    const { fetch } = recording(400, '{"status":{"description":"internal host mail-int-7.zoho.eu refused"}}');
    const outcome = await new ZohoApiMailClient({ accountId: "1", tokens: tokens(), fetch }).send(send());
    expect(JSON.stringify(outcome)).not.toContain("mail-int-7");
  });
});

describe("status classification decides whether a duplicate is possible", () => {
  it("only the four definite refusals are rejections", () => {
    expect(classify(200).delivery).toBe("sent");
    expect(classify(201).delivery).toBe("sent");
    for (const status of [400, 401, 403, 404]) {
      expect(classify(status).delivery).toBe("rejected");
    }
  });

  it("a 5xx is UNKNOWN, not a retry — review finding 1", () => {
    // Zoho cannot deduplicate, having never received the key. A 500 returned
    // after acceptance, retried, sends the customer a second copy.
    for (const status of [500, 502, 503, 504]) {
      expect(classify(status).delivery).toBe("unknown");
    }
  });

  it("an unexpected status is unknown too, because guessing favours the duplicate", () => {
    expect(classify(418).delivery).toBe("unknown");
    expect(classify(302).delivery).toBe("unknown");
  });
});

describe("the deadline is real, and a timeout is ambiguous — review finding 7", () => {
  it("abandons a hung request rather than holding the send open indefinitely", async () => {
    const fetch: HttpFetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    const outcome = await new ZohoApiMailClient({
      accountId: "1",
      tokens: tokens(),
      fetch,
      timeoutMs: 10,
    }).send(send());
    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.delivery).toBe("unknown");
    expect(outcome.ok === false && outcome.failure).toContain("deadline");
  });

  it("passes a signal to the transport, so the deadline reaches the socket", async () => {
    const { calls, fetch } = recording();
    await new ZohoApiMailClient({ accountId: "1", tokens: tokens(), fetch }).send(send());
    expect(calls[0].init.signal).toBeDefined();
  });
});

describe("credentials only go to Zoho hosts — review finding 8", () => {
  it("refuses to send a bearer token to an api_domain that is not Zoho", async () => {
    const { calls, fetch } = recording();
    const client = new ZohoApiMailClient({
      accountId: "1",
      tokens: tokens("t", "https://collector.evil.example"),
      fetch,
    });
    const outcome = await client.send(send());
    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.delivery).toBe("not_attempted");
    expect(calls).toEqual([]);
  });

  it("is not fooled by a Zoho-looking suffix", () => {
    expect(isZohoHost("https://zoho.eu.evil.example")).toBe(false);
    expect(isZohoHost("https://notzoho.eu")).toBe(false);
    expect(isZohoHost("https://evil.example/?x=zoho.eu")).toBe(false);
  });

  it("refuses plaintext and embedded credentials", () => {
    expect(isZohoHost("http://mail.zoho.eu")).toBe(false);
    expect(isZohoHost("https://user:pass@mail.zoho.eu")).toBe(false);
    expect(isZohoHost("not a url")).toBe(false);
  });

  it("will not let an operator widen it to a plaintext host by configuration", () => {
    // Found by mutation sweep: without this the https check is redundant with
    // the built-in list, so removing it failed no test.
    expect(isZohoHost("http://mail.zoho.com", ["http://mail.zoho.com"])).toBe(false);
    expect(isZohoHost("https://mail.zoho.com", ["https://mail.zoho.com"])).toBe(true);
  });

  it("gives a DIFFERENT reason for a missing api_domain than for a wrong one", async () => {
    // Also from the sweep: both paths refused, so dropping the explicit
    // missing-api_domain check changed nothing observable. The reasons differ
    // because they need different fixes — one is Zoho answering oddly, the
    // other is a host nobody authorised.
    const { fetch } = recording();
    const missing = await new ZohoApiMailClient({ accountId: "1", tokens: tokens("t", ""), fetch }).send(send());
    const wrong = await new ZohoApiMailClient({
      accountId: "1",
      tokens: tokens("t", "https://collector.evil.example"),
      fetch,
    }).send(send());
    expect(missing.ok === false && missing.failure).toContain("no api_domain");
    expect(wrong.ok === false && wrong.failure).toContain("not an https Zoho host");
    if (missing.ok === false && wrong.ok === false) {
      expect(missing.failure).not.toBe(wrong.failure);
    }
  });

  it("accepts the EU origins this mailbox uses, and nothing wider", () => {
    for (const host of ["https://accounts.zoho.eu", "https://mail.zoho.eu", "https://www.zohoapis.eu"]) {
      expect(isZohoHost(host)).toBe(true);
    }
  });

  it("refuses other data centres by default — least privilege, re-review", () => {
    // The first version allowed every subdomain of every Zoho suffix. This
    // mailbox is in the EU data centre and the MX records say so.
    for (const host of [
      "https://accounts.zoho.com",
      "https://accounts.zohocloud.ca",
      "https://mail.zoho.in",
      "https://anything.zoho.eu",
    ]) {
      expect(isZohoHost(host)).toBe(false);
    }
  });

  it("permits a data-centre move only as an explicit, reviewable configuration line", () => {
    expect(isZohoHost("https://mail.zoho.com", ["https://mail.zoho.com"])).toBe(true);
    // Still exact: naming one origin does not open its neighbours.
    expect(isZohoHost("https://other.zoho.com", ["https://mail.zoho.com"])).toBe(false);
  });

  it("will not let the escape hatch reach an arbitrary Zoho SUBDOMAIN — fourth review, finding 1", () => {
    // The previous version matched any subdomain of a Zoho registrable domain,
    // so `anything.zoho.eu` qualified. A suffix match is not an allowlist: it
    // delegates the decision to whoever can get a hostname under the domain.
    for (const sub of [
      "https://anything.zoho.eu",
      "https://test.zoho.com",
      "https://sandbox.zohoapis.eu",
      "https://mail.dev.zoho.in",
    ]) {
      expect(isZohoHost(sub, [sub])).toBe(false);
    }
  });

  it("names its permitted override endpoints explicitly, all https", () => {
    expect(ZOHO_OVERRIDE_CANDIDATES.length).toBeGreaterThan(8);
    for (const endpoint of ZOHO_OVERRIDE_CANDIDATES) {
      expect(endpoint).toMatch(/^https:\/\/[a-z0-9.-]+$/);
      // An exact origin: no path, no port, no wildcard.
      expect(new URL(endpoint).origin).toBe(endpoint);
    }
  });

  it("will not let the escape hatch reach a non-Zoho host — third review, finding 3", () => {
    // The hatch used to require only https, so ONE configuration line could
    // point the refresh token and client secret at any host in the world. A
    // typo and a malicious edit look identical in a diff; the allowlist exists
    // so that no single edit can redirect a credential.
    for (const evil of [
      "https://collector.evil.example",
      "https://zoho.eu.evil.example",
      "https://notzoho.com",
      "https://evil.example/zoho.eu",
    ]) {
      expect(isZohoHost(evil, [evil])).toBe(false);
    }
  });

  it("still reaches the listed data-centre endpoints, which is what the hatch is for", () => {
    for (const dc of ["https://mail.zoho.in", "https://accounts.zohocloud.ca", "https://www.zohoapis.jp"]) {
      expect(isZohoHost(dc, [dc])).toBe(true);
      expect(ZOHO_OVERRIDE_CANDIDATES).toContain(dc);
    }
  });

  it("ignores an unparseable or credentialed entry in the hatch rather than trusting it", () => {
    expect(isZohoHost("not a url", ["not a url"])).toBe(false);
    expect(isZohoHost("https://mail.zoho.in", ["https://u:p@mail.zoho.in"])).toBe(false);
  });

  it("matches the origin only — a path, query or port cannot change the verdict", () => {
    expect(isZohoHost("https://mail.zoho.eu/api/accounts")).toBe(true);
    expect(isZohoHost("https://mail.zoho.eu:8443")).toBe(false);
    expect(isZohoHost("https://evil.example/#https://mail.zoho.eu")).toBe(false);
  });

  it("exports the allowlist so the configuration document cannot drift from it", () => {
    expect(ZOHO_ALLOWED_ORIGINS).toContain("https://accounts.zoho.eu");
    expect(ZOHO_ALLOWED_ORIGINS.every((o: string) => o.startsWith("https://"))).toBe(true);
  });

  it("will not post the refresh token and client secret to a non-Zoho accounts host", async () => {
    const calls: Call[] = [];
    const fetch: HttpFetch = async (url, init) => {
      calls.push({ url, init });
      return { status: 200, text: async () => "{}" };
    };
    const src = new RefreshTokenSource({
      accountsHost: "https://harvester.evil.example",
      clientId: "cid",
      clientSecret: "the-secret",
      refreshToken: "the-refresh-token",
      fetch,
    });
    expect(await src.token()).toBeUndefined();
    // The point: nothing left the process.
    expect(calls).toEqual([]);
  });
});

describe("a 200 with an unreadable body is a send, not a failure", () => {
  it("reports success with a key-derived identifier rather than releasing the key", async () => {
    const { fetch } = recording(200, "<html>Zoho's proxy said hello</html>");
    const outcome = await new ZohoApiMailClient({ accountId: "1", tokens: tokens(), fetch }).send(send());
    expect(outcome.ok).toBe(true);
    expect(outcome.ok === true && outcome.providerMessageId).toBe("unidentified:k-0123456789abcdef");
  });

  it("finds the identifier under each shape Zoho uses elsewhere", () => {
    expect(extractMessageId('{"data":{"messageId":"a"}}', "k")).toBe("a");
    expect(extractMessageId('{"data":{"messageID":"b"}}', "k")).toBe("b");
    expect(extractMessageId('{"data":{"msgId":12345}}', "k")).toBe("12345");
    expect(extractMessageId("not json", "k")).toBe("unidentified:k");
    expect(extractMessageId('{"data":{}}', "k")).toBe("unidentified:k");
  });

  it("never claims the copy reached Sent, which Zoho does not document", async () => {
    const { fetch } = recording();
    const outcome = await new ZohoApiMailClient({ accountId: "1", tokens: tokens(), fetch }).send(send());
    expect(outcome.ok === true && outcome.savedToSent).toBe(false);
  });
});

describe("the refresh token source", () => {
  const tokenBody = (over: Record<string, unknown> = {}) =>
    JSON.stringify({ access_token: "at-1", api_domain: "https://mail.zoho.eu", expires_in: 3600, token_type: "Bearer", ...over });

  const source = (status: number, body: string, now = () => 1_000_000) => {
    const calls: Call[] = [];
    const fetch: HttpFetch = async (url, init) => {
      calls.push({ url, init });
      return { status, text: async () => body };
    };
    return {
      calls,
      src: new RefreshTokenSource({
        accountsHost: ZOHO_EU_ACCOUNTS_HOST,
        clientId: "cid",
        clientSecret: "csecret",
        refreshToken: "rt",
        fetch,
        now,
      }),
    };
  };

  it("posts the documented refresh grant to the European accounts host", async () => {
    const { calls, src } = source(200, tokenBody());
    await src.token();
    expect(calls[0].url).toBe("https://accounts.zoho.eu/oauth/v2/token");
    const body = new URLSearchParams(calls[0].init.body);
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("client_id")).toBe("cid");
    expect(body.get("client_secret")).toBe("csecret");
    expect(body.get("refresh_token")).toBe("rt");
  });

  it("returns the api_domain from the response rather than assuming one", async () => {
    const { src } = source(200, tokenBody({ api_domain: "https://mail.zoho.com" }));
    expect((await src.token())?.apiDomain).toBe("https://mail.zoho.com");
  });

  it("caches within the hour and refreshes when the margin is reached", async () => {
    let clock = 1_000_000;
    const calls: Call[] = [];
    const fetch: HttpFetch = async (url, init) => {
      calls.push({ url, init });
      return { status: 200, text: async () => tokenBody() };
    };
    const src = new RefreshTokenSource({
      accountsHost: ZOHO_EU_ACCOUNTS_HOST,
      clientId: "c",
      clientSecret: "s",
      refreshToken: "r",
      fetch,
      now: () => clock,
    });
    await src.token();
    await src.token();
    expect(calls).toHaveLength(1);
    clock += 3_600_000;
    await src.token();
    expect(calls).toHaveLength(2);
  });

  it("treats a 200 with no access_token as no token — Zoho answers that way for a revoked grant", async () => {
    const { src } = source(200, JSON.stringify({ error: "invalid_code" }));
    expect(await src.token()).toBeUndefined();
  });

  it("treats a 200 with no api_domain as no token, rather than a token with a guessed host", async () => {
    const { src } = source(200, tokenBody({ api_domain: undefined }));
    expect(await src.token()).toBeUndefined();
  });

  it("returns nothing on a non-200 and on a thrown transport", async () => {
    expect(await source(400, "{}").src.token()).toBeUndefined();
    const thrown = new RefreshTokenSource({
      accountsHost: ZOHO_EU_ACCOUNTS_HOST,
      clientId: "c",
      clientSecret: "s",
      refreshToken: "r",
      fetch: async () => {
        throw new Error("no route");
      },
    });
    expect(await thrown.token()).toBeUndefined();
  });

  it("does not cache a failure, so the next send retries the refresh", async () => {
    let status = 500;
    const calls: Call[] = [];
    const fetch: HttpFetch = async (url, init) => {
      calls.push({ url, init });
      return { status, text: async () => tokenBody() };
    };
    const src = new RefreshTokenSource({ accountsHost: ZOHO_EU_ACCOUNTS_HOST, clientId: "c", clientSecret: "s", refreshToken: "r", fetch });
    expect(await src.token()).toBeUndefined();
    status = 200;
    expect((await src.token())?.accessToken).toBe("at-1");
    expect(calls).toHaveLength(2);
  });
});
