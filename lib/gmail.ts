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
  const state = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
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
  body?: { data?: string };
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

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
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

  const query = `to:customerservice@anadyon.gr after:${afterTimestamp} -from:customerservice@anadyon.gr`;

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
      });
    } catch (err) {
      console.error("Failed to fetch email", msg.id, err);
    }
  }

  return { emails: parsed, remaining };
}

/**
 * Returns the thread ids you have sent mail in recently.
 *
 * Replaces the Make.com "Reply Detection" scenario, which watched the Sent
 * folder and flipped a thread's status once staff replied. Uses metadata format
 * so only headers are transferred, not message bodies.
 */
export async function fetchSentThreadIds(sinceDays = 14): Promise<Set<string>> {
  const gmail = await getGmailClient();
  if (!gmail) return new Set();

  const after = Math.floor(Date.now() / 1000) - sinceDays * 24 * 60 * 60;
  const threadIds = new Set<string>();

  let pageToken: string | undefined;
  do {
    const res = await gmail.users.messages.list({
      userId: "me",
      q: `in:sent after:${after}`,
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
