import { describe, expect, it } from "vitest";
import { athensDateTimeToUtc, bookingConfirmedMail, formatPaymentDeadline, quoteConfirmationMail } from "./bookingEmails";

const details = {
  customerName: "Alex Customer",
  customerFirstName: "Alex",
  customerEmail: "alex@example.com",
  reference: "ABC123",
  vehicle: "Fiat Panda",
  pickupDate: "2026-08-25",
  pickupTime: "09:00",
  pickupLocation: "Zakynthos Airport",
  returnDate: "2026-08-28",
  returnTime: "09:00",
  returnLocation: "Zakynthos Port",
  total: 197.6,
  deposit: 59.28,
  balanceDue: 138.32,
};

describe("booking lifecycle emails", () => {
  it("uses the approved quote-confirmation subject and wording", () => {
    const mail = quoteConfirmationMail(details, "2026-08-24T17:00:00+03:00");
    expect(mail.subject).toBe("Quote confirmation");
    expect(mail.replyTo).toBe("customerservice@anadyon.gr");
    expect(mail.bcc).toEqual(["customerservice@anadyon.gr"]);
    expect(mail.html).toContain("Many thanks for choosing Anadyon for your rental.");
    expect(mail.html).toContain(
      "We are pleased to confirm that the requested vehicle category is available and that the final rental price is €197.60. Your booking is not yet confirmed. To secure it, please pay the 30% deposit by",
    );
    expect(mail.html).toContain("Availability cannot be guaranteed in case of a late payment.");
    expect(mail.html).toContain("ABC123");
  });

  it("confirms a booking only in the post-payment email", () => {
    const mail = bookingConfirmedMail(details);
    expect(mail.subject).toBe("Booking confirmed — ABC123");
    expect(mail.html).toContain("We have received your payment, thank you! Your booking is now confirmed.");
    expect(mail.html).toContain("Payment received:</td><td>€59.28");
    expect(mail.html).toContain("Balance at pick-up:</td><td>€138.32");
  });

  it("greets the customer by first name, not their full name", () => {
    // "Dear Alex Customer," reads like a bank letter.
    for (const mail of [quoteConfirmationMail(details, "2026-08-24T17:00:00+03:00"), bookingConfirmedMail(details)]) {
      expect(mail.html).toContain("Dear Alex,");
      expect(mail.html).not.toContain("Dear Alex Customer,");
    }
  });

  it("falls back to the first word of the full name, then to a neutral greeting", () => {
    const noFirst = bookingConfirmedMail({ ...details, customerFirstName: null });
    expect(noFirst.html).toContain("Dear Alex,");

    const noName = bookingConfirmedMail({ ...details, customerFirstName: null, customerName: "" });
    // Never "Dear ,".
    expect(noName.html).toContain("Hello,");
    expect(noName.html).not.toContain("Dear ,");
  });

  it("tells the customer where to return the vehicle, not only when", () => {
    for (const mail of [quoteConfirmationMail(details, "2026-08-24T17:00:00+03:00"), bookingConfirmedMail(details)]) {
      expect(mail.html).toContain("2026-08-28 at 09:00 — Zakynthos Port");
    }
  });

  it("falls back to the pick-up location when no return location is recorded", () => {
    // A same-place rental, which is the common case — not an empty dash.
    const mail = bookingConfirmedMail({ ...details, returnLocation: null });
    expect(mail.html).toContain("2026-08-28 at 09:00 — Zakynthos Airport");
  });

  it("left-aligns the body rather than centring it in the window", () => {
    for (const mail of [quoteConfirmationMail(details, "2026-08-24T17:00:00+03:00"), bookingConfirmedMail(details)]) {
      expect(mail.html).toContain("text-align:left");
      expect(mail.html).not.toContain("margin:0 auto");
    }
  });

  it("escapes a name that contains markup", () => {
    const mail = bookingConfirmedMail({ ...details, customerFirstName: '<script>x</script>' });
    expect(mail.html).not.toContain("<script>x</script>");
    expect(mail.html).toContain("&lt;script&gt;");
  });

  it("does not claim a pick-up balance after full payment", () => {
    const mail = bookingConfirmedMail({ ...details, balanceDue: 0 });
    expect(mail.html).toContain("Payment received:</td><td>€197.60");
    expect(mail.html).toContain("Balance at pick-up:</td><td>€0.00");
  });

  it("renders payment deadlines in Zakynthos local time", () => {
    expect(formatPaymentDeadline("2026-08-24T14:00:00Z")).toContain("17:00");
    expect(athensDateTimeToUtc("2026-08-24", "17:00").toISOString()).toBe("2026-08-24T14:00:00.000Z");
    expect(athensDateTimeToUtc("2026-12-24", "17:00").toISOString()).toBe("2026-12-24T15:00:00.000Z");
  });
});
