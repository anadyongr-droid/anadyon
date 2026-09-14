import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { handoverErrorMessage, handoverErrorStatus } from "@/lib/handoverErrors";
import { actorId, actorName } from "../../route";

/**
 * Finalising a handover: the car leaves, or the car is back.
 *
 * Blueprint §4.2 rules 2 and 3. Everything that decides whether this is allowed
 * lives in `finalise_check_out_impl` / `finalise_check_in_impl`, in one
 * transaction with the reservation's status change. This route chooses which of
 * the two to call and passes the answer back.
 *
 * **It deliberately re-checks nothing.** A precondition validated here as well
 * would be a second copy of a rule that the database enforces under a lock,
 * and the copy without the lock is the one that will be wrong — it can pass on
 * state that has changed by the time the transaction runs.
 *
 * The direction is read from the row rather than taken from the request. A
 * tablet that could name the direction could finalise a check-in through the
 * check-out path; migration 042 refuses that, and there is no reason to let it
 * be attempted.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const raw = await req.json().catch(() => ({}));
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  // Optional: when staff record that the handover really happened earlier than
  // the moment they pressed the button. §4.2 requires the difference to reach
  // the event log, which the database function does.
  let occurredAt: string | null = null;
  if ("occurred_at" in body && body.occurred_at !== null) {
    const v = body.occurred_at;
    if (typeof v !== "string" || Number.isNaN(Date.parse(v))) {
      return NextResponse.json({ error: "That is not a valid time." }, { status: 400 });
    }
    if (Date.parse(v) > Date.now()) {
      return NextResponse.json({ error: "A handover cannot have occurred in the future." }, { status: 400 });
    }
    occurredAt = v;
  }

  const found = await supabaseAdmin
    .from("rental_handovers")
    .select("id, direction")
    .eq("id", id)
    .maybeSingle();

  if (found.error) {
    return NextResponse.json(
      { error: handoverErrorMessage(found.error) },
      { status: handoverErrorStatus(found.error) },
    );
  }
  if (!found.data) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const direction = (found.data as { direction: string }).direction;
  const fn = direction === "out" ? "finalise_check_out_impl" : "finalise_check_in_impl";

  const actor = await actorId();
  if (!actor) {
    // The proxy already refused an unauthenticated request, so reaching here
    // means the session could not be read rather than that there was none.
    // Saying so beats an opaque 500 from the database's own actor check.
    return NextResponse.json(
      { error: "Your session could not be read. Sign in again before finalising." },
      { status: 401 },
    );
  }

  const { data, error } = await supabaseAdmin.rpc(fn, {
    p_handover_id: id,
    p_actor: actor,
    p_actor_name: await actorName(),
    p_occurred_at: occurredAt,
  });

  if (error) {
    return NextResponse.json(
      { error: handoverErrorMessage(error) },
      { status: handoverErrorStatus(error) },
    );
  }

  return NextResponse.json(data);
}
