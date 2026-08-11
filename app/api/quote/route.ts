import { Resend } from "resend";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { calcRentalDays, getDailyRate } from "@/lib/pricing";
import type { Rate, ExtrasConfig, PricingGroup } from "@/lib/pricing";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  const body = await req.json();

  // Verify reCAPTCHA
  const captchaRes = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${body.captchaToken}`,
  });
  const captchaData = await captchaRes.json();
  if (!captchaData.success) {
    return NextResponse.json({ error: "reCAPTCHA verification failed" }, { status: 400 });
  }

  const {
    vehicleType,
    selectedModel,
    pricingGroup,
    pickupLocation,
    dropoffLocation,
    pickupDate,
    pickupTime,
    dropoffDate,
    dropoffTime,
    transmission,
    driverAge,
    babySeat,
    childSeat,
    fdw,
    additionalDrivers,
    title,
    firstName,
    lastName,
    email,
    dob,
    address,
    postalCode,
    city,
    country,
    mobileTel,
    landlineTel,
    comments,
  } = body;

  // Calculate price server-side
  const [{ data: rates }, { data: extrasConfig }] = await Promise.all([
    supabaseAdmin.from("rates").select("*"),
    supabaseAdmin.from("extras_config").select("*"),
  ]);

  const xRate = (key: string, fallback: number) =>
    (extrasConfig as ExtrasConfig[] ?? []).find(e => e.key === key)?.daily_rate ?? fallback;

  const rentalDays = calcRentalDays(pickupDate, dropoffDate, pickupTime, dropoffTime);
  const pickupMonth = new Date(pickupDate).getMonth() + 1;
  const dailyRate = pricingGroup
    ? getDailyRate(rates as Rate[] ?? [], pricingGroup as PricingGroup, pickupMonth, rentalDays)
    : 0;
  const vehicleSubtotal = parseFloat((dailyRate * rentalDays).toFixed(2));
  const extrasDailyTotal =
    (fdw ? xRate("fdw", 5) : 0) +
    (Number(babySeat) * xRate("baby_seat", 3)) +
    (Number(childSeat) * xRate("child_seat", 3)) +
    (Number(additionalDrivers) * xRate("additional_drivers", 2.5));
  const extrasSubtotal = parseFloat((extrasDailyTotal * rentalDays).toFixed(2));
  const total = parseFloat((vehicleSubtotal + extrasSubtotal).toFixed(2));
  const deposit = parseFloat((total * 0.3).toFixed(2));
  const balanceDue = parseFloat((total - deposit).toFixed(2));
  const showPrice = !!(pricingGroup && rentalDays > 0 && dailyRate > 0);

  const priceSection = showPrice ? `
    <h3>Price Estimate</h3>
    <table cellpadding="6" style="border-collapse:collapse; width:100%; max-width:420px;">
      <tr><td><strong>${selectedModel}</strong> — ${rentalDays} day${rentalDays > 1 ? "s" : ""} × €${dailyRate.toFixed(2)}</td><td align="right">€${vehicleSubtotal.toFixed(2)}</td></tr>
      ${fdw ? `<tr><td>Full Damage Waiver — ${rentalDays} day${rentalDays > 1 ? "s" : ""} × €${xRate("fdw", 5).toFixed(2)}</td><td align="right">€${(xRate("fdw", 5) * rentalDays).toFixed(2)}</td></tr>` : ""}
      ${Number(babySeat) > 0 ? `<tr><td>Baby Seat ×${babySeat} — ${rentalDays} day${rentalDays > 1 ? "s" : ""} × €${xRate("baby_seat", 3).toFixed(2)}</td><td align="right">€${(xRate("baby_seat", 3) * Number(babySeat) * rentalDays).toFixed(2)}</td></tr>` : ""}
      ${Number(childSeat) > 0 ? `<tr><td>Child Seat ×${childSeat} — ${rentalDays} day${rentalDays > 1 ? "s" : ""} × €${xRate("child_seat", 3).toFixed(2)}</td><td align="right">€${(xRate("child_seat", 3) * Number(childSeat) * rentalDays).toFixed(2)}</td></tr>` : ""}
      ${Number(additionalDrivers) > 0 ? `<tr><td>Additional Driver ×${additionalDrivers} — ${rentalDays} day${rentalDays > 1 ? "s" : ""} × €${xRate("additional_drivers", 2.5).toFixed(2)}</td><td align="right">€${(xRate("additional_drivers", 2.5) * Number(additionalDrivers) * rentalDays).toFixed(2)}</td></tr>` : ""}
      <tr style="border-top:2px solid #ccc;"><td><strong>Total (incl. VAT)</strong></td><td align="right"><strong>€${total.toFixed(2)}</strong></td></tr>
      <tr><td style="color:#666;">Deposit (30%) due on confirmation</td><td align="right" style="color:#666;">€${deposit.toFixed(2)}</td></tr>
      <tr><td style="color:#666;">Balance due at pick-up</td><td align="right" style="color:#666;">€${balanceDue.toFixed(2)}</td></tr>
    </table>
    <p style="color:#888;font-size:12px;">This is an estimate only. Final price confirmed upon booking.</p>
  ` : "";

  await resend.emails.send({
    from: "Anadyon Website <noreply@anadyon.gr>",
    to: ["customerservice@anadyon.gr", "anadyon.gr@gmail.com"],
    replyTo: email,
    subject: `New Quote Request — ${vehicleType} — ${firstName} ${lastName}`,
    html: `
      <h2>New Quote Request</h2>

      <h3>Rental Details</h3>
      <table cellpadding="6" style="border-collapse:collapse;">
        <tr><td><strong>Vehicle Type:</strong></td><td>${vehicleType}</td></tr>
        <tr><td><strong>Model:</strong></td><td>${selectedModel}</td></tr>
        <tr><td><strong>Pick-up Location:</strong></td><td>${pickupLocation}</td></tr>
        <tr><td><strong>Drop-off Location:</strong></td><td>${dropoffLocation}</td></tr>
        <tr><td><strong>Pick-up:</strong></td><td>${pickupDate} at ${pickupTime}</td></tr>
        <tr><td><strong>Drop-off:</strong></td><td>${dropoffDate} at ${dropoffTime}</td></tr>
        <tr><td><strong>Rental Days:</strong></td><td>${rentalDays}</td></tr>
        ${transmission ? `<tr><td><strong>Transmission:</strong></td><td>${transmission}</td></tr>` : ""}
        <tr><td><strong>Driver Age:</strong></td><td>${driverAge}</td></tr>
      </table>

      <h3>Extras</h3>
      <table cellpadding="6" style="border-collapse:collapse;">
        <tr><td><strong>Baby Seat (0–9 months):</strong></td><td>${babySeat}</td></tr>
        <tr><td><strong>Child Seat (9+ months):</strong></td><td>${childSeat}</td></tr>
        <tr><td><strong>Full Damage Waiver (FDW):</strong></td><td>${fdw ? "Yes" : "No"}</td></tr>
        <tr><td><strong>Additional Drivers:</strong></td><td>${additionalDrivers}</td></tr>
      </table>

      ${priceSection}

      <h3>Customer Details</h3>
      <table cellpadding="6" style="border-collapse:collapse;">
        <tr><td><strong>Name:</strong></td><td>${title} ${firstName} ${lastName}</td></tr>
        <tr><td><strong>Email:</strong></td><td>${email}</td></tr>
        <tr><td><strong>Date of Birth:</strong></td><td>${dob}</td></tr>
        <tr><td><strong>Address:</strong></td><td>${address}, ${postalCode}, ${city}, ${country}</td></tr>
        <tr><td><strong>Mobile:</strong></td><td>${mobileTel}</td></tr>
        ${landlineTel ? `<tr><td><strong>Landline:</strong></td><td>${landlineTel}</td></tr>` : ""}
        ${comments ? `<tr><td><strong>Comments:</strong></td><td>${comments}</td></tr>` : ""}
      </table>

      <hr/>
      <p style="color:#888;font-size:12px;">This is not a confirmed reservation. Anadyon Rentals will contact the customer to confirm availability.</p>
    `,
  });

  // Auto-confirmation to customer
  await resend.emails.send({
    from: "Anadyon Rentals <noreply@anadyon.gr>",
    to: email,
    subject: "Your Quote Request — Anadyon Rentals",
    html: `
      <p>Dear ${title} ${firstName} ${lastName},</p>
      <p>Thank you for your quote request. Please note that <strong>this is not a confirmed reservation</strong>. We will contact you as soon as possible with availability and pricing.</p>

      <h3>Your Request Summary</h3>
      <table cellpadding="6" style="border-collapse:collapse;">
        <tr><td><strong>Vehicle:</strong></td><td>${selectedModel}</td></tr>
        <tr><td><strong>Pick-up:</strong></td><td>${pickupLocation} on ${pickupDate} at ${pickupTime}</td></tr>
        <tr><td><strong>Drop-off:</strong></td><td>${dropoffLocation} on ${dropoffDate} at ${dropoffTime}</td></tr>
        <tr><td><strong>Rental Days:</strong></td><td>${rentalDays}</td></tr>
      </table>

      ${showPrice ? `
      <h3>Price Estimate</h3>
      <table cellpadding="6" style="border-collapse:collapse; width:100%; max-width:420px;">
        <tr><td><strong>${selectedModel}</strong> — ${rentalDays} day${rentalDays > 1 ? "s" : ""} × €${dailyRate.toFixed(2)}</td><td align="right">€${vehicleSubtotal.toFixed(2)}</td></tr>
        ${fdw ? `<tr><td>Full Damage Waiver</td><td align="right">€${(xRate("fdw", 5) * rentalDays).toFixed(2)}</td></tr>` : ""}
        ${Number(babySeat) > 0 ? `<tr><td>Baby Seat ×${babySeat}</td><td align="right">€${(xRate("baby_seat", 3) * Number(babySeat) * rentalDays).toFixed(2)}</td></tr>` : ""}
        ${Number(childSeat) > 0 ? `<tr><td>Child Seat ×${childSeat}</td><td align="right">€${(xRate("child_seat", 3) * Number(childSeat) * rentalDays).toFixed(2)}</td></tr>` : ""}
        ${Number(additionalDrivers) > 0 ? `<tr><td>Additional Driver ×${additionalDrivers}</td><td align="right">€${(xRate("additional_drivers", 2.5) * Number(additionalDrivers) * rentalDays).toFixed(2)}</td></tr>` : ""}
        <tr style="border-top:2px solid #ccc;"><td><strong>Total (incl. VAT)</strong></td><td align="right"><strong>€${total.toFixed(2)}</strong></td></tr>
        <tr><td style="color:#666;">Deposit (30%) due on confirmation</td><td align="right" style="color:#666;">€${deposit.toFixed(2)}</td></tr>
        <tr><td style="color:#666;">Balance due at pick-up</td><td align="right" style="color:#666;">€${balanceDue.toFixed(2)}</td></tr>
      </table>
      <p style="color:#888;font-size:12px;">This is an estimate only. Final price confirmed upon booking.</p>
      ` : ""}

      <p>Please add <strong>customerservice@anadyon.gr</strong> to your safe senders list to avoid our reply going to spam.</p>
      <p>Thank you,<br/>Anadyon Rentals<br/>Tel: +30 26950 41878</p>
    `,
  });

  return NextResponse.json({ success: true });
}
