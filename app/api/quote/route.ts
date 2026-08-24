import { sendMail, type Mail } from "@/lib/mailer";
import { sendAuditedWorkflowMail } from "@/lib/auditedMail";
import { createHash } from "node:crypto";
import { after, NextRequest, NextResponse } from "next/server";
import { verifyRecaptcha } from "@/lib/recaptcha";
import { supabaseAdmin } from "@/lib/supabase";
import { checkRateLimit } from "@/lib/rateLimit";
import { calcVehicleSubtotal, calcRentalDays, DEPOSIT_RATE, type Rate, type ExtrasConfig } from "@/lib/pricing";
import { z } from "zod";
import {
  DRIVER_AGE_BANDS,
  MAX_CHILD_SEATS_TOTAL,
  SEATS_LIMIT_MESSAGE,
  ageOnDate,
  driverAgeBandForDob,
  seatsWithinLimit,
} from "@/lib/rentalPolicy";
import { resolveModel } from "@/lib/vehicleCatalogue";

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
 * Validates types and formats only. Every monetary field below is accepted so
 * an older cached form is not rejected, and then discarded — the price is
 * recalculated here from the rate card, and the pricing group is derived from
 * the selected model rather than taken from the request. See the destructure
 * below for what is deliberately thrown away.
 *
 * Optional fields stay permissive so a valid booking is never rejected over a
 * field the form may legitimately omit.
 */
const money = z.coerce.number().nonnegative().finite();
const seatCount = z.coerce.number().int().min(0).max(MAX_CHILD_SEATS_TOTAL);
const QuoteSchema = z.object({
  // Required to identify the booking
  vehicleType: z.string().min(1),
  pickupDate: z.string().min(1),
  dropoffDate: z.string().min(1),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().max(200),

  // Accepted for backwards compatibility and then discarded. They were once
  // required, because they were what got stored; the price is now recalculated
  // here, so a caller that omits them is not missing anything the server needs.
  // `total` survives only to compare against the server's figure and raise the
  // price-manipulation alert.
  rentalDays: z.coerce.number().int().positive().optional(),
  total: money.optional(),
  deposit: money.optional(),
  balanceDue: money.optional(),

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
  babySeat: seatCount.default(0),
  childSeat: seatCount.default(0),
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
  flightNumber: z.string().max(40).optional(),
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
}).passthrough().superRefine((value, ctx) => {
  // Each seat field is already capped individually; this is the combined limit,
  // which is the one that reflects how many seats fit in the car.
  if (!seatsWithinLimit(value.babySeat, value.childSeat)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["childSeat"],
      message: SEATS_LIMIT_MESSAGE,
    });
  }
});

