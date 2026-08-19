import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import {
  isReservationId,
  safeFileName,
  isAllowedMime,
  parseDocumentPath,
  ALLOWED_MIME,
} from "@/lib/documentPaths";

/**
 * Documents attached to a reservation — licences, identity documents.
 *
 * GET    ?reservation_id=…   list
 * POST                        signed upload URL
 * DELETE                      remove one object
 *
 * Every route takes a path or an id from the caller, so every route checks it.
 * Before this, the id and filename were used exactly as supplied: `list()` took
 * any prefix, the signed upload URL was built from any path, and delete removed
 * whatever it was given. A staff session could therefore reach any object in
 * the bucket by naming it, which for a bucket of customers' identity documents
 * is not a small thing.
 *
 * The bucket enforces size and MIME type as well. That is deliberate belt and
 * braces: this layer gives a readable error, the bucket makes the rule true
 * even if a future route forgets to ask.
 */

const BUCKET = "reservation-documents";

/** Confirms the reservation exists before anything is stored against it. */
async function reservationExists(id: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("reservations")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  return !error && Boolean(data);
}

export async function GET(req: NextRequest) {
  const reservationId = req.nextUrl.searchParams.get("reservation_id");

  // An empty list rather than an error: the reservation screen asks for
  // documents before one has ever been attached, and that is not a fault.
  if (!isReservationId(reservationId)) return NextResponse.json([], { status: 200 });

  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .list(reservationId, { sortBy: { column: "created_at", order: "desc" } });

  if (error) {
    console.error("[documents] list failed:", error.message);
    return NextResponse.json({ error: "Could not list documents" }, { status: 500 });
  }

  const files = (data ?? []).map((f) => ({
    name: f.name,
    size: f.metadata?.size,
    created_at: f.created_at,
    path: `${reservationId}/${f.name}`,
  }));

  return NextResponse.json(files);
}

export async function POST(req: NextRequest) {
  let body: { reservation_id?: unknown; file_name?: unknown; content_type?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { reservation_id, file_name, content_type } = body;

  if (!isReservationId(reservation_id)) {
    return NextResponse.json({ error: "A valid reservation is required" }, { status: 400 });
  }

  const fileName = safeFileName(file_name);
  if (!fileName) {
    return NextResponse.json({ error: "That filename cannot be used" }, { status: 400 });
  }

  // The type is checked even though the browser sets the header itself on the
  // PUT: refusing here gives the person a clear message, rather than a failed
  // upload with a storage-layer error they cannot act on.
  if (content_type !== undefined && !isAllowedMime(content_type)) {
    return NextResponse.json(
      { error: `That file type is not accepted. Allowed: ${ALLOWED_MIME.join(", ")}` },
      { status: 400 }
    );
  }

  // Storing a document against a reservation that does not exist creates an
  // object nothing will ever list, delete or notice again.
  if (!(await reservationExists(reservation_id))) {
    return NextResponse.json({ error: "That reservation does not exist" }, { status: 404 });
  }

  const path = `${reservation_id}/${Date.now()}-${fileName}`;

  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUploadUrl(path);

  if (error) {
    console.error("[documents] signed upload URL failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ signedUrl: data.signedUrl, path, token: data.token });
}

export async function DELETE(req: NextRequest) {
  let body: { path?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Refuses anything that is not exactly `<reservation uuid>/<filename>`, so a
  // caller cannot delete by naming a path of their own construction.
  const parsed = parseDocumentPath(body.path);
  if (!parsed) return NextResponse.json({ error: "Invalid document path" }, { status: 400 });

  const { error } = await supabaseAdmin.storage.from(BUCKET).remove([body.path as string]);
  if (error) {
    console.error("[documents] delete failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.info(`[documents] removed ${body.path}`);
  return NextResponse.json({ ok: true });
}
