import { beforeEach, describe, expect, it } from "vitest";

/**
 * The generated XML, checked against the published schema rather than by
 * reading the source for literals.
 *
 * `InvoicesDoc-v1.0.10.xsd` — the version our `xmlns` declares — is the
 * authority for what follows. Its `InvoiceSummaryType` is an `xs:sequence` of
 * **eight mandatory** elements, and this module was sending three. Every
 * invoice it ever attempted would have failed schema validation before AADE
 * looked at a single business rule; nobody found out because the module had no
 * tests and has never been given credentials.
 *
 * `xs:sequence` is positional, so order is asserted, not just presence.
 *
 * ─── What this cannot check ───
 *
 * The client-list (DCL) side files against a different AADE API whose schema is
 * published only on aade.gr, which this environment's egress policy blocks. Its
 * shape below is therefore checked for internal consistency only — that the
 * country resolves and the refusal fires — and NOT against the real schema.
 * Treat a green run here as saying nothing about whether AADE will accept a DCL
 * submission. The sandbox is what settles that.
 */

/** InvoiceSummaryType, in schema order. All eight are minOccurs=1. */
const SUMMARY_ORDER = [
  "totalNetValue",
  "totalVatAmount",
  "totalWithheldAmount",
  "totalFeesAmount",
  "totalStampDutyAmount",
  "totalOtherTaxesAmount",
  "totalDeductionsAmount",
  "totalGrossValue",
] as const;

const reservation = (over: Record<string, unknown> = {}) => ({
  id: "r1",
  customer_name: "Jane Smith",
  customer_nationality: "British",
  pickup_date: "2026-07-01",
  return_date: "2026-07-08",
  total: 372,
  discount_amount: 0,
  customers: { first_name: "Jane", last_name: "Smith", country: "United Kingdom", vat_number: "" },
  ...over,
});

beforeEach(() => {
  process.env.COMPANY_VAT_NUMBER = "123456789";
  process.env.COMPANY_BRANCH = "0";
});

describe("the invoice summary the schema demands", () => {
  it("emits all eight mandatory elements", async () => {
    const { buildInvoiceXml } = await import("@/lib/aadeXml");
    const xml = buildInvoiceXml(reservation() as never, "A", 1);
    for (const field of SUMMARY_ORDER) {
      expect(xml, `${field} is missing — AADE rejects the whole document`)
        .toMatch(new RegExp(`<${field}>`));
    }
  });

  it("emits them in the schema's order", async () => {
    // xs:sequence is positional. Right fields, wrong order is still rejected,
    // and is the kind of thing a presence-only check waves through.
    const { buildInvoiceXml } = await import("@/lib/aadeXml");
    const xml = buildInvoiceXml(reservation() as never, "A", 1);
    const summary = xml.slice(xml.indexOf("<invoiceSummary>"), xml.indexOf("</invoiceSummary>"));
    const seen = [...summary.matchAll(/<(total[A-Za-z]+)>/g)].map((m) => m[1]);
    expect(seen).toEqual([...SUMMARY_ORDER]);
  });

  it("sends zero rather than omitting what does not apply", async () => {
    // A rental has no withholding, fees, stamp duty, other taxes or deductions.
    // "None" is 0.00 in a mandatory field, not an absent element.
    const { buildInvoiceXml } = await import("@/lib/aadeXml");
    const xml = buildInvoiceXml(reservation() as never, "A", 1);
    for (const f of ["totalWithheldAmount", "totalFeesAmount", "totalStampDutyAmount",
                     "totalOtherTaxesAmount", "totalDeductionsAmount"]) {
      expect(xml).toContain(`<${f}>0.00</${f}>`);
    }
  });
});

