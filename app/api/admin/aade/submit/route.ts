import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// AADE myDATA DCL (Digital Client List) submission
// Docs: https://www.aade.gr/epiheiriseis/foroi/mydata
// Sandbox: https://mydataapidev.aade.gr/myDATA/sendClientListData
// Production: https://mydatapi.aade.gr/myDATA/sendClientListData

const AADE_ENDPOINT = process.env.AADE_PRODUCTION === "true"
  ? "https://mydatapi.aade.gr/myDATA/sendClientListData"
  : "https://mydataapidev.aade.gr/myDATA/sendClientListData";

function buildXml(r: Record<string, unknown> & { vehicles?: { name: string; plate?: string } }): string {
  const vehicleName = r.vehicles?.name ?? "";
  const plate = r.vehicles?.plate ?? "";
  const pickupDate = String(r.pickup_date ?? "").replace(/-/g, "");  // YYYYMMDD
  const returnDate = String(r.return_date ?? "").replace(/-/g, "");

  // Parse first/last name from customer_name
  const nameParts = String(r.customer_name ?? "").trim().split(" ");
  const firstName = nameParts[0] ?? "";
  const lastName = nameParts.slice(1).join(" ") || firstName;

  return `<?xml version="1.0" encoding="UTF-8"?>
<ClientListData xmlns="http://www.aade.gr/myDATA/clientList/v1.0">
  <Client>
    <FirstName>${esc(firstName)}</FirstName>
    <LastName>${esc(lastName)}</LastName>
    <Country>${esc(String(r.customer_nationality ?? "GR"))}</Country>
    <VehicleRegistrationNumber>${esc(plate)}</VehicleRegistrationNumber>
    <VehicleDescription>${esc(vehicleName)}</VehicleDescription>
    <RentalStartDate>${pickupDate}</RentalStartDate>
    <RentalEndDate>${returnDate}</RentalEndDate>
    <RentalDays>${r.rental_days ?? 1}</RentalDays>
    <TotalRentValue>${r.total ?? 0}</TotalRentValue>
  </Client>
</ClientListData>`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function POST(req: NextRequest) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "reservation id required" }, { status: 400 });

  const aadeUser = process.env.AADE_USER_ID;
  const aadeKey  = process.env.AADE_SUBSCRIPTION_KEY;

  if (!aadeUser || !aadeKey) {
    return NextResponse.json(
      { error: "AADE credentials not configured. Add AADE_USER_ID and AADE_SUBSCRIPTION_KEY to environment variables." },
      { status: 503 }
    );
  }

  // Fetch reservation with vehicle plate
  const { data: res, error } = await supabaseAdmin
    .from("reservations")
    .select("*, vehicles(name, plate)")
    .eq("id", id)
    .single();

  if (error || !res) return NextResponse.json({ error: "Reservation not found" }, { status: 404 });

  const xml = buildXml(res as Record<string, unknown> & { vehicles?: { name: string; plate?: string } });

  // Submit to AADE
  let aadeRes: Response;
  try {
    aadeRes = await fetch(AADE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/xml",
        "aade-user-id": aadeUser,
        "Ocp-Apim-Subscription-Key": aadeKey,
      },
      body: xml,
    });
  } catch (e) {
    await supabaseAdmin.from("reservations").update({ dcl_status: "error" }).eq("id", id);
    return NextResponse.json({ error: "Network error reaching AADE API" }, { status: 502 });
  }

  const responseText = await aadeRes.text();

  if (!aadeRes.ok) {
    await supabaseAdmin.from("reservations").update({ dcl_status: "error" }).eq("id", id);
    return NextResponse.json(
      { error: `AADE returned ${aadeRes.status}`, detail: responseText },
      { status: 422 }
    );
  }

  // Extract mark from response XML (AADE returns <mark> element)
  const markMatch = responseText.match(/<mark>([^<]+)<\/mark>/i);
  const mark = markMatch?.[1] ?? null;

  await supabaseAdmin
    .from("reservations")
    .update({ dcl_status: "submitted", dcl_mark: mark })
    .eq("id", id);

  return NextResponse.json({ ok: true, mark });
}
