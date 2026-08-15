import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// AADE myDATA Digital Client List (DCL) v1.1
// Docs: https://www.aade.gr/en/mydata/technical-specifications-digital-client-list-portal-publications
// Dev:  https://mydataapidev.aade.gr/DCL/SendClient
// Prod: https://mydatapi.aade.gr/DCL/SendClient

const AADE_DCL_ENDPOINT = process.env.AADE_PRODUCTION === "true"
  ? "https://mydatapi.aade.gr/DCL/SendClient"
  : "https://mydataapidev.aade.gr/DCL/SendClient";

type Reservation = {
  id: string;
  customer_name: string;
  customer_nationality: string;
  pickup_date: string;
  return_date: string;
  total: number;
  discount_amount: number;
  vehicles?: { name: string; plate?: string; make?: string; category?: string } | null;
  customers?: { first_name?: string; last_name?: string; full_name?: string; nationality?: string } | null;
};

function buildDclXml(res: Reservation): string {
  // Prefer linked CRM customer for name / nationality
  const firstName = res.customers?.first_name
    ?? String(res.customer_name ?? "").trim().split(" ")[0] ?? "";
  const lastName = res.customers?.last_name
    ?? String(res.customer_name ?? "").trim().split(" ").slice(1).join(" ") ?? "";
  const country = res.customers?.nationality ?? res.customer_nationality ?? "GR";

  const plate = res.vehicles?.plate ?? "";
  const make = res.vehicles?.make ?? "";
  // Map internal category to a human-readable vehicle category for AADE
  const categoryMap: Record<string, string> = { car: "Car", motorbike: "Motorbike", bike: "Bicycle" };
  const vehicleCategory = categoryMap[res.vehicles?.category ?? ""] ?? res.vehicles?.category ?? "Car";

  const agreedAmount = Math.max(0, (res.total ?? 0) - (res.discount_amount ?? 0));

  return `<?xml version="1.0" encoding="UTF-8"?>
<ClientDoc xmlns="http://www.aade.gr/myDATA/DCL/v1.1"
           xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <client>
    <clientServiceType>1</clientServiceType>
    <counterpartFirstName>${esc(firstName)}</counterpartFirstName>
    <counterpartLastName>${esc(lastName)}</counterpartLastName>
    <counterpartCountry>${esc(country)}</counterpartCountry>
    <vehicleLicensePlate>${esc(plate)}</vehicleLicensePlate>
    <vehicleCategory>${esc(vehicleCategory)}</vehicleCategory>
    <vehicleManufacturer>${esc(make)}</vehicleManufacturer>
    <movementPurpose>1</movementPurpose>
    <isDiffVehReturnLocation>false</isDiffVehReturnLocation>
    <agreedAmount>${agreedAmount.toFixed(2)}</agreedAmount>
    <nonIssueInvoice>true</nonIssueInvoice>
    <rentalStartDate>${res.pickup_date}</rentalStartDate>
    <rentalEndDate>${res.return_date}</rentalEndDate>
  </client>
</ClientDoc>`;
}

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function POST(req: NextRequest) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "reservation id required" }, { status: 400 });

  const aadeUser = process.env.AADE_USER_ID;
  const aadeKey  = process.env.AADE_SUBSCRIPTION_KEY;
  if (!aadeUser || !aadeKey) {
    return NextResponse.json(
      { error: "AADE credentials not configured. Add AADE_USER_ID and AADE_SUBSCRIPTION_KEY to Vercel environment variables." },
      { status: 503 }
    );
  }

  const { data: res, error } = await supabaseAdmin
    .from("reservations")
    .select("*, vehicles(name, plate, make, category), customers(first_name, last_name, full_name, nationality)")
    .eq("id", id)
    .single();

  if (error || !res) return NextResponse.json({ error: "Reservation not found" }, { status: 404 });

  const xml = buildDclXml(res as Reservation);

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
  } catch {
    await supabaseAdmin.from("reservations").update({ dcl_status: "error" }).eq("id", id);
    return NextResponse.json({ error: "Network error reaching AADE DCL API" }, { status: 502 });
  }

  const responseText = await aadeRes.text();

  if (!aadeRes.ok) {
    await supabaseAdmin.from("reservations").update({ dcl_status: "error" }).eq("id", id);
    return NextResponse.json({ error: `AADE returned ${aadeRes.status}`, detail: responseText }, { status: 422 });
  }

  // AADE DCL response contains <mark> on success
  const markMatch = responseText.match(/<mark>([^<]+)<\/mark>/i);
  const mark = markMatch?.[1] ?? null;

  await supabaseAdmin
    .from("reservations")
    .update({ dcl_status: "submitted", dcl_mark: mark })
    .eq("id", id);

  return NextResponse.json({ ok: true, mark });
}
