import { Resend } from "resend";
import { NextRequest, NextResponse } from "next/server";
import { verifyRecaptcha } from "@/lib/recaptcha";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  const { name, email, message, captchaToken } = await req.json();

  if (!await verifyRecaptcha(captchaToken)) {
    return NextResponse.json({ error: "reCAPTCHA verification failed" }, { status: 400 });
  }

  // Email to Anadyon
  await resend.emails.send({
    from: "Anadyon Website <noreply@anadyon.gr>",
    to: ["customerservice@anadyon.gr"],
    replyTo: email,
    subject: `New Contact Message from ${name}`,
    html: `
      <h2>New Contact Message</h2>
      <table cellpadding="6" style="border-collapse:collapse;">
        <tr><td><strong>Name:</strong></td><td>${name}</td></tr>
        <tr><td><strong>Email:</strong></td><td>${email}</td></tr>
        <tr><td><strong>Message:</strong></td><td>${message}</td></tr>
      </table>
    `,
  });

  // Auto-reply to sender
  await resend.emails.send({
    from: "Anadyon Rentals <noreply@anadyon.gr>",
    to: email,
    subject: "We received your message — Anadyon Rentals",
    html: `
      <p>Dear ${name},</p>
      <p>Thank you for contacting Anadyon Rentals. We have received your message and will get back to you as soon as possible.</p>
      <p>If your enquiry is urgent, please call us on <strong>+30 26950 41878</strong> (daily 09:00–21:00).</p>
      <p>Thank you,<br/>Anadyon Rentals<br/>Zakynthos, Greece</p>
    `,
  });

  return NextResponse.json({ success: true });
}
