/**
 * Validates and normalises one send request before it reaches Zoho.
 *
 * **This is the whole security boundary of the relay**, and it is a pure
 * function on purpose. §6.2 of the proposal lists twelve things the send
 * endpoint must do; the ones that decide whether a message leaves as the wrong
 * identity, to the wrong people, or twice, are all decidable without a network
 * call. Keeping them here means they can be tested exhaustively and cheaply,
 * and that the HTTP layer above has no discretion.
 *
 * **The rule the design turns on.** The client is a browser extension, and the
 * proposal's own §2.3 says a browser extension is *not* a security boundary.
 * So everything arriving from it is treated as a claim, not a fact: the sender
 * is matched against a server-side allowlist and never echoed, recipients are
 * re-parsed rather than trusted, and limits are applied here rather than in the
 * UI that offered them.
 *
 * **Why a rejected request is never silently repaired.** An earlier instinct
 * was to default a missing sender to the user's primary identity. That is
 * exactly the failure the review's HIGH 3 describes — a message leaving as an
 * address nobody chose — so a request without an explicit, allowlisted sender
 * is refused.
 */

/** An identity the relay may send as, as configured server-side. */
export type ApprovedSender = {
  /** The envelope and header address, e.g. `customerservice@anadyon.gr`. */
  readonly address: string;
  /** The display name the relay attaches. Never taken from the client. */
  readonly displayName: string;
};

export type RelayLimits = {
  readonly maxRecipients: number;
  readonly maxTotalAttachmentBytes: number;
  readonly maxMessageBytes: number;
  /** Sends allowed per user per rolling window. */
  readonly maxSendsPerWindow: number;
  readonly windowMs: number;
};

export type Attachment = {
  readonly filename: string;
  readonly contentType: string;
  readonly bytes: number;
};

/** What the extension submits. Every field is untrusted. */
export type SendRequestInput = {
  readonly senderAddress?: unknown;
  readonly to?: unknown;
  readonly cc?: unknown;
  readonly bcc?: unknown;
  readonly subject?: unknown;
  readonly text?: unknown;
  readonly html?: unknown;
  readonly attachments?: unknown;
  readonly idempotencyKey?: unknown;
  readonly inReplyTo?: unknown;
  readonly references?: unknown;
};

export type ValidatedSend = {
  readonly sender: ApprovedSender;
  readonly to: readonly string[];
  readonly cc: readonly string[];
  readonly bcc: readonly string[];
  readonly subject: string;
  readonly text?: string;
  readonly html?: string;
  readonly attachments: readonly Attachment[];
  readonly idempotencyKey: string;
  readonly inReplyTo?: string;
  readonly references?: string;
};

export type Rejection = { readonly ok: false; readonly reasons: readonly string[] };
export type Acceptance = { readonly ok: true; readonly send: ValidatedSend };
export type ValidationResult = Rejection | Acceptance;

/**
 * Deliberately conservative. The proposal's §6.2 item 6 leaves the attachment
 * policy open ("if that is adopted"); this adopts it, because the alternative
 * is a relay that will forward an executable from a compromised office device
 * under the company's own authenticated identity — which is a worse outcome
 * than a staff member having to zip something.
 */
const BLOCKED_ATTACHMENT_EXTENSIONS = new Set([
  "exe", "scr", "com", "pif", "bat", "cmd", "vbs", "vbe", "js", "jse", "wsf",
  "wsh", "msi", "msp", "hta", "cpl", "jar", "lnk", "reg", "ps1", "psm1", "dll",
  "iso", "img", "vhd", "apk", "app", "dmg",
]);

/**
 * RFC 5322 in full is not the goal; rejecting what cannot be an address, and
 * what could smuggle a second recipient or a header, is. A comma, semicolon,
 * newline or angle bracket inside what claims to be one address is the shape of
 * an injection attempt, not a typo.
 */
const PLAUSIBLE_ADDRESS = /^[^\s<>,;:"\\]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

const asString = (v: unknown): string | undefined =>
  typeof v === "string" ? v : undefined;

/** Accepts a string or an array of strings; anything else is not a list. */
function toAddressList(value: unknown): { list: string[]; malformed: boolean } {
  if (value === undefined || value === null) return { list: [], malformed: false };
  const raw = Array.isArray(value) ? value : [value];
  const list: string[] = [];
  let malformed = false;
  for (const entry of raw) {
    if (typeof entry !== "string") {
      malformed = true;
      continue;
    }
    // One string must be one address. Splitting on commas here would accept
    // "a@b.gr, c@d.gr" as two, which is how a recipient limit gets bypassed by
    // a client that was told the limit was one.
    const trimmed = entry.trim();
    if (trimmed === "") continue;
    list.push(trimmed);
  }
  return { list, malformed };
}

const extensionOf = (filename: string): string => {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot + 1).toLowerCase();
};

/**
 * @param approvedSenders the identities this user may send as, resolved
 *   server-side from the authenticated identity — never from the request.
 */
