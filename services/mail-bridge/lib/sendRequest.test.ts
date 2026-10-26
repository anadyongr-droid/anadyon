import { describe, expect, it } from "vitest";
import {
  DEFAULT_LIMITS,
  validateSendRequest,
  type ApprovedSender,
  type RelayLimits,
} from "./sendRequest";

/**
 * The relay's only security boundary, tested as the adversary rather than as
 * the happy path.
 *
 * **Why these tests are shaped this way.** The client is a browser extension,
 * and the proposal's §2.3 states a browser extension is *not* a security
 * boundary. So every test here sends something an honest client would never
 * send. A suite that only proves a well-formed request succeeds would pass
 * against a validator that returns `ok: true` unconditionally — which is the
 * "inert control, green test" shape this project has found in its own
 * instruments five times.
 */

const senders: ApprovedSender[] = [
  { address: "customerservice@anadyon.gr", displayName: "Anadyon Customer Service" },
  { address: "rentals@anadyon.gr", displayName: "Anadyon Rentals" },
];

const limits: RelayLimits = { ...DEFAULT_LIMITS, maxRecipients: 3 };

const good = {
  senderAddress: "customerservice@anadyon.gr",
  to: ["guest@example.com"],
  subject: "Your reservation",
  text: "Kind regards",
  idempotencyKey: "0123456789abcdef-click-1",
};

const reasons = (input: Record<string, unknown>) => {
  // Cast for the same reason: these inputs are deliberately malformed, which is
  // what an HTTP body can be and a typed call cannot.
  const result = validateSendRequest(input as Parameters<typeof validateSendRequest>[0], senders, limits);
  return result.ok ? [] : result.reasons;
};

describe("the sender is matched, never defaulted, never echoed", () => {
  it("accepts an approved identity and returns the SERVER's display name", () => {
    const result = validateSendRequest(good, senders, limits);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.send.sender.address).toBe("customerservice@anadyon.gr");
    // The client never supplied a display name. If it had, it must not win.
    expect(result.send.sender.displayName).toBe("Anadyon Customer Service");
  });

  it("ignores a client-supplied display name entirely", () => {
    // `displayName` is not in SendRequestInput, and the typecheck enforces
    // that for our own callers -- which is why this is cast. The request
    // arrives as JSON over HTTP, where the type system does not apply, so the
    // runtime must drop an unknown field rather than let it reach the header.
    const hostile = {
      ...good,
      senderAddress: "customerservice@anadyon.gr",
      displayName: "Totally Legit Bank",
    } as unknown as Parameters<typeof validateSendRequest>[0];
    const result = validateSendRequest(hostile, senders, limits);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.send.sender.displayName).toBe("Anadyon Customer Service");
  });

  it("REJECTS a sender that is not on the allowlist", () => {
    expect(reasons({ ...good, senderAddress: "ceo@anadyon.gr" })).toContain(
      "senderAddress is not an approved identity for this user",
    );
  });

  it("REJECTS a missing sender rather than defaulting one — review HIGH 3", () => {
    // Defaulting is precisely how a message leaves as an address nobody chose.
    const { senderAddress: _omitted, ...withoutSender } = good;
    expect(reasons(withoutSender)).toContain("senderAddress is required and is not defaulted");
  });

  it("matches case-insensitively, since addresses are not case-sensitive in practice", () => {
    expect(validateSendRequest({ ...good, senderAddress: "CustomerService@Anadyon.GR" }, senders, limits).ok).toBe(true);
  });

  it("rejects every sender when the user has no approved identities", () => {
    const result = validateSendRequest(good, [], limits);
    expect(result.ok).toBe(false);
  });
});

describe("recipients are re-parsed, not trusted", () => {
  it("refuses to split one string into several addresses", () => {
    // A client told the limit is 3 could otherwise pass 3 strings holding 30
    // addresses. One string must be one address.
    expect(reasons({ ...good, to: ["a@example.com, b@example.com"] })).toEqual(
      expect.arrayContaining([expect.stringContaining("not a single valid address")]),
    );
  });

  it.each([
    ["a header injection", "guest@example.com\r\nBcc: everyone@example.com"],
    ["a semicolon list", "a@example.com;b@example.com"],
    ["angle brackets", "<guest@example.com>"],
    ["no domain", "guest@"],
    ["no at sign", "guest.example.com"],
    ["a bare TLD", "guest@example"],
  ])("rejects %s", (_label, address) => {
    expect(reasons({ ...good, to: [address] })).toEqual(
      expect.arrayContaining([expect.stringContaining("not a single valid address")]),
    );
  });

  it("counts to, cc and bcc together against the limit", () => {
    const over = reasons({
      ...good,
      to: ["a@example.com", "b@example.com"],
      cc: ["c@example.com"],
      bcc: ["d@example.com"],
    });
    expect(over).toContain("too many recipients: 4 > 3");
  });

  it("requires at least one recipient", () => {
    expect(reasons({ ...good, to: [] })).toContain("at least one recipient is required");
  });

  it("rejects a non-string in a recipient list rather than coercing it", () => {
    expect(reasons({ ...good, to: ["a@example.com", 42] })).toContain(
      "recipient lists must contain strings only",
    );
  });
});

