import { randomBytes } from "node:crypto";
import { google } from "googleapis";
import { supabaseAdmin } from "@/lib/supabase";

const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];
const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const REDIRECT_URI = process.env.GMAIL_REDIRECT_URI ?? "https://anadyon.gr/api/admin/gmail/callback";

export function createOAuthClient() {
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
}

export function getAuthUrl(): { url: string; state: string } {
  const client = createOAuthClient();
  // crypto.randomBytes, not Math.random.
  //
  // Math.random is not a cryptographic generator: its output is predictable
  // from prior values, and this value is the only thing standing between the
  // OAuth callback and a forged one. Two concatenated calls made it longer
  // without making it less guessable.
  const state = randomBytes(32).toString("base64url");
  const url = client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
    state,
  });
  return { url, state };
}

export async function getStoredTokens() {
  const { data } = await supabaseAdmin
    .from("system_settings")
    .select("value")
    .eq("key", "gmail_tokens")
    .maybeSingle();
  return data?.value ? JSON.parse(data.value) : null;
}

export async function saveTokens(tokens: object) {
  await supabaseAdmin
    .from("system_settings")
    .upsert({ key: "gmail_tokens", value: JSON.stringify(tokens), updated_at: new Date().toISOString() });
}

export async function getGmailClient() {
  const tokens = await getStoredTokens();
  if (!tokens) return null;
  const client = createOAuthClient();
  client.setCredentials(tokens);
  // Persist refreshed tokens
  client.on("tokens", async (t) => {
    const merged = { ...tokens, ...t };
    await saveTokens(merged);
  });
  return google.gmail({ version: "v1", auth: client });
}

export interface ParsedEmail {
  gmailMessageId: string;
  gmailThreadId: string;
  senderName: string | null;
  senderEmail: string;
  subject: string | null;
  bodyText: string | null;
  receivedAt: Date;
  /**
   * What is attached, not the bytes. Downloading every attachment of every
   * synced message would be most of a sync budget spent on files nobody asked
   * for — the caller decides which ones matter and calls `fetchAttachment`.
   */
  attachments: EmailAttachment[];
}

export interface EmailAttachment {
  filename: string;
  mimeType: string;
  /**
   * Gmail's handle for the bytes, fetched separately. Null when the part is
   * small enough that Gmail returned it inline instead — see `inlineData`.
   */
  attachmentId: string | null;
  sizeBytes: number;
  /**
   * base64url bytes, present only for parts Gmail inlined. Both forms occur in
   * the same mailbox and a reader that handles only `attachmentId` silently
   * loses the small files.
   */
  inlineData: string | null;
}

/**
 * Splits an RFC 5322 From header into display name and address.
 *
 * Handles `Name <a@b.c>`, `"Last, First" <a@b.c>`, `<a@b.c>` and a bare
 * `a@b.c`. The bare form is the important one: a single greedy pattern will
 * happily treat `a@b.c` as name `a@b.` plus address `c`.
 */
export function parseFromHeader(from: string): { senderName: string | null; senderEmail: string } {
  const angle = from.match(/^(.*?)<([^>]*)>\s*$/);
  if (angle) {
    const name = angle[1].trim().replace(/^"([\s\S]*)"$/, "$1").trim();
    return { senderName: name || null, senderEmail: angle[2].trim() };
  }
  return { senderName: null, senderEmail: from.trim() };
}

interface MailPart {
  mimeType?: string;
  filename?: string | null;
  body?: { data?: string; attachmentId?: string | null; size?: number | null };
  parts?: MailPart[];
}

function decodePart(part: MailPart): string {
  return part.body?.data ? Buffer.from(part.body.data, "base64url").toString("utf8") : "";
}

/** Depth-first search for the first part matching the given MIME type. */
function findPart(part: MailPart, mimeType: string): string {
  if (part.mimeType === mimeType) {
    const text = decodePart(part);
    if (text) return text;
  }
  for (const child of part.parts ?? []) {
    const text = findPart(child, mimeType);
    if (text) return text;
  }
  return "";
}

