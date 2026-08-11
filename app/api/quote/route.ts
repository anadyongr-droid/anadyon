import { Resend } from "resend";
import { NextRequest, NextResponse } from "next/server";
import { verifyRecaptcha } from "@/lib/recaptcha";
import { supabaseAdmin } from "@/lib/supabase";

const resend = new Resend(process.env.RESEND_API_KEY);

function generateRef(): string {
  const now = new Date();
  const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I, O, 0, 1 (visually ambiguous)
  const random = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `ANA-${yyyymm}-${random}`;
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  if (!await verifyRecaptcha(body.captchaToken)) {
    return NextResponse.json({ error: "reCAPTCHA verification failed" }, { status: 400 });
  }

  const {
    vehicleType,
    selectedModel,
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
    // Pre-calculated price from client
    rentalDays,
    dailyRate,
    vehicleSubtotal,
    extrasSubtotal,
    total,
    deposit,
    balanceDue,
  } = body;

  const ref = generateRef();
  const showPrice = total > 0;

  // Persist quote to DB (retained indefinitely for legal compliance; hidden from lookup after 1 year)
  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);
  await supabaseAdmin.from("quotes").insert({
    ref,
    title,
    first_name: firstName,
    last_name: lastName,
    email,
    dob,
    address,
    postal_code: postalCode,
    city,
    country,
    mobile_tel: mobileTel,
    landline_tel: landlineTel,
    vehicle_type: vehicleType,
    selected_model: selectedModel,
    pickup_location: pickupLocation,
    dropoff_location: dropoffLocation,
    pickup_date: pickupDate,
    pickup_time: pickupTime,
    dropoff_date: dropoffDate,
    dropoff_time: dropoffTime,
    driver_age: driverAge,
    transmission: transmission ?? null,
    baby_seat: Number(babySeat) || 0,
    child_seat: Number(childSeat) || 0,
    fdw: !!fdw,
    additional_drivers: Number(additionalDrivers) || 0,
    rental_days: rentalDays,
    daily_rate: dailyRate,
    vehicle_subtotal: vehicleSubtotal,
    extras_subtotal: extrasSubtotal,
    total,
    deposit,
    balance_due: balanceDue,
    comments: comments || null,
    expires_at: expiresAt.toISOString(),
  });

  // Internal notification to Anadyon (reply-to goes directly to client)
  await resend.emails.send({
    from: "Anadyon Website <customerservice@anadyon.gr>",
    to: ["customerservice@anadyon.gr", "anadyon.gr@gmail.com"],
    replyTo: email,
    subject: `Quote Request — ${lastName}, ${ref}`,
    html: `
      <h2>New Quote Request</h2>
      <p><strong>Reference:</strong> ${ref}</p>

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

      ${showPrice ? `
      <h3>Price Estimate</h3>
      <table cellpadding="6" style="border-collapse:collapse; width:100%; max-width:420px;">
        <tr><td><strong>${selectedModel}</strong> — ${rentalDays} day${rentalDays > 1 ? "s" : ""} × €${Number(dailyRate).toFixed(2)}</td><td align="right">€${Number(vehicleSubtotal).toFixed(2)}</td></tr>
        ${Number(extrasSubtotal) > 0 ? `<tr><td>Extras</td><td align="right">€${Number(extrasSubtotal).toFixed(2)}</td></tr>` : ""}
        <tr style="border-top:2px solid #ccc;"><td><strong>Total (incl. VAT)</strong></td><td align="right"><strong>€${Number(total).toFixed(2)}</strong></td></tr>
        <tr><td style="color:#666;">Deposit (30%) due on confirmation</td><td align="right" style="color:#666;">€${Number(deposit).toFixed(2)}</td></tr>
        <tr><td style="color:#666;">Balance due at pick-up</td><td align="right" style="color:#666;">€${Number(balanceDue).toFixed(2)}</td></tr>
      </table>
      <p style="color:#888;font-size:12px;">This is an estimate only. Final price confirmed upon booking.</p>
      ` : ""}

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
    from: "Anadyon Rentals <customerservice@anadyon.gr>",
    to: email,
    subject: `Quote Request — ${lastName}, ${ref}`,
    html: `
      <p>Dear ${title} ${firstName} ${lastName},</p>
      <p>Thank you for your quote request. Please note that <strong>this is not a confirmed reservation</strong>. We will contact you as soon as possible with availability and pricing.</p>
      <p>Your reference number is: <strong>${ref}</strong></p>

      <h3>Your Request Summary</h3>
      <table cellpadding="6" style="border-collapse:collapse;">
        <tr><td><strong>Reference:</strong></td><td><strong>${ref}</strong></td></tr>
        <tr><td><strong>Vehicle:</strong></td><td>${selectedModel}</td></tr>
        <tr><td><strong>Pick-up:</strong></td><td>${pickupLocation} on ${pickupDate} at ${pickupTime}</td></tr>
        <tr><td><strong>Drop-off:</strong></td><td>${dropoffLocation} on ${dropoffDate} at ${dropoffTime}</td></tr>
        <tr><td><strong>Rental Days:</strong></td><td>${rentalDays}</td></tr>
      </table>

      ${showPrice ? `
      <h3>Price Estimate</h3>
      <table cellpadding="6" style="border-collapse:collapse; width:100%; max-width:420px;">
        <tr><td><strong>${selectedModel}</strong> — ${rentalDays} day${rentalDays > 1 ? "s" : ""} × €${Number(dailyRate).toFixed(2)}</td><td align="right">€${Number(vehicleSubtotal).toFixed(2)}</td></tr>
        ${Number(extrasSubtotal) > 0 ? `<tr><td>Extras</td><td align="right">€${Number(extrasSubtotal).toFixed(2)}</td></tr>` : ""}
        <tr style="border-top:2px solid #ccc;"><td><strong>Total (incl. VAT)</strong></td><td align="right"><strong>€${Number(total).toFixed(2)}</strong></td></tr>
        <tr><td style="color:#666;">Deposit (30%) due on confirmation</td><td align="right" style="color:#666;">€${Number(deposit).toFixed(2)}</td></tr>
        <tr><td style="color:#666;">Balance due at pick-up</td><td align="right" style="color:#666;">€${Number(balanceDue).toFixed(2)}</td></tr>
      </table>
      <p style="color:#888;font-size:12px;">This is an estimate only. Final price confirmed upon booking.</p>
      ` : ""}

      <p>You can view your quote online at any time within one year using your reference number and surname:<br/>
      <a href="https://anadyon.gr/quote/${ref}">https://anadyon.gr/quote/${ref}</a></p>

      <p>Please add <strong>customerservice@anadyon.gr</strong> to your safe senders list to avoid our reply going to spam.</p>
      <p>Thank you,<br/>Anadyon Rentals<br/>Tel: +30 6988 010188</p>
    `,
  });

  return NextResponse.json({ success: true, ref });
}
