import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { handoverErrorMessage, handoverErrorStatus } from "@/lib/handoverErrors";
import { actorId, actorName } from "../../route";

/**
 * Voiding a handover.
 *
 * Blueprint §4.2 rule 4: "Voiding is the same kind of audited action, not a
 * DELETE." Migration 043 does the work — clearing `completed_at` so the
 * completed-together constraint holds, stepping the reservation back only from
 * the status this handover set, and writing the event.
 *
 * **Available to staff, on purpose.** Getting the wrong car onto a handover is
 * a counter mistake, and a fix only an administrator can perform is a fix that
 * waits — with a customer standing there. The mandatory reason and the
 * replacement record are what make that safe, and both are enforced below and
 * in the database rather than assumed.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const raw = await req.json().catch(() => null);
  if (!raw || typeof raw !== "object") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const body = raw as Record<string, unknown>;

  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason) {
    // Checked here as well as in the database, because this is the message a
    // person reads. The database refusal is the guarantee; this is the one that
    // tells them what to type.
    return NextResponse.json({ error: "Say why this handover is being voided." }, { status: 400 });
  }

  const actor = await actorId();
  if (!actor) {
    return NextResponse.json(
      { error: "Your session could not be read. Sign in again before voiding." },
      { status: 401 },
    );
  }

  const { data, error } = await supabaseAdmin.rpc("void_handover_impl", {
    p_handover_id: id,
    p_actor: actor,
    p_actor_name: await actorName(),
    p_reason: reason,
  });

  if (error) {
    return NextResponse.json(
      { error: handoverErrorMessage(error) },
      { status: handoverErrorStatus(error) },
    );
  }

  return NextResponse.json(data);
}
