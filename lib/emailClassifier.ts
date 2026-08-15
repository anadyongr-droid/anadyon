import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;
function getClient() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

export interface EmailClassification {
  category: "Reservation" | "Cancellation" | "General" | "Internal" | "Spam";
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

  const prompt = `You are an assistant for Anadyon Rentals, a vehicle rental company in Greece.

Classify this incoming email and respond with JSON only, no markdown.

Email:
From: ${senderEmail}
Subject: ${subject ?? "(no subject)"}
Body: ${(body ?? "").slice(0, 2000)}

Respond with exactly this JSON structure:
{
  "category": "Reservation" | "Cancellation" | "General" | "Internal" | "Spam",
  "greek_summary": "1-2 sentence summary in Greek",
  "urgency": 1 | 2 | 3,
  "reservation_date": "YYYY-MM-DD or null",
  "suggested_action": "Brief action in English"
}

Urgency: 1=low (FYI), 2=medium (respond within 24h), 3=high (respond immediately — same-day pickup, complaint, cancellation).
Category: Reservation=booking request or modification, Cancellation=wants to cancel, General=other customer inquiry, Internal=from your own staff/system, Spam=unwanted.`;

  try {
    const msg = await getClient().messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
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

const CATEGORIES = ["Reservation", "Cancellation", "General", "Internal", "Spam"] as const;

/** Coerces model output into a shape the database will accept. */
function normalise(raw: Record<string, unknown>): EmailClassification {
  const category = CATEGORIES.includes(raw.category as (typeof CATEGORIES)[number])
    ? (raw.category as EmailClassification["category"])
    : "General";

  const urgencyNum = Number(raw.urgency);
  const urgency = ([1, 2, 3].includes(urgencyNum) ? urgencyNum : 2) as 1 | 2 | 3;

  // The model is told to send "YYYY-MM-DD or null" and sometimes sends the
  // string "null" or free text — either would break a date column.
  const rawDate = typeof raw.reservation_date === "string" ? raw.reservation_date.trim() : "";
  const reservation_date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : undefined;

  return {
    category,
    greek_summary: typeof raw.greek_summary === "string" ? raw.greek_summary : "",
    urgency,
    ...(reservation_date ? { reservation_date } : {}),
    suggested_action: typeof raw.suggested_action === "string" ? raw.suggested_action : "",
  };
}
