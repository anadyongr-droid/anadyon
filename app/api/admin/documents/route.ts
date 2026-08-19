import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// GET  /api/admin/documents?reservation_id=xxx  — list docs for a reservation
// POST /api/admin/documents                       — get a signed upload URL

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const reservationId = searchParams.get("reservation_id");
  if (!reservationId) return NextResponse.json([], { status: 200 });

  const { data } = await supabaseAdmin.storage
    .from("reservation-documents")
    .list(reservationId, { sortBy: { column: "created_at", order: "desc" } });

  const files = (data ?? []).map((f) => ({
    name: f.name,
    size: f.metadata?.size,
    created_at: f.created_at,
    path: `${reservationId}/${f.name}`,
  }));

  return NextResponse.json(files);
}

export async function POST(req: NextRequest) {
  // content_type is accepted because callers send it, and discarded because
  // createSignedUploadUrl takes no such argument — the browser sets the
  // header itself when it PUTs the file to the signed URL.
  const { reservation_id, file_name, content_type: _content_type } = await req.json();
  if (!reservation_id || !file_name) {
    return NextResponse.json({ error: "reservation_id and file_name required" }, { status: 400 });
  }

  const path = `${reservation_id}/${Date.now()}-${file_name}`;

  const { data, error } = await supabaseAdmin.storage
    .from("reservation-documents")
    .createSignedUploadUrl(path);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ signedUrl: data.signedUrl, path, token: data.token });
}

export async function DELETE(req: NextRequest) {
  const { path } = await req.json();
  if (!path) return NextResponse.json({ error: "path required" }, { status: 400 });

  const { error } = await supabaseAdmin.storage
    .from("reservation-documents")
    .remove([path]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
