import { supabaseAdmin } from "@/lib/supabase";
import { licenceStatus, instant } from "@/lib/operations";

/**
 * A driver whose licence expires before the vehicle is due back.
 *
 * `licenceStatus` has returned `blocks: true` for this case since it was
 * written, and nothing has ever acted on it. Both call sites — the Today screen
 * and the reservation modal — only *display* it, so a member of staff could
 * read "the driver would be uninsured for part of the rental" and save the
 * booking anyway, leaving no record that anyone had seen it.
 *
 * Blueprint §7 phase 1: "the counter must not be capable of releasing a blocked
 * vehicle or an invalid driver." This is the driver half.
 *
 * NOT A HARD REFUSAL, deliberately. A licence expiring next month can be
 * renewed before a pick-up in three weeks, and refusing that outright would
 * turn a real booking away at the counter. It refuses *silently proceeding*:
 * staff must attest with `_licence_verified`, and the attestation is written
 * onto the reservation, because "we checked, they are renewing it" is exactly
 * what somebody needs to produce months later.
 *
 * Measured against the RETURN, not the pick-up — the customer drives on the
 * last day too.
 */
export interface LicenceGateResult {
  /** The message to refuse with, or null to proceed. */
  problem: string | null;
  /** True when an attestation was supplied and actually permitted something. */
  overridden: boolean;
}

const OK: LicenceGateResult = { problem: null, overridden: false };

export async function licenceGate(
  customerId: unknown,
  returnDate: unknown,
  returnTime: unknown,
  attested: boolean,
): Promise<LicenceGateResult> {
  if (typeof customerId !== "string" || !customerId) return OK;
  if (typeof returnDate !== "string" || !returnDate) return OK;

  let customer: { driving_licence_number: string | null; driving_licence_expiry: string | null } | null;
  try {
    const { data, error } = await supabaseAdmin
      .from("customers")
      .select("driving_licence_number, driving_licence_expiry")
      .eq("id", customerId)
      .maybeSingle();
    // §5.3: a read that failed must not read as "nothing found". The two differ
    // by whether an uninsured driver is handed the keys.
    if (error) throw new Error(error.message);
    customer = data;
  } catch {
    return {
      problem: "Could not check the driver's licence. The reservation was not saved — try again.",
      overridden: false,
    };
  }

  if (!customer) return OK;

  const status = licenceStatus(
    customer,
    instant(returnDate, typeof returnTime === "string" ? returnTime : null),
  );
  if (!status.blocks) return OK;

  if (attested) return { problem: null, overridden: true };
  return {
    problem: `${status.message}. Confirm the licence has been checked to save this reservation.`,
    overridden: false,
  };
}

/** The line written onto the reservation when staff attest. */
export function licenceAttestationNote(): string {
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  return `[${stamp} UTC] Driving licence expiry recorded as checked by staff.`;
}
