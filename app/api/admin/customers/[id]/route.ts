import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const EDITABLE_CUSTOMER_FIELDS = new Set([
  "title", "first_name", "last_name", "email", "phone", "phone_alt", "nationality", "dob",
  "address", "city", "postal_code", "country", "passport_number", "passport_expiry",
  "driving_licence_number", "driving_licence_expiry", "driving_licence_country",
  "emergency_contact_name", "emergency_contact_phone", "vat_number", "referral_source",
  "referral_detail", "preferred_vehicle_category", "do_not_rent", "dnr_reason", "notes",
]);

const DATE_FIELDS = new Set(["dob", "passport_expiry", "driving_licence_expiry"]);

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, error } = await supabaseAdmin
    .from("customers")
    .select("*, reservations(id, pickup_date, return_date, status, total, vehicles(name, plate))")
    .eq("id", id)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const raw = await req.json();
  const body = Object.fromEntries(
    Object.entries(raw)
      .filter(([key]) => EDITABLE_CUSTOMER_FIELDS.has(key))
      .map(([key, value]) => [key, DATE_FIELDS.has(key) && value === "" ? null : value]),
  );
  const fullName = [body.first_name, body.last_name]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(" ");
  if ("first_name" in body && "last_name" in body) body.full_name = fullName || null;
  const { data, error } = await supabaseAdmin
    .from("customers")
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await supabaseAdmin.from("customers").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
