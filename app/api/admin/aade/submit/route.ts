import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { buildDclXml, UnfilableError, type DclReservation } from "@/lib/aadeXml";
import { reportHandledError } from "@/lib/sentryReporting";

// AADE myDATA Digital Client List (DCL) v1.1
// Docs: https://www.aade.gr/en/mydata/technical-specifications-digital-client-list-portal-publications
// Dev:  https://mydataapidev.aade.gr/DCL/SendClient
// Prod: https://mydatapi.aade.gr/DCL/SendClient
const AADE_DCL_ENDPOINT = process.env.AADE_PRODUCTION === "true"
  ? "https://mydatapi.aade.gr/DCL/SendClient"
  : "https://mydataapidev.aade.gr/DCL/SendClient";

export async function POST(req: NextRequest) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "reservation id required" }, { status: 400 });

  const aadeUser = process.env.AADE_USER_ID;
  const aadeKey = process.env.AADE_SUBSCRIPTION_KEY;
  if (!aadeUser || !aadeKey) {
    return NextResponse.json(
      { error: "AADE credentials not configured. Add AADE_USER_ID and AADE_SUBSCRIPTION_KEY to Vercel environment variables." },
      { status: 503 },
    );
  }

  const { data: claimed } = await supabaseAdmin.rpc("claim_dcl_submission", {
    p_reservation_id: id,
  });
  if (claimed === false) {
    return NextResponse.json({ error: "DCL already submitted for this reservation" }, { status: 409 });
  }

  const { data: res, error } = await supabaseAdmin
    .from("reservations")
    .select("*, vehicles(name, plate, make, category), customers(first_name, last_name, full_name, nationality, country)")
    .eq("id", id)
    .single();
  if (error || !res) {
    return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
  }

  let xml: string;
  try {
    xml = buildDclXml(res as DclReservation);
  } catch (err) {
    await supabaseAdmin.from("reservations").update({ dcl_status: "error" }).eq("id", id);
    if (err instanceof UnfilableError) {
      reportHandledError(err, "aade", "build-dcl");
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    throw err;
  }

  let aadeRes: Response;
  try {
    aadeRes = await fetch(AADE_DCL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "aade-user-id": aadeUser,
        "Ocp-Apim-Subscription-Key": aadeKey,
      },
      body: xml,
    });
  } catch (err) {
    await supabaseAdmin.from("reservations").update({ dcl_status: "error" }).eq("id", id);
    reportHandledError(err, "aade", "submit-dcl");
    return NextResponse.json({ error: "Network error reaching AADE DCL API" }, { status: 502 });
  }

  const responseText = await aadeRes.text();
  if (!aadeRes.ok) {
    await supabaseAdmin.from("reservations").update({ dcl_status: "error" }).eq("id", id);
    return NextResponse.json(
      { error: `AADE returned ${aadeRes.status}`, detail: responseText },
      { status: 422 },
    );
  }

  const mark = responseText.match(/<mark>([^<]+)<\/mark>/i)?.[1] ?? null;
  await supabaseAdmin
    .from("reservations")
    .update({ dcl_status: "submitted", dcl_mark: mark })
    .eq("id", id);

  return NextResponse.json({ ok: true, mark });
}
