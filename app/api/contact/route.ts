import { sendMail } from "@/lib/mailer";
import { NextRequest, NextResponse } from "next/server";
import { verifyRecaptcha } from "@/lib/recaptcha";
import { checkRateLimit } from "@/lib/rateLimit";
import { z } from "zod";


const ContactSchema = z.object({
  captchaToken: z.string().min(1),
  name: z.string().min(1).max(100),
  email: z.string().email().max(200),
  phone: z.string().max(30).optional(),
  subject: z.string().min(1).max(200),
  message: z.string().min(1).max(5000),
});

function esc(val: unknown): string {
  return String(val ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function POST(req: NextRequest) {
  const rl = await checkRateLimit(req, { limit: 5, windowMs: 15 * 60 * 1000 });
  if (!rl.ok) return rl.response!;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = ContactSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid form data", details: parsed.error.flatten() }, { status: 400 });
  }

  const { captchaToken, name, email, phone, subject, message } = parsed.data;

  if (!await verifyRecaptcha(captchaToken)) {
    return NextResponse.json({ error: "reCAPTCHA verification failed" }, { status: 400 });
  }

  const { error } = await sendMail({
    from: "Anadyon Website <customerservice@anadyon.gr>",
    to: ["customerservice@anadyon.gr"],
    replyTo: email,
    subject: `Contact Form: ${esc(subject)}`,
    html: `
      <h2>New Contact Form Submission</h2>
      <table cellpadding="6" style="border-collapse:collapse;">
        <tr><td><strong>Name:</strong></td><td>${esc(name)}</td></tr>
        <tr><td><strong>Email:</strong></td><td>${esc(email)}</td></tr>
        ${phone ? `<tr><td><strong>Phone:</strong></td><td>${esc(phone)}</td></tr>` : ""}
        <tr><td><strong>Subject:</strong></td><td>${esc(subject)}</td></tr>
      </table>
      <h3>Message</h3>
      <p style="white-space:pre-wrap;">${esc(message)}</p>
    `,
  });

  if (error) {
    console.error("Contact form email error:", error);
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
