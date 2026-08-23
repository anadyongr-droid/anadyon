import type { Mail } from "@/lib/mailer";

export interface BookingEmailDetails {
  customerName: string;
  /** Preferred for the greeting; falls back to the first word of customerName. */
  customerFirstName?: string | null;
  customerEmail: string;
  reference: string;
  vehicle: string;
  pickupDate: string;
  pickupTime: string;
  pickupLocation: string;
  returnDate: string;
  returnTime: string;
  /** Where the vehicle comes back. Often the pick-up point, but not always. */
  returnLocation?: string | null;
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

/**
 * How the customer is addressed.
 *
 * First name only — "Dear Alexios" rather than "Dear Alexios Diakogiannis",
 * which reads like a bank letter. Falls back to the first word of the full
 * name when the split field is not populated, and to a neutral greeting when
 * there is no usable name at all rather than addressing someone as "Dear ,".
 */
function greeting(details: BookingEmailDetails): string {
  const first = details.customerFirstName?.trim()
    || details.customerName?.trim().split(/\s+/)[0]
    || "";
  return first ? `Dear ${esc(first)},` : "Hello,";
}

/**
 * The shell both emails sit in.
 *
 * `margin:0` rather than `margin:0 auto`: the block used to be centred in the
 * window, which on a wide screen left the text floating in the middle of an
 * empty field and reading as stiff and formal. Left-aligned, with an explicit
 * `text-align:left` so a client's own centring cannot be inherited.
 */
function shell(inner: string): string {
  return `
      <div style="font-family:sans-serif;max-width:600px;margin:0;text-align:left">
        ${inner}
      </div>
    `;
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
  // The return line carried a date and time but no place, so a customer
  // dropping off somewhere other than where they collected had nothing telling
  // them where to go. Falls back to the pick-up location, which is what a
  // same-place rental means, rather than printing an empty dash.
  const returnLocation = details.returnLocation?.trim() || details.pickupLocation;

  return `
    <table cellpadding="6" style="border-collapse:collapse;margin:16px 0;text-align:left">
      <tr><td style="color:#666">Reference:</td><td><strong>${esc(details.reference)}</strong></td></tr>
      <tr><td style="color:#666">Vehicle:</td><td><strong>${esc(details.vehicle)}</strong></td></tr>
      <tr><td style="color:#666">Pick-up:</td><td>${esc(details.pickupDate)} at ${esc(details.pickupTime)} — ${esc(details.pickupLocation)}</td></tr>
      <tr><td style="color:#666">Return:</td><td>${esc(details.returnDate)} at ${esc(details.returnTime)} — ${esc(returnLocation)}</td></tr>
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
    html: shell(`
        <h2 style="color:#1e3a5f">Quote Confirmation</h2>
        <p>${greeting(details)}</p>
        <p>Many thanks for choosing Anadyon for your rental.</p>
        <p>We are pleased to confirm that the requested vehicle category is available and that the final rental price is €${euros(details.total)}. To secure it, please pay the 30% deposit by ${esc(formattedDeadline)}. Until then the booking isn't confirmed, and we can't hold the car past that date.</p>
        ${rentalDetails(details, "quote")}
        <p>Please use the payment instructions provided by our team.</p>
        <p>Thank you,<br/>Anadyon Customer Service</p>
    `),
  };
}

export function bookingConfirmedMail(details: BookingEmailDetails): Mail {
  return {
    from: "Anadyon Rentals <no-reply@anadyon.gr>",
    to: [details.customerEmail],
    subject: `Booking confirmed — ${details.reference}`,
    html: shell(`
        <h2 style="color:#1e3a5f">Booking Confirmed</h2>
        <p>${greeting(details)}</p>
        <p>We've received your payment — you're all set, your booking is confirmed.</p>
        ${rentalDetails(details, "confirmed")}
        <p>When you arrive, please bring your driving licence, passport and the card you paid with. If your flight is delayed, call us on +30 6988 010188 and we'll wait for you.</p>
        <p>See you in Zakynthos.</p>
        <p>Anadyon Customer Service</p>
    `),
  };
}