export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/\s*style\b[^>]*>/gi, " ")
    .replace(/<script[\s\S]*?<\/\s*script\b[^>]*>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Extracts readable body text, preferring text/plain and falling back to
 * stripped HTML. The previous version returned whichever part happened to carry
 * data first, which on multipart mail was often raw HTML markup.
 */
function decodeBody(payload: MailPart): string {
  const plain = findPart(payload, "text/plain");
  if (plain.trim()) return plain;

  const html = findPart(payload, "text/html");
  if (html.trim()) return htmlToText(html);

  return decodePart(payload);
}

/**
 * Every attached file in a message, at any nesting depth.
 *
 * A part is an attachment when it carries a filename. That is the distinction
 * that matters: `text/plain` and `text/html` body parts never do, and forwarded
 * mail nests its attachments inside a `message/rfc822` part where a shallow
 * scan of `payload.parts` does not reach them — which is exactly how the
 * broker's forwarded policy documents arrive.
 *
 * Returns metadata only. The bytes come from `fetchAttachment`, because Gmail
 * does not include them in a `format: "full"` message: it returns an
 * `attachmentId` to fetch separately, and only inlines the small ones.
 */
export function listAttachments(payload: MailPart | null | undefined): EmailAttachment[] {
  const found: EmailAttachment[] = [];

  const walk = (part: MailPart) => {
    const filename = part.filename?.trim();
    if (filename) {
      found.push({
        filename,
        mimeType: part.mimeType ?? "application/octet-stream",
        attachmentId: part.body?.attachmentId ?? null,
        sizeBytes: part.body?.size ?? 0,
        inlineData: part.body?.attachmentId ? null : part.body?.data ?? null,
      });
    }
    for (const child of part.parts ?? []) walk(child);
  };

  if (payload) walk(payload);
  return found;
}

/**
 * Ceiling on a single attachment download, in bytes.
 *
 * A cap exists because this runs in a serverless function with finite memory
 * and a request timeout, and one oversized file would take down the whole sync
 * rather than being skipped. Policy PDFs from the broker run to about a
 * megabyte, so 8 MB is generous for the real traffic while still refusing a
 * video somebody attached to a reservation enquiry.
 */
export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

/**
 * Downloads one attachment's bytes, or returns null with a reason logged.
 *
 * Null rather than a throw: a single unreadable attachment must not fail the
 * message it came with, let alone the sync run around it. Callers that need to
 * distinguish "no bytes" from "not attempted" have the metadata already.
 *
 * `client` is injectable so the size and decoding rules can be tested without
 * a live mailbox; it defaults to the stored-token client.
 */
export async function fetchAttachment(
  messageId: string,
  attachment: EmailAttachment,
  options: {
    maxBytes?: number;
    client?: { users: { messages: { attachments: { get: (params: {
      userId: string; messageId: string; id: string;
    }) => Promise<{ data: { data?: string | null; size?: number | null } }> } } } } | null;
  } = {}
): Promise<Buffer | null> {
  const maxBytes = options.maxBytes ?? MAX_ATTACHMENT_BYTES;

  // Checked before the request, so an oversized file costs nothing to refuse.
  if (attachment.sizeBytes > maxBytes) {
    console.warn(
      `[gmail] skipping ${attachment.filename}: ${attachment.sizeBytes} bytes exceeds ${maxBytes}`
    );
    return null;
  }

  if (attachment.inlineData) {
    return Buffer.from(attachment.inlineData, "base64url");
  }

  if (!attachment.attachmentId) return null;

  const gmail = options.client !== undefined ? options.client : await getGmailClient();
  if (!gmail) return null;

  try {
    const res = await gmail.users.messages.attachments.get({
      userId: "me",
      messageId,
      id: attachment.attachmentId,
    });
    const data = res.data.data;
    if (!data) return null;

    // Gmail's `size` is advisory and the metadata one was already checked; this
    // guards the case where the returned body is larger than announced.
    const buf = Buffer.from(data, "base64url");
    if (buf.byteLength > maxBytes) {
      console.warn(`[gmail] discarding ${attachment.filename}: ${buf.byteLength} bytes over cap`);
      return null;
    }
    return buf;
  } catch (err) {
    console.error(`[gmail] could not fetch attachment ${attachment.filename}`, err);
    return null;
  }
}

/** How many messages one sync run will classify — bounded to fit the serverless time limit. */
export const SYNC_BATCH_SIZE = 12;
/** Safety ceiling on how many message ids we will enumerate in one run. */
const LIST_CAP = 200;

export interface FetchResult {
  emails: ParsedEmail[];
  /** Messages matching the query that this run did not process. */
  remaining: number;
}

export async function fetchNewEmails(): Promise<FetchResult> {
  const gmail = await getGmailClient();
  if (!gmail) return { emails: [], remaining: 0 };

  // Find the last synced message time
  const { data: setting } = await supabaseAdmin
    .from("system_settings")
    .select("value")
    .eq("key", "gmail_last_sync")
    .maybeSingle();

  const afterTimestamp = setting?.value
    ? Math.floor(new Date(setting.value).getTime() / 1000)
    : Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60; // last 7 days on first run

  // Match anything addressed to the service mailbox.
  //
  // Deliberately does NOT exclude senders at anadyon.gr: the live WordPress site
  // submits reservations as `From: WordPress <customerservice@anadyon.gr>` with
  // Reply-To set to the real customer, so excluding that sender silently dropped
  // every website booking. Staff replies are not caught by this, because a reply
  // is addressed to the customer rather than to customerservice@.
  const query = `to:customerservice@anadyon.gr after:${afterTimestamp}`;

  // Enumerate ids across pages so a backlog larger than one page is still seen.
  const ids: { id?: string | null }[] = [];
  let pageToken: string | undefined;
  do {
    const listRes = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults: 100,
      pageToken,
    });
    ids.push(...(listRes.data.messages ?? []));
    pageToken = listRes.data.nextPageToken ?? undefined;
  } while (pageToken && ids.length < LIST_CAP);

  if (!ids.length) return { emails: [], remaining: 0 };

  // Gmail returns newest first. Process oldest first and advance the cursor only
  // as far as we actually got, so a capped run resumes instead of skipping mail.
  const oldestFirst = ids.slice().reverse();
  const batch = oldestFirst.slice(0, SYNC_BATCH_SIZE);
  const remaining = Math.max(0, oldestFirst.length - batch.length);

  const parsed: ParsedEmail[] = [];

  for (const msg of batch) {
    try {
      const detail = await gmail.users.messages.get({
        userId: "me",
        id: msg.id!,
        format: "full",
      });
      const headers = detail.data.payload?.headers ?? [];
      const get = (name: string) => headers.find(h => h.name?.toLowerCase() === name)?.value ?? null;

      const from = get("from") ?? "";
      const { senderName, senderEmail: fromEmail } = parseFromHeader(from);

      // Match the Make.com scenario: prefer Reply-To so replies reach the
      // address the sender actually wants, falling back to From.
      const replyToHeader = get("reply-to");
      const senderEmail = replyToHeader
        ? parseFromHeader(replyToHeader).senderEmail || fromEmail
        : fromEmail;

      const internalDate = detail.data.internalDate
        ? new Date(parseInt(detail.data.internalDate))
        : new Date();

      parsed.push({
        gmailMessageId: detail.data.id!,
        gmailThreadId: detail.data.threadId!,
        senderName,
        senderEmail,
        subject: get("subject"),
        bodyText: decodeBody(detail.data.payload as Parameters<typeof decodeBody>[0] ?? {}),
        receivedAt: internalDate,
        attachments: listAttachments(detail.data.payload as MailPart | undefined),
      });
    } catch (err) {
      console.error("Failed to fetch email", msg.id, err);
    }
  }

  return { emails: parsed, remaining };
}

