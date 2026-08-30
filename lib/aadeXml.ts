import { toIsoCountry } from "./aadeCountry";

/** A record cannot produce a filing that is true without staff correction. */
export class UnfilableError extends Error {}

export type DclReservation = {
  id: string;
  customer_name: string;
  customer_nationality: string;
  pickup_date: string;
  return_date: string;
  total: number;
  discount_amount: number;
  vehicles?: { name: string; plate?: string; make?: string; category?: string } | null;
  customers?: { first_name?: string; last_name?: string; full_name?: string; nationality?: string; country?: string } | null;
};

export type InvoiceReservation = {
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

function esc(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildDclXml(res: DclReservation): string {
  const firstName = res.customers?.first_name
    ?? String(res.customer_name ?? "").trim().split(" ")[0] ?? "";
  const lastName = res.customers?.last_name
    ?? String(res.customer_name ?? "").trim().split(" ").slice(1).join(" ") ?? "";
  const country = toIsoCountry(res.customers?.country);
  if (!country) {
    throw new UnfilableError(
      `Customer has no recognisable country (${res.customers?.country ?? "blank"}). ` +
      `The AADE client list needs an ISO country code; set the customer's country ` +
      `before submitting. Nationality is not used — "British" is not a country.`,
    );
  }

  const plate = res.vehicles?.plate ?? "";
  const make = res.vehicles?.make ?? "";
  const categoryMap: Record<string, string> = {
    car: "Car",
    motorbike: "Motorbike",
    bike: "Bicycle",
  };
  const vehicleCategory =
    categoryMap[res.vehicles?.category ?? ""] ?? res.vehicles?.category ?? "Car";
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

// VAT 24% on car rental services in Greece.
const VAT_RATE = 0.24;

export function buildInvoiceXml(
  res: InvoiceReservation,
  series: string,
  aa: number,
): string {
  const issuerVat = process.env.COMPANY_VAT_NUMBER ?? "";
  const issuerBranch = process.env.COMPANY_BRANCH ?? "0";
  const issuerCountry = "GR";
  const counterpartVat = res.customers?.vat_number ?? "";
  const hasCounterpart = Boolean(counterpartVat);

  // A rental is a service: 2.1 for a business and 11.2 for a private customer.
  const invoiceType = hasCounterpart ? "2.1" : "11.2";
  const grossAmount = Math.max(0, (res.total ?? 0) - (res.discount_amount ?? 0));
  const netAmount = Number((grossAmount / (1 + VAT_RATE)).toFixed(2));
  const vatAmount = Number((grossAmount - netAmount).toFixed(2));

  const counterpartCountry = hasCounterpart
    ? toIsoCountry(res.customers?.country)
    : null;
  if (hasCounterpart && !counterpartCountry) {
    throw new UnfilableError(
      `Customer has a VAT number but no recognisable country ` +
      `(${res.customers?.country ?? "blank"}). myDATA needs an ISO country code ` +
      `for a business counterpart; set the customer's country before issuing.`,
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
