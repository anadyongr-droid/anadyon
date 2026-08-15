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
    return JSON.parse(text) as EmailClassification;
  } catch (err) {
    console.error("Email classification error:", err);
    return null;
  }
}
