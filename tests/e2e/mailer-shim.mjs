// Mirrors lib/mailer.ts for the plain-Node live check.
import { Resend } from "resend";
const resend = new Resend(process.env.RESEND_API_KEY);
const REDIRECT = process.env.MAIL_REDIRECT_TO?.trim();
export async function sendMail(mail) {
  const to = Array.isArray(mail.to) ? mail.to : [mail.to];
  if (REDIRECT) return resend.emails.send({ ...mail, to: [REDIRECT], subject: `[TEST → ${to.join(", ")}] ${mail.subject}` });
  return resend.emails.send({ ...mail, to });
}