describe("subject and body", () => {
  it("requires a subject", () => {
    expect(reasons({ ...good, subject: "   " })).toContain("subject is required");
  });

  it("rejects a subject carrying a line break, which could forge a header", () => {
    expect(reasons({ ...good, subject: "Hello\r\nBcc: everyone@example.com" })).toContain(
      "subject must not contain line breaks",
    );
  });

  it("requires a body in some form", () => {
    const { text: _dropped, ...noBody } = good;
    expect(reasons(noBody)).toContain("a text or html body is required");
  });

  it("accepts html alone, and Greek text", () => {
    const { text: _t, ...rest } = good;
    expect(validateSendRequest({ ...rest, html: "<p>Καλώς ορίσατε</p>" }, senders, limits).ok).toBe(true);
  });
});

describe("attachments", () => {
  const att = (filename: string, bytes = 10) => ({ filename, contentType: "application/octet-stream", bytes });

  it.each(["payload.exe", "macro.vbs", "thing.js", "installer.msi", "archive.jar", "x.LNK"])(
    "blocks %s",
    (filename) => {
      expect(reasons({ ...good, attachments: [att(filename)] })).toContain(
        `attachment type not permitted: ${filename}`,
      );
    },
  );

  it("allows an ordinary document", () => {
    expect(
      validateSendRequest(
        { ...good, attachments: [{ filename: "contract.pdf", contentType: "application/pdf", bytes: 1024 }] },
        senders,
        limits,
      ).ok,
    ).toBe(true);
  });

  it("enforces the total attachment size", () => {
    const tight = { ...limits, maxTotalAttachmentBytes: 100 };
    const result = validateSendRequest({ ...good, attachments: [att("a.pdf", 60), att("b.pdf", 60)] }, senders, tight);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons).toEqual(expect.arrayContaining([expect.stringContaining("attachments total 120 bytes")]));
  });

  it("rejects a malformed attachment rather than skipping it quietly", () => {
    expect(reasons({ ...good, attachments: [{ filename: "a.pdf" }] })).toContain(
      "each attachment needs filename, contentType and a non-negative byte count",
    );
  });

  it("rejects a negative byte count, which would defeat the size check", () => {
    expect(reasons({ ...good, attachments: [att("a.pdf", -5000)] })).toContain(
      "each attachment needs filename, contentType and a non-negative byte count",
    );
  });
});

describe("idempotency — the defence against a double click", () => {
  it("requires a key", () => {
    const { idempotencyKey: _k, ...noKey } = good;
    expect(reasons(noKey)).toContain("idempotencyKey is required");
  });

  it("rejects a key too short to be unique", () => {
    expect(reasons({ ...good, idempotencyKey: "abc" })).toContain(
      "idempotencyKey must be between 16 and 200 characters",
    );
  });

  it("rejects a key that is not url-safe, since it ends up in a lookup path", () => {
    expect(reasons({ ...good, idempotencyKey: "0123456789abcdef/../../etc" })).toContain(
      "idempotencyKey must be url-safe",
    );
  });
});

describe("threading headers are preserved, because a lost thread is review HIGH 3", () => {
  it("passes In-Reply-To and References through", () => {
    const result = validateSendRequest(
      { ...good, inReplyTo: "<abc@anadyon.gr>", references: "<x@a.gr> <y@b.gr>" },
      senders,
      limits,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.send.inReplyTo).toBe("<abc@anadyon.gr>");
    expect(result.send.references).toBe("<x@a.gr> <y@b.gr>");
  });

  it("rejects a line break in either, which could forge a header", () => {
    expect(reasons({ ...good, inReplyTo: "<a@b.gr>\r\nBcc: x@y.gr" })).toContain(
      "inReplyTo must not contain line breaks",
    );
  });
});

describe("a rejection reports every problem at once", () => {
  it("does not stop at the first, so a client is not fixed one round trip at a time", () => {
    const result = validateSendRequest(
      { senderAddress: "nobody@anadyon.gr", to: ["bad"], subject: "", idempotencyKey: "x" },
      senders,
      limits,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.length).toBeGreaterThanOrEqual(4);
  });
});
