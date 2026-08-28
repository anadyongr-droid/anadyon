import { supabaseAdmin } from "@/lib/supabase";

/**
 * Dated availability blocks, on the manual assignment path.
 *
 * The database gates automatic website allocation inside
 * `find_available_eligible_vehicle` (migration 20260828120000). That covers the
 * path nobody watches. This covers the one a person drives — assigning a
 * vehicle from the Reservations screen — which is the likelier way a blocked
 * vehicle gets released, because a person can see the car in the list and has a
 * customer waiting.
 *
 * Blueprint §7 phase 1: "the counter must not be capable of releasing a blocked
 * vehicle or an invalid driver."
 */
export interface VehicleBlock {
  reason: string;
  starts_on: string;
  /** Null is open-ended — blocked from `starts_on` until somebody closes it. */
  ends_on: string | null;
  note: string | null;
}

const REASON_TEXT: Record<string, string> = {
  maintenance: "is in maintenance",
  statutory: "has a statutory block (KTEO, insurance or road tax)",
  damage: "is off the road with damage",
  hold: "is on hold",
  other: "is blocked",
};

/** What to tell the person who just tried to assign it. */
export function describeBlock(block: VehicleBlock): string {
  const what = REASON_TEXT[block.reason] ?? REASON_TEXT.other;
  const until = block.ends_on ? `until ${block.ends_on}` : "with no end date set";
  const note = block.note ? ` — ${block.note}` : "";
  return `This vehicle ${what} from ${block.starts_on} ${until}${note}.`;
}

/**
 * The first block overlapping the rental, or null if the vehicle is free.
 *
 * Blocks are whole days, inclusive at both ends, matching the database
 * predicate: a rental overlaps when it starts on or before the block's last day
 * and ends on or after its first.
 *
 * Throws rather than returning null when the read fails. §5.3: a read path must
 * never let "cannot reach the database" look like "nothing found" — and here
 * the two differ by whether a car on a ramp gets handed to a customer.
 */
export async function findBlockingBlock(
  vehicleId: string,
  pickupDate: string,
  returnDate: string,
): Promise<VehicleBlock | null> {
  const { data, error } = await supabaseAdmin
    .from("vehicle_blocks")
    .select("reason, starts_on, ends_on, note")
    .eq("vehicle_id", vehicleId)
    .lte("starts_on", returnDate)
    .or(`ends_on.is.null,ends_on.gte.${pickupDate}`)
    .order("starts_on")
    .limit(1);

  if (error) throw new Error(`could not check vehicle blocks: ${error.message}`);
  return data?.[0] ?? null;
}

/**
 * Guard for the reservation write paths. Returns the message to refuse with, or
 * null to proceed.
 *
 * Fails closed: an unreadable blocks table refuses the assignment. Releasing a
 * vehicle because the check was unavailable is the outcome this exists to
 * prevent.
 */
export async function vehicleBlockProblem(
  vehicleId: unknown,
  pickupDate: unknown,
  returnDate: unknown,
): Promise<string | null> {
  if (typeof vehicleId !== "string" || typeof pickupDate !== "string" || typeof returnDate !== "string") {
    return null;
  }
  if (!vehicleId || !pickupDate || !returnDate) return null;

  try {
    const block = await findBlockingBlock(vehicleId, pickupDate, returnDate);
    return block ? describeBlock(block) : null;
  } catch {
    return "Could not check whether this vehicle is blocked. The assignment was not saved — try again.";
  }
}