/**
 * Returns the thread ids that have been answered on behalf of the business.
 *
 * Replaces the Make.com "Reply Detection" scenario. Matching on sender rather
 * than on the Sent folder is deliberate — replies reach this mailbox two ways:
 *
 *   - the owner replying from Gmail using the customerservice@ alias, which
 *     lands in Sent
 *   - staff replying from webmail, which never touches this mailbox's Sent
 *     folder; it arrives as the Bcc copy the office adds to every reply
 *
 * An `in:sent` search sees only the first and would leave the watchdog chasing
 * threads staff had already answered.
 *
 * The `-to:` clause excludes website form submissions, which are also sent
 * *from* customerservice@ but addressed *to* it — without that they would be
 * mistaken for replies and close a reservation the moment it arrived.
 */
export async function fetchRepliedThreadIds(sinceDays = 14): Promise<Set<string>> {
  const gmail = await getGmailClient();
  if (!gmail) return new Set();

  const after = Math.floor(Date.now() / 1000) - sinceDays * 24 * 60 * 60;
  const threadIds = new Set<string>();

  let pageToken: string | undefined;
  do {
    const res = await gmail.users.messages.list({
      userId: "me",
      q: `from:customerservice@anadyon.gr -to:customerservice@anadyon.gr after:${after}`,
      maxResults: 100,
      pageToken,
    });
    for (const m of res.data.messages ?? []) {
      if (m.threadId) threadIds.add(m.threadId);
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken && threadIds.size < 500);

  return threadIds;
}

/**
 * Moves the sync cursor forward.
 *
 * Called by the sync layer only after messages are stored, and set to the
 * newest message actually handled rather than "now" — otherwise a run that was
 * capped, timed out, or partially failed would step over the mail it missed and
 * never fetch it again.
 */
export async function advanceSyncCursor(upTo: Date): Promise<void> {
  await supabaseAdmin.from("system_settings").upsert({
    key: "gmail_last_sync",
    value: upTo.toISOString(),
    updated_at: new Date().toISOString(),
  });
}
