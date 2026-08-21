import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const { data, error } = await supabaseAdmin
    .from("quotes")
    .select("*")
    .eq("ref", ref)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  const { data: linkedReservations, error: reservationsError } = await supabaseAdmin
    .from("reservations")
    .select("id, status")
    .eq("quote_id", data.id);
  if (reservationsError) return NextResponse.json({ error: reservationsError.message }, { status: 500 });

  return NextResponse.json({ ...data, linked_reservations: linkedReservations ?? [] });
}

// A quote may be removed only while it has not become a reservation. The
// relationship is explicit for current bookings. The legacy note fallback
// remains defensive for a partially applied historic backfill.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const { data: quote, error: quoteError } = await supabaseAdmin
    .from("quotes")
    .select("id")
    .eq("ref", ref)
    .single();
  if (quoteError) return NextResponse.json({ error: quoteError.message }, { status: 404 });

  const { data: linkedById, error: linkedError } = await supabaseAdmin
    .from("reservations")
    .select("id")
    .eq("quote_id", quote.id)
    .limit(1);

  if (linkedError) return NextResponse.json({ error: linkedError.message }, { status: 500 });
  const { data: linkedByNote, error: noteError } = (linkedById?.length ?? 0) > 0
    ? { data: [], error: null }
    : await supabaseAdmin.from("reservations").select("id").like("notes", `Quote ref: ${ref}%`).limit(1);
  if (noteError) return NextResponse.json({ error: noteError.message }, { status: 500 });
  if ((linkedById?.length ?? 0) > 0 || (linkedByNote?.length ?? 0) > 0) {
    return NextResponse.json({ error: "This quote has a reservation and cannot be deleted." }, { status: 409 });
  }

  const { error } = await supabaseAdmin.from("quotes").delete().eq("ref", ref);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
