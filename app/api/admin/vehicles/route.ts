import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("vehicles")
    .select("*")
    // Then by plate: with the "#1" suffixes gone, four vehicles share the name
    // "Kymco 125cc" and the plate is the only thing that orders them. Without
    // this the dropdown lists them in whatever order the table returns, which
    // changes between requests and makes a specific bike hard to find twice.
    .order("sort_order")
    .order("name")
    .order("plate", { nullsFirst: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