const BookingResultSchema = z.object({
  ref: z.string().min(1),
  // Nullable rather than required: an older deployment of create_web_booking
  // does not return it, and a missing id must degrade to an unaudited send
  // rather than failing a booking that is already committed.
  reservation_id: z.string().uuid().nullable().optional(),
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
    // A custom rule (the combined seat limit) already reads as a sentence a
    // customer can act on. Prefixing it with the field name would not.
    const message = first?.code === z.ZodIssueCode.custom
      ? first.message
      : `Invalid ${first?.path.join(".") || "request"}: ${first?.message ?? "check your details"}`;
    return NextResponse.json({ error: message }, { status: 400 });
  }
  body = parsed.data;

  const {
    vehicleType: _clientVehicleType,
    selectedModel,
    pickupLocation,
    dropoffLocation,
    pickupDate,
    pickupTime,
    dropoffDate,
    dropoffTime,
    transmission: _clientTransmission,
    driverAge,
    babySeat,
    childSeat,
    fdw,
    additionalDrivers,
    // Submitted but never used for pricing. The catalogue decides all three;
    // see `catalogueModel` below.
    pricingGroup: _clientPricingGroup,
    title,
    firstName,
    lastName,
    email,
    dob,
    flightNumber,
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

  // The model is the only vehicle field the customer actually chooses; type,
  // pricing group and transmission all follow from it. Deriving them here is
  // what stops a crafted request naming an expensive model alongside a cheaper
  // group — previously the submitted group was priced as-is, so a Peugeot 107
  // could be bought at a bicycle's rate.
  const catalogueModel = resolveModel(selectedModel);
  if (!catalogueModel) {
    // Refused rather than priced at zero. An unknown model used to fall through
    // to a €0 vehicle subtotal and still produce an accepted-looking quote.
    return NextResponse.json(
      { error: "Please choose one of our available vehicles." },
      { status: 400 },
    );
  }
  const vehicleType = catalogueModel.vehicleType;
  const pricingGroup = catalogueModel.pricingGroup;
  const transmission = catalogueModel.transmission;

  // DOB is the authoritative age answer. Recompute on the actual pick-up date
  // so a stale or manually altered dropdown cannot store a contradictory band.
  const ageAtPickup = dob ? ageOnDate(dob, pickupDate) : null;
  if (ageAtPickup !== null && ageAtPickup < 21) {
    return NextResponse.json(
      { error: "Driver must be at least 21 on the pick-up date." },
      { status: 400 }
    );
  }
  const effectiveDriverAge = dob
    ? (driverAgeBandForDob(dob, pickupDate) ?? driverAge)
    : driverAge;

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

  const serverVehicleSubtotal = calcVehicleSubtotal(
    rates as Rate[], pricingGroup, pickupDate, dropoffDate, serverRentalDays,
  );
  // A known model with no rate row for its group is a rate-card problem, not a
  // free rental. Refuse instead of storing a zero-priced quote.
  if (serverVehicleSubtotal <= 0) {
    console.error("[quote] no rate found", { model: catalogueModel.name, pricingGroup });
    return NextResponse.json({ error: "Unable to verify pricing. Please try again." }, { status: 503 });
  }
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
    flight_number: flightNumber?.trim().toUpperCase() || null,
    address,
    postal_code: postalCode,
    city,
    country,
    mobile_tel: mobileTel,
    landline_tel: landlineTel,
    vehicle_type: vehicleType,
    // The catalogue's spelling, not the submitted one, so a near-miss match
    // cannot write a variant model name into the database.
    selected_model: catalogueModel.name,
    // Derived from the model above. Without it every quote reached the admin
    // with no category, so the reservation form could not tell an upgrade from
    // a downgrade and silently treated both as unremarkable.
    pricing_group: pricingGroup,
    pickup_location: pickupLocation,
    dropoff_location: dropoffLocation,
    pickup_date: pickupDate,
    pickup_time: pickupTime,
    dropoff_date: dropoffDate,
    dropoff_time: dropoffTime,
    driver_age: effectiveDriverAge,
    transmission,
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
    // The operational reservation has separate identity fields. Supplying
    // these as well as the legacy display name keeps the admin edit screen,
    // calendar and rental agreement on the same customer identity.
    customer_first_name: firstName,
    customer_last_name: lastName,
    customer_email: email,
    customer_phone: mobileTel,
    // Today’s operational check reads the reservation record. Keeping the
    // date of birth only on its source quote made a customer who had supplied
    // it look incomplete at collection time.
    customer_dob: dob || null,
    flight_number: flightNumber?.trim().toUpperCase() || null,
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
  // key, while a genuinely changed booking produces a different one.
  //
  // Every field here describes what the customer asked for. No monetary value
  // appears — `clientTotal` used to, which meant altering the submitted total
  // produced a different key for an otherwise identical request, defeating the
  // replay protection it was supposed to provide. The vehicle fields are the
  // catalogue's, not the caller's, for the same reason.
  const idempotencyKey = bookingIdempotencyKey({
    email: email.trim().toLowerCase(),
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    mobileTel: mobileTel?.trim() ?? "",
    vehicleType,
    selectedModel: catalogueModel.name,
    pricingGroup,
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
    comments: comments?.trim() ?? "",
    flightNumber: flightNumber?.trim().toUpperCase() ?? "",
    dob: dob ?? "",
    driverAge: effectiveDriverAge ?? "",
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
  // Only a total that was actually submitted can disagree with the server's.
  // A caller that sends none is not suspicious — it is simply not asserting a
  // price, which is the direction this route is moving in anyway.
  const manipulated = total > 0 && clientTotal !== undefined
    && Math.abs(Number(clientTotal) - total) > TOLERANCE;
  const showPrice = total > 0;

  // Rebuild extras rows using server rates (ignoring client extrasLines amounts)
  const serverExtrasRows = [
    fdw ? `<tr><td>Full Damage Waiver (FDW) — ${rentalDays} day${rentalDays > 1 ? "s" : ""} × €${xRate("fdw").toFixed(2)}</td><td align="right">€${(xRate("fdw") * rentalDays).toFixed(2)}</td></tr>` : "",
    Number(babySeat) > 0 ? `<tr><td>Baby Seat ×${babySeat} — ${rentalDays} day${rentalDays > 1 ? "s" : ""} × €${xRate("baby_seat").toFixed(2)}</td><td align="right">€${(xRate("baby_seat") * Number(babySeat) * rentalDays).toFixed(2)}</td></tr>` : "",
    Number(childSeat) > 0 ? `<tr><td>Child Seat ×${childSeat} — ${rentalDays} day${rentalDays > 1 ? "s" : ""} × €${xRate("child_seat").toFixed(2)}</td><td align="right">€${(xRate("child_seat") * Number(childSeat) * rentalDays).toFixed(2)}</td></tr>` : "",
    Number(additionalDrivers) > 0 ? `<tr><td>Additional Driver ×${additionalDrivers} — ${rentalDays} day${rentalDays > 1 ? "s" : ""} × €${xRate("additional_drivers").toFixed(2)}</td><td align="right">€${(xRate("additional_drivers") * Number(additionalDrivers) * rentalDays).toFixed(2)}</td></tr>` : "",
  ].filter(Boolean).join("\n        ");

  const customerExtrasRows = locale === "el" ? [
    fdw ? `<tr><td>Πλήρης Κάλυψη Ζημιών (FDW) — ${rentalDays} ${rentalDays === 1 ? "ημέρα" : "ημέρες"} × €${xRate("fdw").toFixed(2)}</td><td align="right">€${(xRate("fdw") * rentalDays).toFixed(2)}</td></tr>` : "",
    Number(babySeat) > 0 ? `<tr><td>Παιδικό Κάθισμα (0–9 μηνών) ×${babySeat} — ${rentalDays} ${rentalDays === 1 ? "ημέρα" : "ημέρες"} × €${xRate("baby_seat").toFixed(2)}</td><td align="right">€${(xRate("baby_seat") * Number(babySeat) * rentalDays).toFixed(2)}</td></tr>` : "",
    Number(childSeat) > 0 ? `<tr><td>Παιδικό Κάθισμα (9+ μηνών) ×${childSeat} — ${rentalDays} ${rentalDays === 1 ? "ημέρα" : "ημέρες"} × €${xRate("child_seat").toFixed(2)}</td><td align="right">€${(xRate("child_seat") * Number(childSeat) * rentalDays).toFixed(2)}</td></tr>` : "",
    Number(additionalDrivers) > 0 ? `<tr><td>Πρόσθετοι Οδηγοί ×${additionalDrivers} — ${rentalDays} ${rentalDays === 1 ? "ημέρα" : "ημέρες"} × €${xRate("additional_drivers").toFixed(2)}</td><td align="right">€${(xRate("additional_drivers") * Number(additionalDrivers) * rentalDays).toFixed(2)}</td></tr>` : "",
  ].filter(Boolean).join("\n        ") : serverExtrasRows;

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
  // No replyTo. This is an internal notification, and setting the customer as
  // the reply address meant a member of staff hitting Reply — to ask a
  // colleague about availability, say — wrote to the customer instead. Replies
  // now stay inside the office.
  //
  // The customer's address is printed in the details below as plain text, so
  // the office can still reach them from this email alone when the admin area
  // is unavailable. Plain text, not a link or a button: the alert carries the
  // information and nothing that acts on it.
  const officeMail = (noVehicle: boolean) => sendMail({
    from: "Anadyon Website <customerservice@anadyon.gr>",
    to: ["customerservice@anadyon.gr"],
    subject: `${manipulated ? "⚠️ [ALERT] " : ""}${noVehicle ? "🚗 [NO VEHICLE] " : ""}Quote Request — ${lastName}, ${ref}`,
    html: `
      ${manipulationWarning}
      ${noVehicle ? `
      <div style="background:#fee2e2;border:2px solid #dc2626;border-radius:8px;padding:16px;margin-bottom:20px;">
        <p style="margin:0 0 8px;font-weight:bold;color:#991b1b;">🚗 NO VEHICLE COULD BE ASSIGNED</p>
        <p style="margin:0 0 4px;color:#7f1d1d;">Nothing was available in the requested category (or a valid upgrade) with the right transmission for these dates, so the reservation was left unallocated rather than given an unsuitable vehicle.</p>
        <p style="margin:0;color:#7f1d1d;font-size:13px;">This booking needs a manual assignment, or a conversation with the customer about alternatives. It is highlighted in red on the Reservations screen.</p>
      </div>
      ` : ""}
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
        <tr><td><strong>Driver Age:</strong></td><td>${effectiveDriverAge}</td></tr>
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
        <tr><td style="color:#666;">Deposit (30%) required to confirm booking</td><td align="right" style="color:#666;">€${deposit.toFixed(2)}</td></tr>
        <tr><td style="color:#666;">Balance due at pick-up</td><td align="right" style="color:#666;">€${balanceDue.toFixed(2)}</td></tr>
      </table>
      <p style="color:#888;font-size:12px;">This is an estimate only. Final price and vehicle-category availability will be confirmed in our quote confirmation email.</p>
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
      <p style="color:#888;font-size:12px;">This is not a confirmed reservation. Anadyon Rentals will contact you shortly with availability and the final price.</p>
    `,
  });

  // Receipt acknowledgment to the customer — deliberately distinct from the
  // later quote confirmation and post-payment booking confirmation emails.
  // It always uses the correct server figures and follows the language used on
  // the public booking form.
  //
  // Routed through the delivery audit when the reservation id is known, so this
  // stage shows on the reservation screen with its real delivery condition and
  // cannot be sent twice for the same request.
  const acknowledgmentMail: Mail = {
    from: "Anadyon Rentals <customerservice@anadyon.gr>",
    to: email,
    // Stated rather than left to the From address, so the reply path is the
    // same on every customer email regardless of who each one is sent from.
    replyTo: "customerservice@anadyon.gr",
    subject: locale === "el"
      ? `Επιβεβαίωση παραλαβής αιτήματος κράτησης — ${ref}`
      : `Reservation request acknowledgment — ${ref}`,
    html: locale === "el" ? `
      <p>Αγαπητέ/ή ${esc(firstName)},</p>
      <p>Σας ευχαριστούμε για το αίτημα κράτησης — το λάβαμε και ελέγχουμε τη διαθεσιμότητα. <strong>Δεν πρόκειται ακόμη για επιβεβαιωμένη κράτηση.</strong> Θα επικοινωνήσουμε μαζί σας σύντομα με τη διαθεσιμότητα και την τελική τιμή.</p>
      <p>Ο αριθμός αναφοράς σας είναι: <strong>${ref}</strong></p>

      <h3>Σύνοψη Αιτήματος</h3>
      <table cellpadding="6" style="border-collapse:collapse;">
        <tr><td><strong>Αριθμός αναφοράς:</strong></td><td><strong>${ref}</strong></td></tr>
        <tr><td><strong>Όχημα:</strong></td><td>${selectedModel}</td></tr>
        <tr><td><strong>Παραλαβή:</strong></td><td>${pickupLocation}, ${pickupDate} στις ${pickupTime}</td></tr>
        <tr><td><strong>Επιστροφή:</strong></td><td>${dropoffLocation}, ${dropoffDate} στις ${dropoffTime}</td></tr>
        <tr><td><strong>Ημέρες ενοικίασης:</strong></td><td>${rentalDays}</td></tr>
      </table>

      ${showPrice ? `
      <h3>Εκτίμηση Κόστους</h3>
      <table cellpadding="6" style="border-collapse:collapse; width:100%; max-width:420px;">
        <tr><td><strong>${selectedModel}</strong> — ${rentalDays} ${rentalDays === 1 ? "ημέρα" : "ημέρες"} × €${dailyRate.toFixed(2)}</td><td align="right">€${vehicleSubtotal.toFixed(2)}</td></tr>
        ${customerExtrasRows}
        ${promoDiscount > 0 ? `<tr><td>Κωδικός προσφοράς (${esc(promoCode)})</td><td align="right">−€${promoDiscount.toFixed(2)}</td></tr>` : ""}
        <tr style="border-top:2px solid #ccc;"><td><strong>Σύνολο (με ΦΠΑ)</strong></td><td align="right"><strong>€${total.toFixed(2)}</strong></td></tr>
        <tr><td style="color:#666;">Προκαταβολή (30%) απαραίτητη για την επιβεβαίωση της κράτησης</td><td align="right" style="color:#666;">€${deposit.toFixed(2)}</td></tr>
        <tr><td style="color:#666;">Υπόλοιπο κατά την παραλαβή</td><td align="right" style="color:#666;">€${balanceDue.toFixed(2)}</td></tr>
      </table>
      <p style="color:#888;font-size:12px;">Ενδεικτική τιμή. Η τελική τιμή και η διαθεσιμότητα της κατηγορίας οχήματος θα επιβεβαιωθούν στο email επιβεβαίωσης προσφοράς.</p>
      ` : ""}

      <p>Μπορείτε να δείτε την προσφορά σας online για ένα έτος, χρησιμοποιώντας τον αριθμό αναφοράς και το επώνυμό σας:<br/>
      <a href="${quoteUrl}">${quoteUrl}</a></p>

      <p>Η απάντησή μας μερικές φορές καταλήγει στα ανεπιθύμητα — αξίζει να προσθέσετε το <strong>customerservice@anadyon.gr</strong> στις επαφές σας.</p>
      <p>Ευχαριστούμε,<br/>Anadyon Customer Service<br/>Τηλ.: +30 6988 010188</p>
    ` : `
      <p>Dear ${esc(firstName)},</p>
      <p>Thank you for your reservation request — we've received it and we're checking availability now. <strong>This isn't a confirmed booking yet.</strong> We'll come back to you shortly with availability and final pricing.</p>
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
        ${customerExtrasRows}
        ${promoDiscount > 0 ? `<tr><td>Promo code (${esc(promoCode)})</td><td align="right">−€${promoDiscount.toFixed(2)}</td></tr>` : ""}
        <tr style="border-top:2px solid #ccc;"><td><strong>Total (incl. VAT)</strong></td><td align="right"><strong>€${total.toFixed(2)}</strong></td></tr>
        <tr><td style="color:#666;">Deposit (30%) required to confirm booking</td><td align="right" style="color:#666;">€${deposit.toFixed(2)}</td></tr>
        <tr><td style="color:#666;">Balance due at pick-up</td><td align="right" style="color:#666;">€${balanceDue.toFixed(2)}</td></tr>
      </table>
      <p style="color:#888;font-size:12px;">This is an estimate only. Final price and vehicle-category availability will be confirmed in our quote confirmation email.</p>
      ` : ""}

      <p>You can view your quote online at any time within one year using your reference number and surname:<br/>
      <a href="${quoteUrl}">${quoteUrl}</a></p>

      <p>Our reply sometimes lands in spam — worth adding <strong>customerservice@anadyon.gr</strong> to your contacts.</p>
      <p>Thank you,<br/>Anadyon Customer Service<br/>Tel: +30 6988 010188</p>
    `,
  };

  const reservationId = booking.data.reservation_id ?? null;
  const customerMail = () => reservationId
    ? sendAuditedWorkflowMail({
        reservationId,
        kind: "acknowledgment",
        recipientEmail: email,
        mail: acknowledgmentMail,
      })
    : sendMail(acknowledgmentMail);

  /**
   * Did the auto-assignment trigger find a vehicle?
   *
   * A website reservation goes through `assign_eligible_vehicle_to_web_booking`
   * on insert, which allocates a same-category-or-upgrade vehicle with matching
   * transmission if one is free — and leaves `vehicle_id` NULL rather than
   * assigning something unsuitable. A null here therefore means the system
   * looked and found nothing, which is a decision for a person.
   *
   * Read after the fact rather than returned by the booking function, so this
   * needs no migration. Never fatal: the booking is already committed, and
   * failing to determine this must not turn a stored booking into an error.
   */
  const noVehicleAssigned = async (): Promise<boolean> => {
    if (!reservationId) return false;
    try {
      const { data, error } = await supabaseAdmin
        .from("reservations")
        .select("vehicle_id")
        .eq("id", reservationId)
        .maybeSingle();
      if (error) return false;
      return data ? data.vehicle_id === null : false;
    } catch {
      return false;
    }
  };

  // The booking has already been committed atomically. Do not make a customer
  // wait for external email round trips before seeing their reference:
  // `after` is the supported Next.js request-lifecycle hook, so Vercel keeps
  // the work alive after the response. sendMail itself records any failure in
  // the durable retry queue and alerts the office.
  after(async () => {
    const noVehicle = await noVehicleAssigned();
    await Promise.all([officeMail(noVehicle), customerMail()]);
  });

  return NextResponse.json({ success: true, ref });
}
