import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;
function getClient() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

// Mirrors the category set used by the original Make.com scenario so the Inbox
// stays consistent with the historical Google Sheet.
export const CATEGORIES = [
  "Reservation",
  "Cancellation",
  "Accounting",
  "Insurance",
  "Vendor",
  "Regulatory",
  "Other",
] as const;

export type EmailCategory = (typeof CATEGORIES)[number];

export interface EmailClassification {
  category: EmailCategory;
  greek_summary: string;
  urgency: 1 | 2 | 3;
  reservation_date?: string;
  suggested_action: string;
}

export async function classifyEmail(
  subject: string | null,
  body: string | null,
  senderEmail: string
): Promise<EmailClassification | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  const prompt = `You are an assistant for a small car rental agency based in Greece called Anadyon Rentals. Analyze the following email and return ONLY a raw JSON object with these fields: category (one of: Reservation, Cancellation, Accounting, Insurance, Vendor, Regulatory, Other), greek_summary (2-3 sentences in Greek), urgency (1=low, 2=medium, 3=urgent), reservation_date (date string if mentioned, otherwise null), suggested_action (in Greek, 1 sentence).

Urgency rules: 3 = new reservation request, cancellation, pickup within 48 hours, complaint, legal deadline. 2 = needs response within 24 hours. 1 = informational.
If subject contains 'Reservation Request' or body contains vehicle/date booking fields: category = Reservation, urgency = 3.
If email mentions cancelling or cancel: category = Cancellation, urgency = 3.

IMPORTANT: Return ONLY the raw JSON. No markdown. No code blocks. No backticks. Start with { and end with }.

IMPORTANT: This email may be a threaded reply. Focus ONLY on the newest message — the text that appears BEFORE any line containing "wrote:", "Sent:", or "-----Original Message-----". Ignore all quoted previous emails completely.

From: ${senderEmail}
Subject: ${subject ?? "(no subject)"}
Body: ${(body ?? "").slice(0, 6000)}`;

  try {
    const msg = await getClient().messages.create({
      // Matches the model the Make.com scenario used, so classification quality
      // is consistent with the results already in the Sheet.
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    });
    const text = msg.content[0].type === "text" ? msg.content[0].text.trim() : "";
    const parsed = extractJson(text);
    if (!parsed) {
      console.error("Email classification: no JSON in model response:", text.slice(0, 300));
      return null;
    }
    return normalise(parsed);
  } catch (err) {
    console.error("Email classification error:", err);
    return null;
  }
}

/**
 * Pulls the JSON object out of a model response. The model is asked for bare
 * JSON but may still wrap it in ```json fences or a sentence, and a raw
 * JSON.parse on that throws — which previously left every email unclassified.
 */
function extractJson(text: string): Record<string, unknown> | null {
  const cleaned = text
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  for (const candidate of [cleaned, sliceOuterObject(cleaned)]) {
    if (!candidate) continue;
    try {
      const value = JSON.parse(candidate);
      if (value && typeof value === "object") return value as Record<string, unknown>;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

function sliceOuterObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start !== -1 && end > start ? text.slice(start, end + 1) : null;
}

/** Coerces model output into a shape the database will accept. */
function normalise(raw: Record<string, unknown>): EmailClassification {
  const category = CATEGORIES.includes(raw.category as EmailCategory)
    ? (raw.category as EmailCategory)
    : "Other";

  const urgencyNum = Number(raw.urgency);
  const urgency = ([1, 2, 3].includes(urgencyNum) ? urgencyNum : 2) as 1 | 2 | 3;

  // The model is told to send a date "or null" and sometimes sends the string
  // "null", "N/A" or free text. Keep anything date-like, drop the rest.
  const rawDate = typeof raw.reservation_date === "string" ? raw.reservation_date.trim() : "";
  const looksLikeDate = rawDate.length > 0 && !/^(null|none|n\/a|-)$/i.test(rawDate);

  return {
    category,
    greek_summary: typeof raw.greek_summary === "string" ? raw.greek_summary : "",
    urgency,
    ...(looksLikeDate ? { reservation_date: rawDate } : {}),
    suggested_action: typeof raw.suggested_action === "string" ? raw.suggested_action : "",
  };
}
