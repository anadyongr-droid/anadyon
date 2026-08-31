import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import {
  buildInvoiceXml,
  UnfilableError,
  type InvoiceReservation,
} from "@/lib/aadeXml";
import { reportHandledError } from "@/lib/sentryReporting";

// AADE myDATA e-Invoicing
// Mandatory from 1 October 2026 (Phase B — all businesses)
// Dev:  https://mydataapidev.aade.gr/SendInvoices
// Prod: https://mydatapi.aade.gr/myDATA/SendInvoices
const MYDATA_ENDPOINT = process.env.AADE_PRODUCTION === "true"
  ? "https://mydatapi.aade.gr/myDATA/SendInvoices"
  : "https://mydataapidev.aade.gr/SendInvoices";

export async function POST(req: NextRequest) {
  const { id, series = "A" } = await req.json();
  if (!id) return NextResponse.json({ error: "reservation id required" }, { status: 400 });

  const aadeUser = process.env.AADE_USER_ID;
  const aadeKey = process.env.AADE_SUBSCRIPTION_KEY;
  if (!aadeUser || !aadeKey) {
    return NextResponse.json(
      { error: "AADE credentials not configured. Add AADE_USER_ID and AADE_SUBSCRIPTION_KEY to Vercel environment variables." },
      { status: 503 },
    );
  }
  if (!process.env.COMPANY_VAT_NUMBER) {
    return NextResponse.json(
      { error: "Company VAT number not configured. Add COMPANY_VAT_NUMBER to Vercel environment variables." },
      { status: 503 },
    );
  }

  const { data: claimed } = await supabaseAdmin.rpc("claim_invoice_submission", {
    p_reservation_id: id,
  });
  if (claimed === false) {
    return NextResponse.json({ error: "Invoice already issued for this reservation" }, { status: 409 });
  }

  const { data: res, error } = await supabaseAdmin
    .from("reservations")
    .select("*, customers(first_name, last_name, vat_number, country)")
    .eq("id", id)
    .single();
  if (error || !res) {
    return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
  }

  const { data: aa } = await supabaseAdmin.rpc("next_invoice_aa", { p_series: series });

  let xml: string;
  try {
    xml = buildInvoiceXml(res as InvoiceReservation, series, aa ?? 1);
  } catch (err) {
    await supabaseAdmin.from("reservations").update({ invoice_status: "error" }).eq("id", id);
    if (err instanceof UnfilableError) {
      reportHandledError(err, "invoice", "build-mydata");
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    throw err;
  }

  let aadeRes: Response;
  try {
    aadeRes = await fetch(MYDATA_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "aade-user-id": aadeUser,
        "Ocp-Apim-Subscription-Key": aadeKey,
      },
      body: xml,
    });
  } catch (err) {
    await supabaseAdmin.from("reservations").update({ invoice_status: "error" }).eq("id", id);
    reportHandledError(err, "invoice", "submit-mydata");
    return NextResponse.json({ error: "Network error reaching AADE myDATA API" }, { status: 502 });
  }

  const responseText = await aadeRes.text();
  if (!aadeRes.ok) {
    await supabaseAdmin.from("reservations").update({ invoice_status: "error" }).eq("id", id);
    return NextResponse.json(
      { error: `AADE returned ${aadeRes.status}`, detail: responseText },
      { status: 422 },
    );
  }

  const mark = responseText.match(/<invoiceMark>([^<]+)<\/invoiceMark>/i)?.[1] ?? null;
  const uid = responseText.match(/<invoiceUid>([^<]+)<\/invoiceUid>/i)?.[1] ?? null;
  const auth = responseText.match(/<authenticationCode>([^<]+)<\/authenticationCode>/i)?.[1] ?? null;

  await supabaseAdmin
    .from("reservations")
    .update({
      invoice_status: "issued",
      invoice_mark: mark,
      invoice_uid: uid,
      invoice_auth: auth,
      invoice_series: series,
      invoice_aa: aa,
    })
    .eq("id", id);

  return NextResponse.json({ ok: true, mark, uid, auth, series, aa });
}
