import { describe, expect, it } from "vitest";
import { athensDateTimeToUtc, bookingConfirmedMail, formatPaymentDeadline, quoteConfirmationMail } from "./bookingEmails";

const details = {
  customerName: "Alex Customer",
  customerEmail: "alex@example.com",
  reference: "ABC123",
  vehicle: "Fiat Panda",
  pickupDate: "2026-08-25",
  pickupTime: "09:00",
  pickupLocation: "Zakynthos Airport",
  returnDate: "2026-08-28",
  returnTime: "09:00",
  total: 197.6,
  deposit: 59.28,
  balanceDue: 138.32,
};

describe("booking lifecycle emails", () => {
  it("uses the approved quote-confirmation subject and wording", () => {
    const mail = quoteConfirmationMail(details, "2026-08-24T17:00:00+03:00");
    expect(mail.subject).toBe("Quote confirmation");
    expect(mail.html).toContain(
      "We are pleased to confirm that the requested vehicle category is currently available and that the final rental price is €197.60. Your booking is not yet confirmed. To secure it, please pay the 30% deposit by",
    );
    expect(mail.html).toContain("ABC123");
  });

  it("confirms a booking only in the post-payment email", () => {
    const mail = bookingConfirmedMail(details);
    expect(mail.subject).toBe("Booking confirmed — ABC123");
    expect(mail.html).toContain("We have received your payment and your booking is now confirmed.");
    expect(mail.html).toContain("Payment received:</td><td>€59.28");
    expect(mail.html).toContain("Balance at pick-up:</td><td>€138.32");
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