export function validateSendRequest(
  input: SendRequestInput,
  approvedSenders: readonly ApprovedSender[],
  limits: RelayLimits,
): ValidationResult {
  const reasons: string[] = [];

  // 1. The sender. Matched, never echoed, never defaulted.
  const claimedSender = asString(input.senderAddress)?.trim().toLowerCase();
  const sender = claimedSender
    ? approvedSenders.find((s) => s.address.toLowerCase() === claimedSender)
    : undefined;
  if (!claimedSender) {
    reasons.push("senderAddress is required and is not defaulted");
  } else if (!sender) {
    reasons.push(`senderAddress is not an approved identity for this user`);
  }

  // 2. Recipients. Re-parsed rather than trusted.
  const to = toAddressList(input.to);
  const cc = toAddressList(input.cc);
  const bcc = toAddressList(input.bcc);
  if (to.malformed || cc.malformed || bcc.malformed) {
    reasons.push("recipient lists must contain strings only");
  }
  const all = [...to.list, ...cc.list, ...bcc.list];
  if (all.length === 0) reasons.push("at least one recipient is required");
  for (const address of all) {
    if (!PLAUSIBLE_ADDRESS.test(address)) {
      reasons.push(`not a single valid address: ${JSON.stringify(address)}`);
    }
  }
  if (all.length > limits.maxRecipients) {
    reasons.push(`too many recipients: ${all.length} > ${limits.maxRecipients}`);
  }

  // 3. Subject and body. A body is required because an empty send is almost
  //    always a bug in the client rather than an intent.
  const subject = asString(input.subject)?.trim() ?? "";
  if (subject === "") reasons.push("subject is required");
  if (/[\r\n]/.test(subject)) reasons.push("subject must not contain line breaks");
  const text = asString(input.text);
  const html = asString(input.html);
  if (!text && !html) reasons.push("a text or html body is required");

  // 4. Attachments.
  const attachments: Attachment[] = [];
  if (input.attachments !== undefined) {
    if (!Array.isArray(input.attachments)) {
      reasons.push("attachments must be an array");
    } else {
      for (const candidate of input.attachments) {
        const filename = asString((candidate as Attachment)?.filename);
        const contentType = asString((candidate as Attachment)?.contentType);
        const bytes = (candidate as Attachment)?.bytes;
        if (!filename || !contentType || typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) {
          reasons.push("each attachment needs filename, contentType and a non-negative byte count");
          continue;
        }
        if (BLOCKED_ATTACHMENT_EXTENSIONS.has(extensionOf(filename))) {
          reasons.push(`attachment type not permitted: ${filename}`);
          continue;
        }
        attachments.push({ filename, contentType, bytes });
      }
      const total = attachments.reduce((sum, a) => sum + a.bytes, 0);
      if (total > limits.maxTotalAttachmentBytes) {
        reasons.push(`attachments total ${total} bytes > ${limits.maxTotalAttachmentBytes}`);
      }
    }
  }

  // 5. Size. Approximate on purpose: the exact wire size depends on encoding,
  //    and a limit that is slightly conservative is the right direction.
  const bodyBytes = Buffer.byteLength(text ?? "", "utf8") + Buffer.byteLength(html ?? "", "utf8");
  const attachmentBytes = attachments.reduce((sum, a) => sum + a.bytes, 0);
  if (bodyBytes + attachmentBytes > limits.maxMessageBytes) {
    reasons.push(`message too large: ${bodyBytes + attachmentBytes} > ${limits.maxMessageBytes}`);
  }

  // 6. Idempotency. Required, because §6.2 item 8 makes it the defence against
  //    a double click sending twice — and a server-generated key would not be
  //    stable across the client's retry of the same user action.
  const idempotencyKey = asString(input.idempotencyKey)?.trim();
  if (!idempotencyKey) {
    reasons.push("idempotencyKey is required");
  } else if (idempotencyKey.length < 16 || idempotencyKey.length > 200) {
    reasons.push("idempotencyKey must be between 16 and 200 characters");
  } else if (!/^[A-Za-z0-9._:-]+$/.test(idempotencyKey)) {
    reasons.push("idempotencyKey must be url-safe");
  }

  // 7. Threading headers pass through, validated only for shape. Preserving
  //    them is what keeps a reply in its conversation (review HIGH 3).
  const inReplyTo = asString(input.inReplyTo)?.trim();
  const references = asString(input.references)?.trim();
  for (const [name, value] of [["inReplyTo", inReplyTo], ["references", references]] as const) {
    if (value !== undefined && /[\r\n]/.test(value)) {
      reasons.push(`${name} must not contain line breaks`);
    }
  }

  if (reasons.length > 0 || !sender || !idempotencyKey) {
    return { ok: false, reasons: reasons.length ? reasons : ["request rejected"] };
  }

  return {
    ok: true,
    send: {
      sender,
      to: to.list,
      cc: cc.list,
      bcc: bcc.list,
      subject,
      text,
      html,
      attachments,
      idempotencyKey,
      inReplyTo,
      references,
    },
  };
}

export const DEFAULT_LIMITS: RelayLimits = {
  maxRecipients: 20,
  maxTotalAttachmentBytes: 20 * 1024 * 1024,
  maxMessageBytes: 25 * 1024 * 1024,
  maxSendsPerWindow: 60,
  windowMs: 60 * 60 * 1000,
};
