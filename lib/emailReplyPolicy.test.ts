import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bookingConfirmedMail, quoteConfirmationMail } from "./bookingEmails";

/**
 * Who a reply reaches, for every email the system sends.
 *
 * Two rules, and they pull in opposite directions:
 *
 *   - An email **to a customer** must give them somewhere to reply. Several
 *     are sent from `no-reply@`, so without an explicit Reply-To a customer
 *     answering their own booking confirmation reached nobody at all.
 *
 *   - An **alert to the office** must not reply to the customer. That was the
 *     original fault: a staff member hitting Reply to ask a colleague about
 *     availability wrote to the client instead. The customer's address belongs
 *     in the body, as text — not as a Reply-To, and not as a button.
 *
 * They were reconciled for a while by making the quote-request email replyable
 * and carving out an exception for the price-manipulation warning. That held
 * until a "[NO VEHICLE]" flag rode the same email and a staff member replied to
 * it — the identical fault, a second time, through the exception rather than
 * the rule.
 *
 * The quote notification and the alert are now **two separate emails**, so
 * neither rule has to bend: the notification replies to the customer, the alert
 * replies to the office, and no message is both.
 */
const OFFICE = "customerservice@anadyon.gr";

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

describe("emails to customers come from the customer service team", () => {
  it("are sent from customerservice@, never from no-reply@", () => {
    // A customer should see a message from the people they are dealing with,
    // not from a mailbox that signals "do not answer this".
    for (const mail of [quoteConfirmationMail(details, "2026-08-24T17:00:00+03:00"), bookingConfirmedMail(details)]) {
      expect(mail.from).toContain(OFFICE);
      expect(mail.from).not.toContain("no-reply@");
    }
  });
});

describe("emails to customers reply to the office", () => {
  it("quote confirmation", () => {
    expect(quoteConfirmationMail(details, "2026-08-24T17:00:00+03:00").replyTo).toBe(OFFICE);
  });

  it("booking confirmation", () => {
    // Sent from no-reply@; without this the reply is simply lost.
    expect(bookingConfirmedMail(details).replyTo).toBe(OFFICE);
  });

  it("never replies to the customer's own address", () => {
    for (const mail of [quoteConfirmationMail(details, "2026-08-24T17:00:00+03:00"), bookingConfirmedMail(details)]) {
      expect(mail.replyTo).not.toBe(details.customerEmail);
    }
  });
});

describe("alerts to the office never reply to the customer", () => {
  const quoteRoute = readFileSync(new URL("../app/api/quote/route.ts", import.meta.url), "utf8");
  const webhook = readFileSync(new URL("../app/api/resend-webhook/route.ts", import.meta.url), "utf8");

  it("the quote-request notification replies to the customer who submitted it", () => {
    // The exception, alongside the New Reservation alert below: both announce a
    // booking somebody is about to act on, and answering the customer is the
    // next step. Reply-To changes where an answer goes, never who is sent the
    // mail — that assertion lives in quoteTamperResistance.
    const block = quoteRoute.match(/const officeMail = \([\s\S]*?subject:/)?.[0] ?? "";
    expect(block, "officeMail block not found").not.toBe("");
    // Conditional: still suppressed when the price was manipulated, so a reply
    // cannot reach the person who tampered with it. Behaviour for both branches
    // is asserted in quoteTamperResistance against the real route.
    expect(block).toContain("manipulated ? {} : { replyTo: email }");
  });

  it("the quote-request alert sets no reply address at all", () => {
    // Not conditional, unlike the notification above. This email exists to be
    // acted on internally, so there is no case in which Reply should leave the
    // office — and an alert that is sometimes replyable is what produced the
    // fault twice.
    const block = quoteRoute.match(/const officeAlertMail = \([\s\S]*?\n  \}\);/)?.[0] ?? "";
    expect(block, "officeAlertMail block not found").not.toBe("");
    expect(block).not.toContain("replyTo");
  });

  it("keeps the alert flags out of the notification's subject", () => {
    // The flags are what make an email look like something to discuss rather
    // than answer. They belong on the message whose Reply stays inside.
    const block = quoteRoute.match(/const officeMail = \([\s\S]*?subject:.*/)?.[0] ?? "";
    expect(block).not.toContain("[NO VEHICLE]");
    expect(block).not.toContain("[ALERT]");
  });

  it("carries no clickable contact anywhere in either body", () => {
    // The address is information, not an action. A button was added here once
    // unasked and removed; a mailto link replaced it and was removed too.
    for (const name of ["officeMail", "officeAlertMail"]) {
      const block = quoteRoute.match(new RegExp(`const ${name} = \\([\\s\\S]*?\\n  \\}\\);`))?.[0] ?? "";
      expect(block, `${name} block not found`).not.toBe("");
      expect(block, name).not.toContain("mailto:");
      expect(block, name).not.toContain("Compose email to customer");
    }
  });

  it("the delivery-failure alert sets no reply address", () => {
    const alert = webhook.match(/from: "Anadyon Alerts <no-reply@anadyon\.gr>"[\s\S]{0,400}/)?.[0] ?? "";
    expect(alert, "webhook alert not found").not.toBe("");
    expect(alert).not.toContain("replyTo");
  });
});

describe("the new-reservation alert is a deliberate exception", () => {
  const adminCreate = readFileSync(new URL("../app/api/admin/reservations/route.ts", import.meta.url), "utf8");
  const block = adminCreate.match(/from: "Anadyon Alerts <no-reply@anadyon\.gr>"[\s\S]{0,900}/)?.[0] ?? "";

  it("replies to the customer, because answering them is the next step", () => {
    // Unlike the other office alerts: this one announces a booking somebody is
    // about to act on, and Tasos asked for Reply to reach the customer.
    expect(block, "alert block not found").not.toBe("");
    expect(block).toContain("replyTo");
    expect(block).toContain("responseData.customer_email");
  });

  it("omits the reply address entirely when there is no customer email", () => {
    // Spread rather than assigned, so the key is absent rather than empty — an
    // empty Reply-To bounces the reply instead of falling back to the sender.
    expect(block).toMatch(/\.\.\.\(String\(responseData\.customer_email/);
  });

  it("goes to customerservice@ only, which already forwards onward", () => {
    // Naming anadyon.gr@gmail.com as well delivered every alert twice to the
    // same person, once direct and once via the forward.
    //
    // Asserted against the recipient list itself rather than the block text:
    // the comment above it legitimately mentions the forwarding address, and
    // searching the raw source failed on the explanation rather than the code.
    const recipients = block.match(/to:\s*(\[[^\]]*\])/)?.[1] ?? "";
    expect(recipients, "recipient list not found").not.toBe("");
    expect(recipients).toContain("customerservice@anadyon.gr");
    expect(recipients).not.toContain("anadyon.gr@gmail.com");
  });
});

describe("the contact form is deliberately exempt", () => {
  const contact = readFileSync(new URL("../app/api/contact/route.ts", import.meta.url), "utf8");

  it("still replies to whoever wrote in", () => {
    // Not an alert: it is an enquiry forwarded to the office, where replying to
    // the sender is the entire point. Explicitly excluded when the Reply-To
    // rule was introduced, and left alone since.
    expect(contact).toContain("replyTo: email");
  });
});