describe("the document type", () => {
  it("issues ΑΠΥ (11.2) to a private customer", async () => {
    const { buildInvoiceXml } = await import("@/lib/aadeXml");
    const xml = buildInvoiceXml(reservation() as never, "A", 1);
    expect(xml).toContain("<invoiceType>11.2</invoiceType>");
  });

  it("issues ΤΠΥ (2.1) to a business, with a counterpart", async () => {
    const { buildInvoiceXml } = await import("@/lib/aadeXml");
    const xml = buildInvoiceXml(
      reservation({ customers: { first_name: "A", last_name: "B", country: "Germany", vat_number: "DE123" } }) as never,
      "A", 1
    );
    expect(xml).toContain("<invoiceType>2.1</invoiceType>");
    expect(xml).toContain("<vatNumber>DE123</vatNumber>");
    expect(xml, "the counterpart country must be a code, not a name").toContain("<country>DE</country>");
  });
});

describe("arithmetic that ends up on a tax return", () => {
  it("splits gross into net and VAT at 24%", async () => {
    const { buildInvoiceXml } = await import("@/lib/aadeXml");
    const xml = buildInvoiceXml(reservation({ total: 372, discount_amount: 0 }) as never, "A", 1);
    // 372 / 1.24 = 300.00 net, 72.00 VAT.
    expect(xml).toContain("<totalNetValue>300.00</totalNetValue>");
    expect(xml).toContain("<totalVatAmount>72.00</totalVatAmount>");
    expect(xml).toContain("<totalGrossValue>372.00</totalGrossValue>");
  });

  it("net and VAT add back to gross exactly", async () => {
    // Rounding each half independently can leave them a cent apart from the
    // total, which is the sort of thing an auditor notices and nobody else does.
    const { buildInvoiceXml } = await import("@/lib/aadeXml");
    for (const total of [372, 100, 99.99, 55.55, 0.03, 1234.56]) {
      const xml = buildInvoiceXml(reservation({ total, discount_amount: 0 }) as never, "A", 1);
      const num = (tag: string) => Number(xml.match(new RegExp(`<${tag}>([\\d.]+)</${tag}>`))![1]);
      expect(
        num("totalNetValue") + num("totalVatAmount"),
        `net + VAT != gross for ${total}`
      ).toBeCloseTo(num("totalGrossValue"), 2);
    }
  });

  it("takes the discount off before splitting", async () => {
    const { buildInvoiceXml } = await import("@/lib/aadeXml");
    const xml = buildInvoiceXml(reservation({ total: 472, discount_amount: 100 }) as never, "A", 1);
    expect(xml).toContain("<totalGrossValue>372.00</totalGrossValue>");
  });
});

describe("refusing rather than filing something false", () => {
  it("refuses a business customer whose country cannot be resolved", async () => {
    const { buildInvoiceXml } = await import("@/lib/aadeXml");
    expect(() =>
      buildInvoiceXml(
        reservation({ customers: { first_name: "A", last_name: "B", country: "Narnia", vat_number: "X1" } }) as never,
        "A", 1
      )
    ).toThrow(/country/i);
  });

  it("refuses a client-list entry with an unresolvable country", async () => {
    // "British" is a demonym. The old code filed it, and fell back to "GR".
    const { buildDclXml } = await import("@/lib/aadeXml");
    expect(() =>
      buildDclXml(reservation({ customers: { first_name: "J", last_name: "S", country: "British" } }) as never)
    ).toThrow(/country/i);
  });

  it("files a resolvable country as its code", async () => {
    const { buildDclXml } = await import("@/lib/aadeXml");
    const xml = buildDclXml(reservation() as never);
    expect(xml).toContain("<counterpartCountry>GB</counterpartCountry>");
    expect(xml, "the display name reached the filing").not.toContain("United Kingdom");
  });
});

describe("XML escaping", () => {
  it("escapes a name that would otherwise break the document", async () => {
    const { buildDclXml } = await import("@/lib/aadeXml");
    const xml = buildDclXml(
      reservation({ customers: { first_name: "Ben & Co", last_name: "<script>", country: "Greece" } }) as never
    );
    expect(xml).toContain("Ben &amp; Co");
    expect(xml).toContain("&lt;script&gt;");
    expect(xml).not.toContain("<script>");
  });
});
