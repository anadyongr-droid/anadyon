import type { Mail } from "@/lib/mailer";

export interface BookingEmailDetails {
  customerName: string;
  customerEmail: string;
  reference: string;
  vehicle: string;
  pickupDate: string;
  pickupTime: string;
  pickupLocation: string;
  returnDate: string;
  returnTime: string;
  total: number;
  deposit: number;
  balanceDue: number;
}

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function euros(value: number): string {
  return Number(value).toFixed(2);
}

export function formatPaymentDeadline(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid payment deadline");
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Athens",
    dateStyle: "long",
    timeStyle: "short",
  }).format(date);
}

/** Converts the wall-clock date/time used by the Zakynthos rental UI to UTC. */
export function athensDateTimeToUtc(date: string, time: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Athens",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(localAsUtc));
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  const offset = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute")) - localAsUtc;
  return new Date(localAsUtc - offset);
}

function rentalDetails(details: BookingEmailDetails, stage: "quote" | "confirmed"): string {
  const paymentRows = stage === "quote" ? `
      <tr><td style="color:#666">Deposit (30%):</td><td>€${euros(details.deposit)}</td></tr>
      <tr><td style="color:#666">Balance at pick-up:</td><td>€${euros(details.balanceDue)}</td></tr>` : `
      <tr><td style="color:#666">Payment received:</td><td>€${euros(details.balanceDue <= 0.005 ? details.total : details.deposit)}</td></tr>
      <tr><td style="color:#666">Balance at pick-up:</td><td>€${euros(details.balanceDue)}</td></tr>`;
  return `
    <table cellpadding="6" style="border-collapse:collapse;margin:16px 0">
      <tr><td style="color:#666">Reference:</td><td><strong>${esc(details.reference)}</strong></td></tr>
      <tr><td style="color:#666">Vehicle:</td><td><strong>${esc(details.vehicle)}</strong></td></tr>
      <tr><td style="color:#666">Pick-up:</td><td>${esc(details.pickupDate)} at ${esc(details.pickupTime)} — ${esc(details.pickupLocation)}</td></tr>
      <tr><td style="color:#666">Return:</td><td>${esc(details.returnDate)} at ${esc(details.returnTime)}</td></tr>
      <tr><td style="color:#666">Final rental price:</td><td><strong>€${euros(details.total)}</strong></td></tr>
      ${paymentRows}
    </table>`;
}

export function quoteConfirmationMail(
  details: BookingEmailDetails,
  deadline: string | Date,
): Mail {
  const formattedDeadline = formatPaymentDeadline(deadline);
  return {
    from: "Anadyon Rentals <no-reply@anadyon.gr>",
    to: [details.customerEmail],
    bcc: ["customerservice@anadyon.gr"],
    replyTo: "customerservice@anadyon.gr",
    subject: "Quote confirmation",
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#1e3a5f">Quote Confirmation</h2>
        <p>Dear ${esc(details.customerName)},</p>
        <p>We are pleased to confirm that the requested vehicle category is currently available and that the final rental price is €${euros(details.total)}. Your booking is not yet confirmed. To secure it, please pay the 30% deposit by ${esc(formattedDeadline)}.</p>
        ${rentalDetails(details, "quote")}
        <p>Please use the payment instructions provided by our team. Availability is held only until the payment deadline shown above.</p>
        <p>Thank you,<br/>Anadyon Rentals</p>
      </div>
    `,
  };
}

export function bookingConfirmedMail(details: BookingEmailDetails): Mail {
  return {
    from: "Anadyon Rentals <no-reply@anadyon.gr>",
    to: [details.customerEmail],
    subject: `Booking confirmed — ${details.reference}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#1e3a5f">Booking Confirmed</h2>
        <p>Dear ${esc(details.customerName)},</p>
        <p>We have received your payment and your booking is now confirmed.</p>
        ${rentalDetails(details, "confirmed")}
        <p>Thank you for choosing Anadyon Rentals!</p>
      </div>
    `,
  };
}
