import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// AADE myDATA e-Invoicing
// Mandatory from 1 October 2026 (Phase B — all businesses)
// Dev:  https://mydataapidev.aade.gr/SendInvoices
// Prod: https://mydatapi.aade.gr/myDATA/SendInvoices
// Auth: same credentials as DCL (aade-user-id + Ocp-Apim-Subscription-Key)

const MYDATA_ENDPOINT = process.env.AADE_PRODUCTION === "true"
  ? "https://mydatapi.aade.gr/myDATA/SendInvoices"
  : "https://mydataapidev.aade.gr/SendInvoices";

type Reservation = {
  id: string;
  customer_name: string;
  pickup_date: string;
  return_date: string;
  total: number;
  discount_amount: number;
  invoice_series?: string;
  invoice_aa?: number;
  customers?: { first_name?: string; last_name?: string; vat_number?: string; country?: string } | null;
};

// VAT 24% on car rental services in Greece
const VAT_RATE = 0.24;

function buildInvoiceXml(res: Reservation, series: string, aa: number): string {
  const issuerVat    = process.env.COMPANY_VAT_NUMBER ?? "";
  const issuerBranch = process.env.COMPANY_BRANCH ?? "0";
  const issuerCountry = "GR";

  const counterpartVat     = res.customers?.vat_number ?? "";
  const counterpartCountry = res.customers?.country ?? "GR";

  // Invoice type: 2.1 = B2B service invoice, 11.1 = B2C retail receipt
  const hasCounterpart = !!counterpartVat;
  const invoiceType = hasCounterpart ? "2.1" : "11.1";

  const grossAmount = Math.max(0, (res.total ?? 0) - (res.discount_amount ?? 0));
  const netAmount   = parseFloat((grossAmount / (1 + VAT_RATE)).toFixed(2));
  const vatAmount   = parseFloat((grossAmount - netAmount).toFixed(2));

  const counterpartBlock = hasCounterpart ? `
    <counterpart>
      <vatNumber>${esc(counterpartVat)}</vatNumber>
      <country>${esc(counterpartCountry)}</country>
      <branch>0</branch>
    </counterpart>` : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<InvoicesDoc xmlns="https://www.aade.gr/myDATA/invoice/v1.0.10"
             xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <invoice>
    <issuer>
      <vatNumber>${esc(issuerVat)}</vatNumber>
      <country>${esc(issuerCountry)}</country>
      <branch>${esc(issuerBranch)}</branch>
    </issuer>${counterpartBlock}
    <invoiceHeader>
      <series>${esc(series)}</series>
      <aa>${aa}</aa>
      <issueDate>${res.pickup_date}</issueDate>
      <invoiceType>${invoiceType}</invoiceType>
      <currency>EUR</currency>
    </invoiceHeader>
    <invoiceDetails>
      <lineNumber>1</lineNumber>
      <netValue>${netAmount.toFixed(2)}</netValue>
      <vatCategory>1</vatCategory>
      <vatAmount>${vatAmount.toFixed(2)}</vatAmount>
    </invoiceDetails>
    <invoiceSummary>
      <totalNetValue>${netAmount.toFixed(2)}</totalNetValue>
      <totalVatAmount>${vatAmount.toFixed(2)}</totalVatAmount>
      <totalGrossValue>${grossAmount.toFixed(2)}</totalGrossValue>
    </invoiceSummary>
  </invoice>
</InvoicesDoc>`;
}

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function POST(req: NextRequest) {
  const { id, series = "A" } = await req.json();
  if (!id) return NextResponse.json({ error: "reservation id required" }, { status: 400 });

  const aadeUser = process.env.AADE_USER_ID;
  const aadeKey  = process.env.AADE_SUBSCRIPTION_KEY;
  if (!aadeUser || !aadeKey) {
    return NextResponse.json(
      { error: "AADE credentials not configured. Add AADE_USER_ID and AADE_SUBSCRIPTION_KEY to Vercel environment variables." },
      { status: 503 }
    );
  }
  if (!process.env.COMPANY_VAT_NUMBER) {
    return NextResponse.json(
      { error: "Company VAT number not configured. Add COMPANY_VAT_NUMBER to Vercel environment variables." },
      { status: 503 }
    );
  }

  // Claim submission atomically — returns false if already issued/issuing
  const { data: claimed } = await supabaseAdmin.rpc("claim_invoice_submission", { p_reservation_id: id });
  if (claimed === false) {
    return NextResponse.json({ error: "Invoice already issued for this reservation" }, { status: 409 });
  }

  const { data: res, error } = await supabaseAdmin
    .from("reservations")
    .select("*, customers(first_name, last_name, vat_number, country)")
    .eq("id", id)
    .single();

  if (error || !res) return NextResponse.json({ error: "Reservation not found" }, { status: 404 });

  // Get the next invoice serial number atomically (row-level lock prevents duplicates)
  const { data: aa } = await supabaseAdmin.rpc("next_invoice_aa", { p_series: series });
  const xml = buildInvoiceXml(res as Reservation, series, aa ?? 1);

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
  } catch {
    await supabaseAdmin.from("reservations").update({ invoice_status: "error" }).eq("id", id);
    return NextResponse.json({ error: "Network error reaching AADE myDATA API" }, { status: 502 });
  }

  const responseText = await aadeRes.text();

  if (!aadeRes.ok) {
    await supabaseAdmin.from("reservations").update({ invoice_status: "error" }).eq("id", id);
    return NextResponse.json({ error: `AADE returned ${aadeRes.status}`, detail: responseText }, { status: 422 });
  }

  const markMatch = responseText.match(/<invoiceMark>([^<]+)<\/invoiceMark>/i);
  const uidMatch  = responseText.match(/<invoiceUid>([^<]+)<\/invoiceUid>/i);
  const authMatch = responseText.match(/<authenticationCode>([^<]+)<\/authenticationCode>/i);

  const mark = markMatch?.[1] ?? null;
  const uid  = uidMatch?.[1] ?? null;
  const auth = authMatch?.[1] ?? null;

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
