import { google } from "googleapis";
import { supabaseAdmin } from "@/lib/supabase";

const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];
const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const REDIRECT_URI = process.env.GMAIL_REDIRECT_URI ?? "https://anadyon.gr/api/admin/gmail/callback";

export function createOAuthClient() {
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
}

export function getAuthUrl(): string {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });
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

function decodeBody(payload: { body?: { data?: string }; parts?: unknown[] }): string {
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf8");
  }
  if (Array.isArray(payload.parts)) {
    for (const part of payload.parts as typeof payload[]) {
      const text = decodeBody(part as typeof payload);
      if (text) return text;
    }
  }
  return "";
}

export async function fetchNewEmails(): Promise<ParsedEmail[]> {
  const gmail = await getGmailClient();
  if (!gmail) return [];

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

  const listRes = await gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults: 50,
  });

  const messages = listRes.data.messages ?? [];
  if (!messages.length) return [];

  const parsed: ParsedEmail[] = [];

  for (const msg of messages) {
    try {
      const detail = await gmail.users.messages.get({
        userId: "me",
        id: msg.id!,
        format: "full",
      });
      const headers = detail.data.payload?.headers ?? [];
      const get = (name: string) => headers.find(h => h.name?.toLowerCase() === name)?.value ?? null;

      const from = get("from") ?? "";
      const match = from.match(/^(?:"?([^"<]+)"?\s*)?<?([^>]+)>?$/);
      const senderName = match?.[1]?.trim() || null;
      const senderEmail = match?.[2]?.trim() ?? from;

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

  // Update sync timestamp
  await supabaseAdmin.from("system_settings").upsert({
    key: "gmail_last_sync",
    value: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  return parsed;
}
