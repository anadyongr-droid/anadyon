import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { handoverErrorMessage, handoverErrorStatus } from "@/lib/handoverErrors";
import { actorId, actorName } from "../../route";

/**
 * Correcting a completed handover.
 *
 * Blueprint §4.2 rule 4: "A correction requires a reason and writes before/after
 * state to rental_handover_events in the same transaction."
 *
 * ─── Administrator only, and this route is where that is enforced ───
 *
 * proxy.ts admits staff to `/api/admin/handovers` by prefix, which is right for
 * every other path beneath it — the counter's work. This one is not counter
 * work: a correction rewrites an observation *in place*, where voiding and
 * re-recording leaves both versions and both reasons in the log. So it opts out
 * explicitly here, exactly as the vehicle ledger does under
 * `/api/admin/vehicles`.
 *
 * The role comes from the header proxy.ts sets after deleting any client copy,
 * so it cannot be spoofed. `handover_state_blockers()` and the gateway in
 * migration 043 are the second and third lines; this is the first.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Set by proxy.ts, which strips any client-supplied copy first. */
const ROLE_HEADER = "x-anadyon-role";

/**
 * What a correction may touch — observations, and nothing that says what the
 * record is *about*.
 *
 * Duplicated from migration 043 on purpose, and the duplication is safe in one
 * direction only: this list may be a subset of the database's, never a superset.
 * Anything that slipped past here is still refused by name there.
 */
const CORRECTABLE = ["odometer_km", "fuel_eighths", "cleanliness", "notes", "occurred_at"] as const;

const CLEANLINESS = ["clean", "acceptable", "poor"] as const;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  if (req.headers.get(ROLE_HEADER) !== "admin") {
    return NextResponse.json(
      { error: "Correcting a completed handover requires an administrator. Void it and record a new one instead." },
      { status: 403 },
    );
  }

  const raw = await req.json().catch(() => null);
  if (!raw || typeof raw !== "object") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const body = raw as Record<string, unknown>;

  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason) {
    return NextResponse.json({ error: "Say why this record is being corrected." }, { status: 400 });
  }

  const changesRaw = body.changes;
  if (!changesRaw || typeof changesRaw !== "object" || Array.isArray(changesRaw)) {
    return NextResponse.json({ error: "Say what is being corrected." }, { status: 400 });
  }
  const changes = changesRaw as Record<string, unknown>;

  const unknown = Object.keys(changes).filter(
    (k) => !CORRECTABLE.includes(k as (typeof CORRECTABLE)[number]),
  );
  if (unknown.length > 0) {
    return NextResponse.json(
      {
        error:
          `These cannot be corrected: ${unknown.join(", ")}. ` +
          "A handover recording a different reservation, vehicle, direction or template is a different event: void it and record a new one.",
      },
      { status: 400 },
    );
  }

  if (Object.keys(changes).length === 0) {
    return NextResponse.json({ error: "Nothing to correct." }, { status: 400 });
  }

  // Shape only. What the values *mean* together — an odometer below the
  // check-out reading, poor cleanliness with no note — is decided by
  // handover_state_blockers() against the corrected row, under a lock.
  if ("odometer_km" in changes) {
    const v = changes.odometer_km;
    if (v !== null && !(typeof v === "number" && Number.isInteger(v) && v >= 0)) {
      return NextResponse.json({ error: "The odometer must be a whole number of kilometres." }, { status: 400 });
    }
  }
  if ("fuel_eighths" in changes) {
    const v = changes.fuel_eighths;
    if (v !== null && !(typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 8)) {
      return NextResponse.json({ error: "Fuel is recorded in eighths, from 0 to 8." }, { status: 400 });
    }
  }
  if ("cleanliness" in changes) {
    const v = changes.cleanliness;
    if (v !== null && !(typeof v === "string" && CLEANLINESS.includes(v as (typeof CLEANLINESS)[number]))) {
      return NextResponse.json({ error: `Cleanliness must be one of: ${CLEANLINESS.join(", ")}.` }, { status: 400 });
    }
  }
  if ("occurred_at" in changes) {
    const v = changes.occurred_at;
    if (v !== null && (typeof v !== "string" || Number.isNaN(Date.parse(v)))) {
      return NextResponse.json({ error: "That is not a valid time." }, { status: 400 });
    }
  }

  const actor = await actorId();
  if (!actor) {
    return NextResponse.json(
      { error: "Your session could not be read. Sign in again before correcting." },
      { status: 401 },
    );
  }

  const { data, error } = await supabaseAdmin.rpc("correct_handover_impl", {
    p_handover_id: id,
    p_actor: actor,
    p_actor_name: await actorName(),
    p_reason: reason,
    p_changes: changes,
  });

  if (error) {
    return NextResponse.json(
      { error: handoverErrorMessage(error) },
      { status: handoverErrorStatus(error) },
    );
  }

  return NextResponse.json(data);
}
