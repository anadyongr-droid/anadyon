import { MAX_CHILD_SEATS_TOTAL, SEATS_LIMIT_MESSAGE, seatsWithinLimit } from "@/lib/rentalPolicy";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * Checks a reservation write against the combined child-seat limit.
 *
 * A PATCH may name only one of the two seat fields, so the limit has to be
 * tested against the row as it will be *after* the write — raising baby seats
 * to 2 on a booking that already has 2 child seats is a breach even though the
 * request mentions only one field. Passing `null` for the id checks a create,
 * where the request is the whole row.
 *
 * Returns the message to show, or null when the write is allowed. Nothing is
 * ever silently reduced: a customer who asked for four seats is told we cannot
 * fit four rather than quietly given three.
 */
export async function validateSeatTotals(
  reservationId: string | null,
  body: Record<string, unknown>,
): Promise<string | null> {
  const submits = (key: string) => body[key] !== undefined && body[key] !== null && body[key] !== "";
  if (!submits("baby_seat") && !submits("child_seat")) return null;

  let currentBaby = 0;
  let currentChild = 0;
  if (reservationId) {
    const { data } = await supabaseAdmin
      .from("reservations")
      .select("baby_seat, child_seat")
      .eq("id", reservationId)
      .maybeSingle();
    currentBaby = Number(data?.baby_seat) || 0;
    currentChild = Number(data?.child_seat) || 0;
  }

  const baby = submits("baby_seat") ? Number(body.baby_seat) : currentBaby;
  const child = submits("child_seat") ? Number(body.child_seat) : currentChild;

  if (!Number.isInteger(baby) || !Number.isInteger(child) || baby < 0 || child < 0) {
    return `Baby and child seats must be whole numbers of 0 or more (maximum ${MAX_CHILD_SEATS_TOTAL} in total).`;
  }
  if (!seatsWithinLimit(baby, child)) {
    return `${SEATS_LIMIT_MESSAGE} This booking requests ${baby} baby seat(s) and ${child} child seat(s).`;
  }
  return null;
}
