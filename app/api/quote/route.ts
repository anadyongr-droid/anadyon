import { sendMail } from "@/lib/mailer";
import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { verifyRecaptcha } from "@/lib/recaptcha";
import { supabaseAdmin } from "@/lib/supabase";
import { checkRateLimit } from "@/lib/rateLimit";
import { calcVehicleSubtotal, calcRentalDays, DEPOSIT_RATE, type Rate, type ExtrasConfig } from "@/lib/pricing";
import { z } from "zod";
import { DRIVER_AGE_BANDS } from "@/lib/rentalPolicy";

const TOLERANCE = 0.02; // allow up to €0.02 rounding difference before flagging

const REF_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 chars — no I/O/0/1 to avoid confusion

function generateRef(): string {
  return Array.from({ length: 6 }, () => REF_CHARS[Math.floor(Math.random() * REF_CHARS.length)]).join("");
}

function esc(val: unknown): string {
  return String(val ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function bookingIdempotencyKey(payload: Record<string, unknown>): string {
  return `web-v1:${createHash("sha256").update(JSON.stringify(payload)).digest("hex")}`;
}


/**
 * Shape validation for the public booking endpoint.
 *
 * Deliberately validates types and formats only — it never recomputes a price.
 * All pricing is calculated in BookingForm.tsx and this route formats and
 * stores what it is given; recalculating here would create a second pricing
 * implementation that silently drifts from the first.
 *
 * Optional fields stay permissive so a valid booking is never rejected over a
 * field the form may legitimately omit.
 */
const money = z.coerce.number().nonnegative().finite();
const QuoteSchema = z.object({
  // Required to identify the booking
  vehicleType: z.string().min(1),
  pickupDate: z.string().min(1),
  dropoffDate: z.string().min(1),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().max(200),

  // Required numerically — these are stored and emailed as the price
  rentalDays: z.coerce.number().int().positive(),
  total: money,
  deposit: money,
  balanceDue: money,

  // Present but not critical to reject on
  selectedModel: z.string().max(120).optional(),
  pricingGroup: z.string().max(40).optional(),
  pickupLocation: z.string().max(120).optional(),
  dropoffLocation: z.string().max(120).optional(),
  pickupTime: z.string().max(20).optional(),
  dropoffTime: z.string().max(20).optional(),
  transmission: z.string().max(40).optional(),
  // A band from DRIVER_AGE_BANDS, not a number — see lib/rentalPolicy.ts.
  // This was z.coerce.number(), which turned "26–65" into NaN and rejected
  // every genuine submission the form made.
  driverAge: z.enum(DRIVER_AGE_BANDS).optional(),
  // Defaulted rather than merely optional. These feed the server-side price
  // calculation directly, and an omitted field arrived there as Number(undefined)
  // — NaN — which propagated through the total and was serialised to the database
  // as null. The quote then stored no price at all while still looking accepted.
  babySeat: z.coerce.number().int().min(0).max(10).default(0),
  childSeat: z.coerce.number().int().min(0).max(10).default(0),
  fdw: z.boolean().default(false),
  additionalDrivers: z.coerce.number().int().min(0).max(10).default(0),
  dailyRate: money.optional(),
  vehicleSubtotal: money.optional(),
  extrasSubtotal: money.optional(),
  discountAmount: money.optional(),
  promoCode: z.string().max(40).optional().nullable(),
  promoCodeId: z.string().max(60).optional().nullable(),
  extrasLines: z.array(z.unknown()).optional(),
  title: z.string().max(20).optional(),
  dob: z.string().max(40).optional(),
  address: z.string().max(300).optional(),
  postalCode: z.string().max(30).optional(),
  city: z.string().max(120).optional(),
  country: z.string().max(120).optional(),
  mobileTel: z.string().max(40).optional(),
  landlineTel: z.string().max(40).optional(),
  comments: z.string().max(2000).optional(),
  captchaToken: z.string().optional(),
  // Which language the booking was made in, so the link in the confirmation
  // email lands the customer back where they were rather than in English.
  locale: z.enum(["en", "el"]).optional(),
}).passthrough();

const BookingResultSchema = z.object({
  ref: z.string().min(1),
  discount: money,
  total: money,
  deposit: money,
  balance_due: money,
  idempotent_replay: z.boolean(),
}).passthrough();

export async function POST(req: NextRequest) {
  const rl = await checkRateLimit(req, { limit: 10, windowMs: 15 * 60 * 1000 });
  if (!rl.ok) return rl.response!;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!await verifyRecaptcha(body.captchaToken)) {
    return NextResponse.json({ error: "reCAPTCHA verification failed" }, { status: 400 });
  }

  const parsed = QuoteSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json(
      { error: `Invalid ${first?.path.join(".") || "request"}: ${first?.message ?? "check your details"}` },
      { status: 400 }
    );
  }
  body = parsed.data;

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
    pricingGroup,
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
    promoCode,
    promoCodeId: _promoCodeId,
    discountAmount: _clientDiscountAmount,
    // The client's own pricing, destructured so it is discarded rather than
    // used. Every figure is recomputed from the rate card below, and the
    // server's numbers are the ones stored and emailed.
    rentalDays: _clientRentalDays,
    dailyRate: _clientDailyRate,
    vehicleSubtotal: _clientVehicleSubtotal,
    extrasSubtotal: _clientExtrasSubtotal,
    total: clientTotal,
    deposit: _clientDeposit,
    balanceDue: _clientBalanceDue,
    extrasLines: _extrasLines,
    locale,
  } = body;

  // DNR check — block if customer's email is flagged; also touch last_interaction_at
  if (email) {
    const { data: existing } = await supabaseAdmin
      .from("customers")
      .select("id, do_not_rent, dnr_reason")
      .ilike("email", email.trim())
      .maybeSingle();
    if (existing?.do_not_rent) {
      return NextResponse.json({ error: "We are unable to process your request at this time. Please contact us directly." }, { status: 403 });
    }
    if (existing?.id) {
      await supabaseAdmin
        .from("customers")
        .update({ last_interaction_at: new Date().toISOString() })
        .eq("id", existing.id);
    }
  }

  // Server-side verification — recalculate independently from DB
  const [{ data: rates }, { data: extrasConfig }] = await Promise.all([
    supabaseAdmin.from("rates").select("*"),
    supabaseAdmin.from("extras_config").select("*"),
  ]);

  const serverRentalDays = calcRentalDays(pickupDate, dropoffDate, pickupTime, dropoffTime);

  if (!rates?.length || !extrasConfig) {
    return NextResponse.json({ error: "Unable to verify pricing. Please try again." }, { status: 503 });
  }

  const xRate = (key: string) =>
    (extrasConfig as ExtrasConfig[]).find(e => e.key === key)?.daily_rate ?? 0;

  const serverVehicleSubtotal = pricingGroup
    ? calcVehicleSubtotal(rates as Rate[], pricingGroup, pickupDate, dropoffDate, serverRentalDays)
    : 0;
  const serverDailyRate = serverVehicleSubtotal && serverRentalDays ? parseFloat((serverVehicleSubtotal / serverRentalDays).toFixed(2)) : 0;
  const serverExtrasSubtotal = parseFloat((
    (fdw ? xRate("fdw") : 0) * serverRentalDays +
    Number(babySeat) * xRate("baby_seat") * serverRentalDays +
    Number(childSeat) * xRate("child_seat") * serverRentalDays +
    Number(additionalDrivers) * xRate("additional_drivers") * serverRentalDays
  ).toFixed(2));
  const serverTotal = parseFloat((serverVehicleSubtotal + serverExtrasSubtotal).toFixed(2));
  const serverDeposit = parseFloat((serverTotal * DEPOSIT_RATE).toFixed(2));
  const serverBalanceDue = parseFloat((serverTotal - serverDeposit).toFixed(2));

  // A price that is not a finite number must never be stored. Refusing here is
  // the difference between a customer seeing an error and a customer holding a
  // confirmation for a quote with no price on it.
  if (![serverVehicleSubtotal, serverExtrasSubtotal, serverTotal].every(Number.isFinite)) {
    console.error("Quote pricing produced a non-finite value", {
      serverVehicleSubtotal, serverExtrasSubtotal, serverTotal, pricingGroup,
    });
    return NextResponse.json({ error: "Unable to verify pricing. Please try again." }, { status: 503 });
  }

  // Always use server-calculated values
  const rentalDays = serverRentalDays;
  const dailyRate = serverDailyRate;
  const vehicleSubtotal = serverVehicleSubtotal;
  const extrasSubtotal = serverExtrasSubtotal;
  const requestedRef = generateRef();
  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);

  const quotePayload = {
    ref: requestedRef,
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
    // The client already sends this and the route already validates against it;
    // it simply was never stored. Without it every quote reached the admin with
    // no category, so the reservation form could not tell an upgrade from a
    // downgrade and silently treated both as unremarkable.
    pricing_group: pricingGroup ?? null,
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
    // The function applies any promo and replaces these three figures before
    // inserting. Supplying the pre-discount values keeps Postgres authoritative.
    total: serverTotal,
    deposit: serverDeposit,
    balance_due: serverBalanceDue,
    promo_code: promoCode ?? null,
    discount_amount: 0,
    comments: comments || null,
    expires_at: expiresAt.toISOString(),
  };

  const reservationPayload = {
    vehicle_id: null,
    customer_name: `${firstName} ${lastName}`,
    customer_email: email,
    customer_phone: mobileTel,
    pickup_date: pickupDate,
    pickup_time: pickupTime ?? "09:00",
    return_date: dropoffDate,
    return_time: dropoffTime ?? "09:00",
    pickup_location: pickupLocation ?? null,
    dropoff_location: dropoffLocation ?? null,
    rental_days: rentalDays,
    daily_rate: dailyRate,
    vehicle_subtotal: vehicleSubtotal,
    extras_subtotal: extrasSubtotal,
    baby_seat: Number(babySeat) || 0,
    child_seat: Number(childSeat) || 0,
    fdw: !!fdw,
    additional_drivers: Number(additionalDrivers) || 0,
    total: serverTotal,
    deposit: serverDeposit,
    balance_due: serverBalanceDue,
    promo_code_id: null,
    discount_amount: 0,
    discount_reason: promoCode ? `Promo: ${promoCode}` : null,
    status: "pending",
    source: "website",
    notes: `Quote ref: ${requestedRef}${comments ? `. Customer notes: ${comments}` : ""}`,
  };

  // Content-derived rather than random: a retry after a timeout sends the same
  // key, while a changed booking produces a different one.
  const idempotencyKey = bookingIdempotencyKey({
    email: email.trim().toLowerCase(),
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    mobileTel: mobileTel?.trim() ?? "",
    vehicleType,
    selectedModel: selectedModel ?? "",
    pricingGroup: pricingGroup ?? "",
    pickupLocation: pickupLocation ?? "",
    dropoffLocation: dropoffLocation ?? "",
    pickupDate,
    pickupTime: pickupTime ?? "09:00",
    dropoffDate,
    dropoffTime: dropoffTime ?? "09:00",
    transmission: transmission ?? "",
    babySeat,
    childSeat,
    fdw,
    additionalDrivers,
    promoCode: promoCode?.trim().toLowerCase() ?? "",
    clientTotal: Number(clientTotal),
    comments: comments?.trim() ?? "",
  });

  const { data: bookingData, error: bookingError } = await supabaseAdmin.rpc(
    "create_web_booking",
    {
      p_quote: quotePayload,
      p_reservation: reservationPayload,
      p_promo_code: promoCode?.trim() || null,
      p_idempotency_key: idempotencyKey,
      p_deposit_rate: DEPOSIT_RATE,
    }
  );

  const booking = BookingResultSchema.safeParse(bookingData);
  if (bookingError) {
    console.error(`[quote] atomic booking failed for ${requestedRef}:`, bookingError.message);
    return NextResponse.json(
      { error: "We could not save your request. Please try again, or call us on +30 26950 41878." },
      { status: 500 }
    );
  }
  if (!booking.success) {
    console.error(`[quote] atomic booking returned invalid data for ${requestedRef}:`,
      booking.error.issues[0]?.message ?? "invalid function response");
    return NextResponse.json(
      { error: "We could not save your request. Please try again, or call us on +30 26950 41878." },
      { status: 500 }
    );
  }

  const ref = booking.data.ref;
  if (booking.data.idempotent_replay) {
    return NextResponse.json({ success: true, ref });
  }

  const promoDiscount = Number(booking.data.discount);
  const total = Number(booking.data.total);
  const deposit = Number(booking.data.deposit);
  const balanceDue = Number(booking.data.balance_due);
  const manipulated = total > 0 && Math.abs(Number(clientTotal) - total) > TOLERANCE;
  const showPrice = total > 0;

  // Rebuild extras rows using server rates (ignoring client extrasLines amounts)
  const serverExtrasRows = [
    fdw ? `<tr><td>Full Damage Waiver (FDW) — ${rentalDays} day${rentalDays > 1 ? "s" : ""} × €${xRate("fdw").toFixed(2)}</td><td align="right">€${(xRate("fdw") * rentalDays).toFixed(2)}</td></tr>` : "",
    Number(babySeat) > 0 ? `<tr><td>Baby Seat ×${babySeat} — ${rentalDays} day${rentalDays > 1 ? "s" : ""} × €${xRate("baby_seat").toFixed(2)}</td><td align="right">€${(xRate("baby_seat") * Number(babySeat) * rentalDays).toFixed(2)}</td></tr>` : "",
    Number(childSeat) > 0 ? `<tr><td>Child Seat ×${childSeat} — ${rentalDays} day${rentalDays > 1 ? "s" : ""} × €${xRate("child_seat").toFixed(2)}</td><td align="right">€${(xRate("child_seat") * Number(childSeat) * rentalDays).toFixed(2)}</td></tr>` : "",
    Number(additionalDrivers) > 0 ? `<tr><td>Additional Driver ×${additionalDrivers} — ${rentalDays} day${rentalDays > 1 ? "s" : ""} × €${xRate("additional_drivers").toFixed(2)}</td><td align="right">€${(xRate("additional_drivers") * Number(additionalDrivers) * rentalDays).toFixed(2)}</td></tr>` : "",
  ].filter(Boolean).join("\n        ");

  // A Greek customer gets the Greek page; anyone else the English one.
  const quoteUrl = `https://anadyon.gr${locale === "el" ? "/el" : ""}/quote/${ref}`;


  const manipulationWarning = manipulated ? `
    <div style="background:#fff3cd;border:2px solid #ff9800;border-radius:8px;padding:16px;margin-bottom:20px;">
      <p style="margin:0 0 8px;font-weight:bold;color:#b45309;">⚠️ POSSIBLE PRICE MANIPULATION DETECTED</p>
      <p style="margin:0 0 4px;color:#92400e;">Client submitted total: <strong>€${Number(clientTotal).toFixed(2)}</strong></p>
      <p style="margin:0 0 4px;color:#92400e;">Server-calculated total: <strong>€${total.toFixed(2)}</strong></p>
      <p style="margin:0;color:#92400e;font-size:13px;">The correct figures have been used in this email and saved to the database. Please verify with the customer.</p>
    </div>
  ` : "";

  // Internal notification to Anadyon
  // Both messages start together and are awaited once, below. They are
  // independent — the office copy and the customer copy — and sending them one
  // after the other made the customer wait for both round trips before their
  // booking reference appeared.
  const officeMail = sendMail({
    from: "Anadyon Website <customerservice@anadyon.gr>",
    to: ["customerservice@anadyon.gr"],
    replyTo: email,
    subject: `${manipulated ? "⚠️ [ALERT] " : ""}Quote Request — ${lastName}, ${ref}`,
    html: `
      ${manipulationWarning}
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
        <tr><td><strong>${selectedModel}</strong> — ${rentalDays} day${rentalDays > 1 ? "s" : ""} × €${dailyRate.toFixed(2)}</td><td align="right">€${vehicleSubtotal.toFixed(2)}</td></tr>
        ${serverExtrasRows}
        ${promoDiscount > 0 ? `<tr><td>Promo code (${esc(promoCode)})</td><td align="right">−€${promoDiscount.toFixed(2)}</td></tr>` : ""}
        <tr style="border-top:2px solid #ccc;"><td><strong>Total (incl. VAT)</strong></td><td align="right"><strong>€${total.toFixed(2)}</strong></td></tr>
        <tr><td style="color:#666;">Deposit (30%) due on confirmation</td><td align="right" style="color:#666;">€${deposit.toFixed(2)}</td></tr>
        <tr><td style="color:#666;">Balance due at pick-up</td><td align="right" style="color:#666;">€${balanceDue.toFixed(2)}</td></tr>
      </table>
      <p style="color:#888;font-size:12px;">This is an estimate only. Final price confirmed upon booking.</p>
      ` : ""}

      <h3>Customer Details</h3>
      <table cellpadding="6" style="border-collapse:collapse;">
        <tr><td><strong>Name:</strong></td><td>${esc(title)} ${esc(firstName)} ${esc(lastName)}</td></tr>
        <tr><td><strong>Email:</strong></td><td>${esc(email)}</td></tr>
        <tr><td><strong>Date of Birth:</strong></td><td>${esc(dob)}</td></tr>
        <tr><td><strong>Address:</strong></td><td>${esc(address)}, ${esc(postalCode)}, ${esc(city)}, ${esc(country)}</td></tr>
        <tr><td><strong>Mobile:</strong></td><td>${esc(mobileTel)}</td></tr>
        ${landlineTel ? `<tr><td><strong>Landline:</strong></td><td>${esc(landlineTel)}</td></tr>` : ""}
        ${comments ? `<tr><td><strong>Comments:</strong></td><td>${esc(comments)}</td></tr>` : ""}
      </table>

      <hr/>
      <p style="color:#888;font-size:12px;">This is not a confirmed reservation. Anadyon Rentals will contact you shortly to confirm availability.</p>
    `,
  });

  // Auto-confirmation to customer — always uses correct server figures
  const customerMail = sendMail({
    from: "Anadyon Rentals <customerservice@anadyon.gr>",
    to: email,
    subject: `Quote Request — ${lastName}, ${ref}`,
    html: `
      <p>Dear ${esc(title)} ${esc(firstName)} ${esc(lastName)},</p>
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
        <tr><td><strong>${selectedModel}</strong> — ${rentalDays} day${rentalDays > 1 ? "s" : ""} × €${dailyRate.toFixed(2)}</td><td align="right">€${vehicleSubtotal.toFixed(2)}</td></tr>
        ${serverExtrasRows}
        ${promoDiscount > 0 ? `<tr><td>Promo code (${esc(promoCode)})</td><td align="right">−€${promoDiscount.toFixed(2)}</td></tr>` : ""}
        <tr style="border-top:2px solid #ccc;"><td><strong>Total (incl. VAT)</strong></td><td align="right"><strong>€${total.toFixed(2)}</strong></td></tr>
        <tr><td style="color:#666;">Deposit (30%) due on confirmation</td><td align="right" style="color:#666;">€${deposit.toFixed(2)}</td></tr>
        <tr><td style="color:#666;">Balance due at pick-up</td><td align="right" style="color:#666;">€${balanceDue.toFixed(2)}</td></tr>
      </table>
      <p style="color:#888;font-size:12px;">This is an estimate only. Final price confirmed upon booking.</p>
      ` : ""}

      <p>You can view your quote online at any time within one year using your reference number and surname:<br/>
      <a href="${quoteUrl}">${quoteUrl}</a></p>

      <p>Please add <strong>customerservice@anadyon.gr</strong> to your safe senders list to avoid our reply going to spam.</p>
      <p>Thank you,<br/>Anadyon Rentals<br/>Tel: +30 6988 010188</p>
    `,
  });

  // sendMail never throws: it delivers, or stores the message and alerts the
  // office. So this waits for both without needing to guard either, and the
  // booking — already stored above — is never undone by a mail problem.
  await Promise.all([officeMail, customerMail]);

  return NextResponse.json({ success: true, ref });
}
