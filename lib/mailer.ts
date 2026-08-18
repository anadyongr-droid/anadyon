import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * When MAIL_REDIRECT_TO is set, every message is delivered to that one address
 * instead of its real recipients, which are named in the subject line.
 *
 * It exists so the booking flow can be exercised end to end — including the
 * real Resend call — without a test reservation arriving in the office inbox
 * looking like a genuine one. The variable is unset in production, where this
 * wrapper does nothing but forward to Resend.
 */
const REDIRECT = process.env.MAIL_REDIRECT_TO?.trim();

export interface Mail {
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}

export async function sendMail(mail: Mail) {
  const to = Array.isArray(mail.to) ? mail.to : [mail.to];
  if (REDIRECT) {
    return resend.emails.send({
      ...mail,
      to: [REDIRECT],
      subject: `[TEST → ${to.join(", ")}] ${mail.subject}`,
    });
  }
  return resend.emails.send({ ...mail, to });
}

/** True when mail is being diverted, so callers can say so in their response. */
export const mailIsRedirected = Boolean(REDIRECT);
