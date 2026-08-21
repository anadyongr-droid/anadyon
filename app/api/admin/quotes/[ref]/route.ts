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
  return NextResponse.json(data);
}

// A quote may be removed only while it has not become a reservation. The
// relationship is historical text rather than a foreign key, so protect it
// explicitly here instead of leaving a reservation with a dead quote reference.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const { data: linked, error: linkedError } = await supabaseAdmin
    .from("reservations")
    .select("id")
    .like("notes", `Quote ref: ${ref}%`)
    .limit(1);

  if (linkedError) return NextResponse.json({ error: linkedError.message }, { status: 500 });
  if ((linked?.length ?? 0) > 0) {
    return NextResponse.json({ error: "This quote has a reservation and cannot be deleted." }, { status: 409 });
  }

  const { error } = await supabaseAdmin.from("quotes").delete().eq("ref", ref);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
