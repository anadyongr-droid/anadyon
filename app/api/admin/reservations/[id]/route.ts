import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, error } = await supabaseAdmin
    .from("reservations")
    .select("*, vehicles(name, category)")
    .eq("id", id)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  // Overlap check when a vehicle is assigned
  if (body.vehicle_id && body.pickup_date && body.return_date) {
    const { data: conflicts } = await supabaseAdmin
      .from("reservations")
      .select("id")
      .eq("vehicle_id", body.vehicle_id)
      .not("id", "eq", id)
      .not("status", "in", '("cancelled","voided","no_show")')
      .lt("pickup_date", body.return_date)
      .gt("return_date", body.pickup_date);

    if (conflicts && conflicts.length > 0) {
      return NextResponse.json(
        { error: "This vehicle is already booked for those dates." },
        { status: 409 }
      );
    }
  }

  const { data, error } = await supabaseAdmin
    .from("reservations")
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*, vehicles(name, category)")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await supabaseAdmin.from("reservations").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
