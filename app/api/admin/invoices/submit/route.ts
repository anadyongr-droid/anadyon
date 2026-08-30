import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { toIsoCountry } from "@/lib/aadeCountry";

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

/**
 * Thrown when the record cannot produce a filing that is true.
 *
 * Refusing is the safe direction. A submission AADE rejects can be corrected;
 * one it *accepts* carrying a wrong country is a false statutory record that
 * nobody will ever look at again.
 */
export class UnfilableError extends Error {}

// VAT 24% on car rental services in Greece
const VAT_RATE = 0.24;

export function buildInvoiceXml(res: Reservation, series: string, aa: number): string {
  const issuerVat    = process.env.COMPANY_VAT_NUMBER ?? "";
  const issuerBranch = process.env.COMPANY_BRANCH ?? "0";
  const issuerCountry = "GR";

  const counterpartVat = res.customers?.vat_number ?? "";
  const hasCounterpart = !!counterpartVat;

  /*
   * myDATA invoiceType, and the distinction that was wrong here.
   *
   *   2.1  ΤΠΥ  — Τιμολόγιο Παροχής Υπηρεσιών, a B2B *service* invoice
   *   11.1 ΑΛΠ  — Απόδειξη Λιανικής Πώλησης, a retail receipt for *goods*
   *   11.2 ΑΠΥ  — Απόδειξη Παροχής Υπηρεσιών, a retail receipt for *services*
   *
   * Renting a vehicle is a service, so a private customer's receipt is 11.2.
   * This filed 11.1 — the goods variant — while correctly using 2.1, the
   * service variant, for businesses. That inconsistency is what gives it away
   * as a slip rather than a decision: the B2B branch already knew this is a
   * service. Since almost every Anadyon customer is a private individual, it
   * would have mis-typed nearly every receipt issued.
   *
   * Worth confirming with the accountant before the first live filing, as with
   * anything statutory — but 11.1 for a rental is not defensible either way.
   */
  const invoiceType = hasCounterpart ? "2.1" : "11.2";

  const grossAmount = Math.max(0, (res.total ?? 0) - (res.discount_amount ?? 0));
  const netAmount   = parseFloat((grossAmount / (1 + VAT_RATE)).toFixed(2));
  const vatAmount   = parseFloat((grossAmount - netAmount).toFixed(2));

  // A business counterpart must carry a real country code. `customers.country`
  // holds an English display name ("United Kingdom"), never "GB" — see
  // lib/aadeCountry.ts. Unresolvable means refuse, not default: see below.
  const counterpartCountry = hasCounterpart ? toIsoCountry(res.customers?.country) : null;
  if (hasCounterpart && !counterpartCountry) {
    throw new UnfilableError(
      `Customer has a VAT number but no recognisable country ` +
      `(${res.customers?.country ?? "blank"}). myDATA needs an ISO country code ` +
      `for a business counterpart; set the customer's country before issuing.`
    );
  }

  const counterpartBlock = hasCounterpart ? `
    <counterpart>
      <vatNumber>${esc(counterpartVat)}</vatNumber>
      <country>${esc(counterpartCountry!)}</country>
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
      <!--
        These five are MANDATORY in InvoiceSummaryType (InvoicesDoc-v1.0.10.xsd)
        and were absent, so every filing this module ever attempted would have
        been rejected by schema validation before reaching a business rule. A
        vehicle rental has none of them, but "none" is 0.00, not omitted.

        The order is the schema's, not ours: xs:sequence is positional, so
        totalGrossValue has to stay last.
      -->
      <totalWithheldAmount>0.00</totalWithheldAmount>
      <totalFeesAmount>0.00</totalFeesAmount>
      <totalStampDutyAmount>0.00</totalStampDutyAmount>
      <totalOtherTaxesAmount>0.00</totalOtherTaxesAmount>
      <totalDeductionsAmount>0.00</totalDeductionsAmount>
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

  // Building the XML can refuse — see UnfilableError. Caught here so the claim
  // is released to "error" rather than left at "issuing", which
  // claim_invoice_submission would then refuse forever with no way to retry.
  let xml: string;
  try {
    xml = buildInvoiceXml(res as Reservation, series, aa ?? 1);
  } catch (err) {
    await supabaseAdmin.from("reservations").update({ invoice_status: "error" }).eq("id", id);
    if (err instanceof UnfilableError) {
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
