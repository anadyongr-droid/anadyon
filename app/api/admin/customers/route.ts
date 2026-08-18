import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

/** Integrity violations are caused by the request, not by the server. */
function statusForPgError(code?: string): number {
  return ["23514", "23502", "23503", "23505", "22P02", "22007", "PGRST204"].includes(code ?? "")
    ? 400
    : 500;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");

  let query = supabaseAdmin
    .from("customers")
    .select("*")
    .order("created_at", { ascending: false });

  if (q) {
    query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: statusForPgError(error.code) });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const raw = await req.json();
  // Server-managed columns are never taken from the client, and an untouched
  // date input arrives as "" which a date column rejects outright.
  const { id: _id, created_at: _created, updated_at: _updated, ...rest } = raw;
  const body: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rest)) body[k] = v === "" ? null : v;

  const { data, error } = await supabaseAdmin
    .from("customers")
    .insert(body)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: statusForPgError(error.code) });
  return NextResponse.json(data, { status: 201 });
}
