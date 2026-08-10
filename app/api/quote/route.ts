import { Resend } from "resend";
import { NextRequest, NextResponse } from "next/server";

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

  await resend.emails.send({
    from: "Anadyon Website <onboarding@resend.dev>",
    to: ["customerservice@anadyon.gr", "anadyon.gr@gmail.com"],
    replyTo: email,
    subject: `New Quote Request — ${vehicleType} — ${firstName} ${lastName}`,
    html: `
      <h2>New Quote Request</h2>

      <h3>Rental Details</h3>
      <table cellpadding="6" style="border-collapse:collapse;">
        <tr><td><strong>Vehicle Type:</strong></td><td>${vehicleType}</td></tr>
        <tr><td><strong>Pick-up Location:</strong></td><td>${pickupLocation}</td></tr>
        <tr><td><strong>Drop-off Location:</strong></td><td>${dropoffLocation}</td></tr>
        <tr><td><strong>Pick-up:</strong></td><td>${pickupDate} at ${pickupTime}</td></tr>
        <tr><td><strong>Drop-off:</strong></td><td>${dropoffDate} at ${dropoffTime}</td></tr>
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
    from: "Anadyon Rentals <onboarding@resend.dev>",
    to: email,
    subject: "Your Quote Request — Anadyon Rentals",
    html: `
      <p>Dear ${title} ${firstName} ${lastName},</p>
      <p>Thank you for your quote request. Please note that <strong>this is not a confirmed reservation</strong>. We will contact you as soon as possible with availability and pricing.</p>

      <h3>Your Request Summary</h3>
      <table cellpadding="6" style="border-collapse:collapse;">
        <tr><td><strong>Vehicle Type:</strong></td><td>${vehicleType}</td></tr>
        <tr><td><strong>Pick-up:</strong></td><td>${pickupLocation} on ${pickupDate} at ${pickupTime}</td></tr>
        <tr><td><strong>Drop-off:</strong></td><td>${dropoffLocation} on ${dropoffDate} at ${dropoffTime}</td></tr>
      </table>

      <p>Please add <strong>customerservice@anadyon.gr</strong> to your safe senders list to avoid our reply going to spam.</p>
      <p>Thank you,<br/>Anadyon Rentals<br/>Tel: +30 26950 41878</p>
    `,
  });

  return NextResponse.json({ success: true });
}