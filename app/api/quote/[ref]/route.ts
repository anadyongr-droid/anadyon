import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest, { params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const surname = req.nextUrl.searchParams.get("surname")?.trim() ?? "";

  if (!surname) {
    return NextResponse.json({ error: "Surname required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("quotes")
    .select("*")
    .eq("ref", ref.toUpperCase())
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (data.last_name.toLowerCase() !== surname.toLowerCase()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (new Date(data.expires_at) < new Date()) {
    return NextResponse.json({ error: "This quote is no longer available online. Please contact us directly." }, { status: 410 });
  }

  return NextResponse.json(data);
}
