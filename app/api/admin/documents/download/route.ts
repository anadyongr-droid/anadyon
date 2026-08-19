import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { parseDocumentPath } from "@/lib/documentPaths";

/**
 * A short-lived signed URL for one document.
 *
 * The path used to be taken from the query string and handed straight to
 * storage, which meant `?path=` was an instruction the caller wrote and the
 * server carried out: any object in the bucket could be read by naming it, and
 * the resulting URL needs no credential at all for the next five minutes.
 *
 * The path is now required to be exactly `<reservation uuid>/<filename>`, and
 * the reservation must exist. That does not make a staff session harmless — it
 * makes a staff session able to read documents belonging to real reservations,
 * which is the job, rather than anything the bucket happens to hold.
 */
export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path");

  const parsed = parseDocumentPath(path);
  if (!parsed) {
    return NextResponse.json({ error: "Invalid document path" }, { status: 400 });
  }

  const { data: reservation } = await supabaseAdmin
    .from("reservations")
    .select("id")
    .eq("id", parsed.reservationId)
    .maybeSingle();

  if (!reservation) {
    // Deliberately the same answer as a malformed path: whether a particular
    // reservation id exists is not something this endpoint should confirm.
    return NextResponse.json({ error: "Invalid document path" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.storage
    .from("reservation-documents")
    .createSignedUrl(path as string, 300); // five minutes

  if (error) {
    console.error("[documents] signed download URL failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ url: data.signedUrl });
}
