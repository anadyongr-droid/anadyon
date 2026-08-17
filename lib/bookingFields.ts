/**
 * Field definitions shared by the customer booking form and the admin
 * reservation form.
 *
 * The two forms had drifted: customers picked from half-hour options while
 * staff could type any minute, and the customer form demanded a date of birth
 * that the reservation had nowhere to put. A quote that collects a field the
 * reservation cannot accept is a dead end, so anything both sides need lives
 * here rather than being declared twice.
 *
 * Parity is about *what is collected*, not about how strictly. The public form
 * is a gate — it refuses an incomplete booking because there is no one to
 * chase the detail later. The admin form is a workbench: staff take bookings
 * over the phone with a customer reading out a passport number, so it holds the
 * same fields but lets the non-essential ones be filled in afterwards.
 */

/** Pick-up and drop-off times, in half-hour steps across the full day. */
export const TIME_OPTIONS: string[] = Array.from({ length: 48 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, "0");
  const m = i % 2 === 0 ? "00" : "30";
  return `${h}:${m}`;
});

/**
 * Fields the admin form refuses to save without.
 *
 * Chosen so a reservation is always actionable: staff can find the vehicle,
 * know when it leaves and returns, reach the customer on either channel, and
 * charge the right amount. Everything else can follow.
 */
export const RESERVATION_REQUIRED = [
  "vehicle_id",
  "pickup_date",
  "pickup_time",
  "return_date",
  "return_time",
  "customer_first_name",
  "customer_last_name",
  "customer_email",
  "customer_phone",
] as const;

/**
 * Collected but not enforced, so a rushed phone booking can still be saved.
 * Surfaced as an "incomplete" marker rather than silently forgotten — date of
 * birth in particular is needed before the rental agreement can be produced.
 */
export const RESERVATION_DEFERRABLE = [
  "customer_dob",
  "customer_nationality",
  "flight_number",
] as const;

export const DEFERRABLE_LABELS: Record<string, string> = {
  customer_dob: "date of birth",
  customer_nationality: "nationality",
  flight_number: "flight number",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export interface ReservationLike {
  vehicle_id?: string;
  pickup_date?: string;
  pickup_time?: string;
  return_date?: string;
  return_time?: string;
  customer_first_name?: string;
  customer_last_name?: string;
  customer_email?: string;
  customer_phone?: string;
  customer_dob?: string;
  customer_nationality?: string;
  flight_number?: string;
  discount_reason?: string;
}

/**
 * Returns the reason a reservation cannot be saved, or null when it can.
 *
 * `total` is checked because a vehicle whose pricing group has no rate for the
 * season silently prices at zero, and a €0 reservation looks deliberate once it
 * is in the calendar. A zero total is allowed only when a discount reason has
 * been written down, which is what a genuine comped rental looks like.
 */
export function validateReservation(
  form: ReservationLike,
  total: number
): string | null {
  const labels: Record<string, string> = {
    vehicle_id: "Vehicle",
    pickup_date: "Pick-up date",
    pickup_time: "Pick-up time",
    return_date: "Return date",
    return_time: "Return time",
    customer_first_name: "First name",
    customer_last_name: "Surname",
    customer_email: "Email",
    customer_phone: "Phone",
  };

  for (const field of RESERVATION_REQUIRED) {
    const value = String(form[field] ?? "").trim();
    if (!value) return `${labels[field]} is required.`;
  }

  if (!EMAIL_RE.test(String(form.customer_email).trim())) {
    return "That email address does not look right.";
  }

  if (total < 0) {
    return "The discount is larger than the rental — check the amount.";
  }
  if (total === 0 && !String(form.discount_reason ?? "").trim()) {
    return "Total is €0. Add a discount reason if that is deliberate, otherwise check the vehicle has a rate for these dates.";
  }

  return null;
}

export interface CustomerLike {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
}

/**
 * The customer record answers to the same minimum as a reservation.
 *
 * It previously demanded a first name alone, so a customer could be filed with
 * no surname, no email and no phone — a record that cannot be invoiced, cannot
 * be contacted about a delayed return, and cannot be told apart from the next
 * "Maria". The reservation form asks for four fields; there is no reason the
 * customer behind it should be held to less.
 *
 * Everything beyond these — passport, licence, address, emergency contact — is
 * deliberately optional. Those are taken at the desk when documents are
 * physically presented, not while someone is on the phone.
 */
export function validateCustomer(form: CustomerLike): string | null {
  const labels: [keyof CustomerLike, string][] = [
    ["first_name", "First name"],
    ["last_name", "Surname"],
    ["email", "Email"],
    ["phone", "Mobile phone"],
  ];
  for (const [field, label] of labels) {
    if (!String(form[field] ?? "").trim()) return `${label} is required.`;
  }
  if (!EMAIL_RE.test(String(form.email).trim())) {
    return "That email address does not look right.";
  }
  return null;
}

/**
 * What a customer record still needs before a rental agreement can be produced.
 *
 * Not required to save, for the same reason date of birth is not required on a
 * reservation: a record is often created from an email enquiry, before anyone
 * has seen a passport or a licence. But it must not go unnoticed either — the
 * agreement cannot be issued without a birth date, and the licence expiry is
 * what the insurance rests on.
 */
export function customerStillNeeds(form: {
  dob?: string; driving_licence_number?: string; driving_licence_expiry?: string; nationality?: string;
}): string[] {
  const missing: string[] = [];
  if (!String(form.dob ?? "").trim()) missing.push("date of birth");
  if (!String(form.driving_licence_number ?? "").trim()) missing.push("driving licence number");
  else if (!String(form.driving_licence_expiry ?? "").trim()) missing.push("licence expiry date");
  if (!String(form.nationality ?? "").trim()) missing.push("nationality");
  return missing;
}

/** Which deferrable fields are still blank, for the "incomplete" marker. */
export function missingDeferrable(form: ReservationLike): string[] {
  return RESERVATION_DEFERRABLE
    .filter(f => !String(form[f] ?? "").trim())
    .map(f => DEFERRABLE_LABELS[f] ?? f);
}

/**
 * Columns typed `date` or `numeric` in Postgres. An untouched HTML input yields
 * an empty string, and the form object is posted wholesale, so `""` arrives
 * where a date or a number is expected and the insert fails with
 * `invalid input syntax for type date: ""`.
 *
 * Listing them is deliberate. Blanking every empty string in the payload would
 * also turn a cleared text field into NULL, which is a different thing from an
 * empty note and would quietly discard an edit that meant to erase one.
 */
const NULLABLE_NON_TEXT = [
  "customer_dob",
  // Customer record: three more date inputs that are blank far more often than
  // they are filled, since a passport is only recorded when one is presented.
  "dob",
  "passport_expiry",
  "driving_licence_expiry",
  "discount_amount",
  "purchase_price",
  "odometer_km",
  "service_interval_km",
  "registration_date",
  "road_tax_paid_until",
  "kteo_expiry",
  "insurance_expiry",
  "last_service_date",
  "next_service_due",
  "purchase_date",
  "repair_cost",
  "repaired_on",
  "period_start",
  "period_end",
] as const;

/**
 * Prepares a form object for storage: empty date and numeric fields become
 * NULL, everything else is passed through untouched.
 */
export function normaliseForStorage<T extends Record<string, unknown>>(form: T): T {
  const out: Record<string, unknown> = { ...form };
  for (const field of NULLABLE_NON_TEXT) {
    if (field in out && typeof out[field] === "string" && out[field] === "") {
      out[field] = null;
    }
  }
  return out as T;
}
