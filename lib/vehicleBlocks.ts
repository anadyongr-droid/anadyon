import { supabaseAdmin } from "@/lib/supabase";

/**
 * A vehicle taken out of the active fleet.
 *
 * Blueprint §7.4. `vehicles.status` cannot do this job: it is a switch with no
 * dates and no memory, so it cannot say "in the workshop from Tuesday", cannot
 * hold a future entry, and depends on somebody remembering to set it back.
 *
 * **An expected return is a promise from a third party, not a fact.** The
 * garage says the 15th and does not deliver. So `expected_return` drives
 * planning, display and reminders and ends nothing: a block is open until a
 * person records the vehicle back, and an open block is a hard stop out of the
 * fleet for every date from `starts_on` onward — including dates past the
 * estimate, and including next season.
 *
 * That costs forward bookings, knowingly. The escape is the attestation below,
 * not a softer rule: a hard stop nobody can pass honestly is one they pass by
 * deleting the block, and the record goes with it.
 */
export interface VehicleBlock {
  id: string;
  reason: string;
  starts_on: string;
  /** The garage's estimate. Advisory: it releases nothing. */
  expected_return: string | null;
  note: string | null;
}

const REASON_TEXT: Record<string, string> = {
  maintenance: "is in maintenance",
  statutory: "is held for a statutory reason",
  damage: "is off the road with damage",
  hold: "is on hold",
  other: "is out of the fleet",
};

/** What to tell the person who just tried to assign it. */
export function describeBlock(block: VehicleBlock): string {
  const what = REASON_TEXT[block.reason] ?? REASON_TEXT.other;
  const since = `out since ${block.starts_on}`;
  const expected = block.expected_return
    ? `, expected back ${block.expected_return}`
    : ", with no expected return recorded";
  const note = block.note ? ` — ${block.note}` : "";
  return `This vehicle ${what} (${since}${expected})${note}.`;
}

/** Written onto the reservation when staff assign the vehicle anyway. */
export function blockAttestationNote(block: VehicleBlock): string {
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  return `[${stamp} UTC] Assigned despite an open ${block.reason} block (out since ${block.starts_on}), confirmed by staff.`;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The open block that stops this rental, or null.
 *
 * Only the return date matters: a block beginning on or before the rental ends
 * covers it, and an open block has no far end to compare against.
 *
 * Throws rather than returning null when the read fails. §5.3 — a read path
 * must never let "cannot reach the database" look like "nothing found", and
 * here the two differ by whether a car on a ramp is handed to a customer.
 */
export async function findOpenBlock(
  vehicleId: string,
  returnDate: string,
): Promise<VehicleBlock | null> {
  if (!ISO_DATE.test(returnDate)) {
    throw new Error("vehicle block check requires an ISO calendar date");
  }
  const { data, error } = await supabaseAdmin
    .from("vehicle_blocks")
    .select("id, reason, starts_on, expected_return, note")
    .eq("vehicle_id", vehicleId)
    .is("released_at", null)
    .lte("starts_on", returnDate)
    .order("starts_on")
    .limit(1);

  if (error) throw new Error(`could not check vehicle blocks: ${error.message}`);
  return data?.[0] ?? null;
}

export interface BlockGateResult {
  /** The message to refuse with, or null to proceed. */
  problem: string | null;
  /** The block that was overridden, when an attestation permitted one. */
  overridden: VehicleBlock | null;
}

const OK: BlockGateResult = { problem: null, overridden: null };

/**
 * Guard for the reservation write paths.
 *
 * Fails closed: an unreadable blocks table refuses the assignment. Releasing a
 * vehicle because the check was unavailable is the outcome this exists to
 * prevent.
 */
export async function vehicleBlockProblem(
  vehicleId: unknown,
  returnDate: unknown,
  attested: boolean,
): Promise<BlockGateResult> {
  if (typeof vehicleId !== "string" || !vehicleId) return OK;
  if (typeof returnDate !== "string" || !returnDate) return OK;

  let block: VehicleBlock | null;
  try {
    block = await findOpenBlock(vehicleId, returnDate);
  } catch {
    return {
      problem: "Could not check whether this vehicle is out of the fleet. The reservation was not saved — try again.",
      overridden: null,
    };
  }

  if (!block) return OK;
  if (attested) return { problem: null, overridden: block };
  return {
    problem: `${describeBlock(block)} Confirm you are assigning it anyway to save this reservation.`,
    overridden: null,
  };
}

// ── Chasing a vehicle that has not come back ────────────────────────────────

/** Days out before the daily reminder starts. */
export const REMIND_FROM_DAYS = 2;
/** Days out before it escalates: top of the briefing, and an email. */
export const ESCALATE_FROM_DAYS = 4;

export type BlockUrgency = "quiet" | "remind" | "escalate";

export interface BlockChase {
  urgency: BlockUrgency;
  /** Whole days since the vehicle went out. Negative for a future block. */
  daysOut: number;
  /** Whole days until the estimate; negative once it has passed; null if none. */
  daysToExpected: number | null;
}

function wholeDays(from: string, to: Date): number {
  const start = new Date(`${from}T00:00:00Z`);
  const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.floor((end - start.getTime()) / 86_400_000);
}

/**
 * How hard to chase an open block.
 *
 * Clocked from **how long the vehicle has been out**, not from the estimate.
 * Measuring against a number that may already be wrong is no measurement — and
 * the estimate is exactly the thing being doubted.
 *
 * `daysToExpected` is carried so the reminder can distinguish a legitimate
 * ten-day rebuild from a car nobody has thought about. A line that reads
 * "out 4 days, expected back in 6" is information; the same line without it
 * is a nag, and a nag is what gets ignored.
 */
export function blockChase(
  block: Pick<VehicleBlock, "starts_on" | "expected_return">,
  today: Date = new Date(),
): BlockChase {
  const daysOut = wholeDays(block.starts_on, today);
  const daysToExpected = block.expected_return ? -wholeDays(block.expected_return, today) : null;

  const urgency: BlockUrgency =
    daysOut >= ESCALATE_FROM_DAYS ? "escalate"
    : daysOut >= REMIND_FROM_DAYS ? "remind"
    : "quiet";

  return { urgency, daysOut, daysToExpected };
}
