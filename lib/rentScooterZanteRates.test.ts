import { describe, expect, it, vi } from "vitest";

// The module builds a Supabase client at load; these tests exercise the pure
// parsing and mapping only.
vi.mock("@/lib/supabase", () => ({ supabase: {}, supabaseAdmin: {} }));

const {
  parseScooterTariff,
  parseBandHeader,
  pickBandDays,
  parsePrice,
  engineCc,
  engineClass,
  seasonPickupDate,
  SEASON_MONTHS,
} = await import("./rentScooterZanteRates");

/**
 * Verbatim markup from https://www.rentscootercarzante.com/tariffe-scooter/,
 * fetched 1 October 2026 — not a reconstruction. The whole point of W22 taking
 * three attempts is that a parser written against imagined markup passes its own
 * tests and fails on the real page.
 *
 * Both copies of the table are included, because the page ships each one twice:
 * season-major for wide screens and transposed for narrow ones.
 */
const REAL_BLOCK = `
<div class="elementor-widget-container">
<h6 class="elementor-heading-title elementor-size-default">Aprilia Sr Motard 50 cc </h6>
</div>
<div class="elementor-element elementor-widget-Table" data-widget_type="Table.default">
<div class="elementor-widget-container">
<table class="tafe-table">
<thead class="tafe-table-header">
<tr>
<th class="elementor-inline-editing elementor-repeater-item-6f85f34" >STAGIONE</th><th class="elementor-inline-editing elementor-repeater-item-45c5c58" >1-3 giorni</th><th class="elementor-inline-editing elementor-repeater-item-5cd755c" >4-6 giorni</th><th class="elementor-inline-editing elementor-repeater-item-60caee5" >7 Giorni + </th>
</tr>
</thead>
<tbody class="tafe-table-body">
<tr>
<td class="elementor-repeater-item-315cfaa" >BASSA</td><td class="elementor-repeater-item-6472b71" >&euro; 17/giorno</td><td class="elementor-repeater-item-f4f0135" >&euro; 16/giorno</td><td class="elementor-repeater-item-111f425" >&euro; 15/giorno</td></tr><tr><td class="elementor-repeater-item-728ef65" >ALTA</td><td class="elementor-repeater-item-0b788e9" >&euro; 21/giorno</td><td class="elementor-repeater-item-ae73efa" >&euro; 20/giorno</td><td class="elementor-repeater-item-eee5b8c" >&euro; 19/giorno</td>
</tr>
</tbody>
</table>
</div>
</div>
<div class="elementor-widget-container">
<h6 class="elementor-heading-title elementor-size-default">Aprilia Sr Motard 50 cc </h6>
</div>
<div class="elementor-widget-container">
<table class="tafe-table">
<thead class="tafe-table-header"><tr>
<th class="elementor-inline-editing" >STAGIONE</th><th class="elementor-inline-editing" >bassa</th><th class="elementor-inline-editing" >alta</th>
</tr></thead>
<tbody class="tafe-table-body">
<tr><td>1-3 Giorni</td><td>&euro; 17/giorno</td><td>&euro; 21/giorno</td></tr>
<tr><td>4-6 Giorni</td><td>&euro; 16/giorno</td><td>&euro; 20/giorno</td></tr>
<tr><td>7 Giorni +</td><td>&euro; 15/giorno</td><td>&euro; 19/giorno</td></tr>
</tbody>
</table>
</div>
<div class="elementor-widget-container">
<h6 class="elementor-heading-title elementor-size-default">Piaggio liberty s 125 cc , Aprilia sportcity 125 cc, Derbi variant 125 cc</h6>
</div>
<div class="elementor-widget-container">
<table class="tafe-table">
<thead class="tafe-table-header"><tr>
<th >STAGIONE</th><th >1-3 giorni</th><th >4-6 giorni</th><th >7 Giorni + </th>
</tr></thead>
<tbody class="tafe-table-body">
<tr><td >BASSA</td><td >&euro; 25/giorno</td><td >&euro; 23/giorno</td><td >&euro; 20/giorno</td></tr>
<tr><td >ALTA</td><td >&euro; 31/giorno</td><td >&euro; 30/giorno</td><td >&euro; 29/giorno</td></tr>
</tbody>
</table>
</div>
`;

describe("the real tariff page parses to the prices it publishes", () => {
  const entries = parseScooterTariff(REAL_BLOCK);

  it("reads the 50cc low season across all three bands", () => {
    const bassa = entries
      .filter(e => e.model.startsWith("Aprilia Sr Motard") && e.season === "bassa")
      .sort((a, b) => a.days - b.days);
    expect(bassa.map(e => [e.days, e.pricePerDay])).toEqual([
      [2, 17],
      [5, 16],
      [10, 15],
    ]);
  });

  it("reads the 50cc high season", () => {
    const alta = entries
      .filter(e => e.model.startsWith("Aprilia Sr Motard") && e.season === "alta")
      .sort((a, b) => a.days - b.days);
    expect(alta.map(e => e.pricePerDay)).toEqual([21, 20, 19]);
  });

  it("reads the grouped 125cc models", () => {
    const g = entries.filter(e => e.model.includes("Piaggio liberty"));
    expect(g).toHaveLength(6);
    expect(g.find(e => e.season === "bassa" && e.days === 10)?.pricePerDay).toBe(20);
    expect(g.find(e => e.season === "alta" && e.days === 2)?.pricePerDay).toBe(31);
    // Grouped models share a class as well as a price.
    expect(new Set(g.map(e => e.cc))).toEqual(new Set([125]));
  });

  it("does not double-count the transposed copy of each table", () => {
    // Every table is on the page twice, once per screen width, with no class to
    // tell them apart. Counting both would double every price into the average.
    const fiftyCc = entries.filter(e => e.model.startsWith("Aprilia Sr Motard"));
    expect(fiftyCc).toHaveLength(6); // 2 seasons × 3 bands, once
  });

  it("finds every model on the page and no others", () => {
    expect(new Set(entries.map(e => e.cc))).toEqual(new Set([50, 125]));
  });
});

describe("their bands and our sampled durations", () => {
  it("maps each published band to the one duration inside it", () => {
    expect(pickBandDays({ min: 1, max: 3 })).toBe(2);
    expect(pickBandDays({ min: 4, max: 6 })).toBe(5);
    expect(pickBandDays({ min: 7, max: null })).toBe(10);
  });

  it("refuses a band that holds no sampled duration", () => {
    // Skipping and saying so beats storing a price against a duration it was
    // never quoted for.
    expect(pickBandDays({ min: 3, max: 4 })).toBeNull();
    expect(pickBandDays({ min: 11, max: 20 })).toBeNull();
  });

  it("refuses a band that holds more than one, because the choice would be arbitrary", () => {
    expect(pickBandDays({ min: 1, max: 6 })).toBeNull();
    expect(pickBandDays({ min: 1, max: null })).toBeNull();
  });

  it("reads the band headers they actually use", () => {
    expect(parseBandHeader("1-3 giorni")).toEqual({ min: 1, max: 3 });
    expect(parseBandHeader("4-6 Giorni")).toEqual({ min: 4, max: 6 });
    expect(parseBandHeader("7 Giorni + ")).toEqual({ min: 7, max: null });
    expect(parseBandHeader("1–3 giorni")).toEqual({ min: 1, max: 3 }); // en dash
  });

  it("reads the season column header as not a band", () => {
    // This is what separates the two copies of each table.
    expect(parseBandHeader("STAGIONE")).toBeNull();
    expect(parseBandHeader("bassa")).toBeNull();
    expect(parseBandHeader("alta")).toBeNull();
  });
});

describe("prices and engine classes", () => {
  it("reads the price format they publish", () => {
    expect(parsePrice("€ 17/giorno")).toBe(17);
    expect(parsePrice("€16.00 / Giorno")).toBe(16);
    expect(parsePrice("17,50 €")).toBe(17.5);
  });

  it("rejects a cell with no usable number", () => {
    expect(parsePrice("su richiesta")).toBeNull();
    expect(parsePrice("€ 0/giorno")).toBeNull();
  });

  it("takes the smallest size in a grouped name, as the one true of every model", () => {
    expect(engineCc("Aprilia Sr Motard 50 cc")).toBe(50);
    expect(engineCc("Piaggio liberty s 125 cc , Aprilia sportcity 125 cc")).toBe(125);
    expect(engineCc("Liberty 150cc")).toBe(150);
    expect(engineCc("Sym symphony 200cc")).toBe(200);
    expect(engineCc("Some Scooter")).toBeNull();
  });

  it("names the group the mapping table will map", () => {
    expect(engineClass(50)).toBe("50 cc");
    expect(engineClass(null)).toBe("unknown");
  });
});

describe("the months they price, and the dates stored against them", () => {
  it("covers only the months they publish", () => {
    // October is absent from their tariff, so it must be absent here: an
    // invented shoulder-season figure would be worse than a gap.
    const all = [...SEASON_MONTHS.bassa, ...SEASON_MONTHS.alta].sort((a, b) => a - b);
    expect(all).toEqual([5, 6, 7, 8, 9]);
    expect(all).not.toContain(10);
  });

  it("dates a month that is still to come in this year", () => {
    expect(seasonPickupDate(9, new Date("2026-07-02T00:00:00Z"))).toBe("2026-09-15");
  });

  it("rolls a month that has passed into next year", () => {
    // A published tariff has no date of its own, so the row must not claim to
    // describe a month that has already been and gone.
    expect(seasonPickupDate(5, new Date("2026-10-01T00:00:00Z"))).toBe("2027-05-15");
  });

  it("treats the current month as still to come", () => {
    expect(seasonPickupDate(8, new Date("2026-08-20T00:00:00Z"))).toBe("2026-08-15");
  });
});

describe("the page changing shape is reported, not guessed around", () => {
  it("returns nothing when there is no table", () => {
    expect(parseScooterTariff("<h6 class='elementor-heading-title'>Scooter</h6>")).toEqual([]);
  });

  it("returns nothing for a table whose headers are not bands", () => {
    const transposedOnly = `
      <h6 class="elementor-heading-title">Aprilia Sr Motard 50 cc</h6>
      <table><thead><tr><th>STAGIONE</th><th>bassa</th><th>alta</th></tr></thead>
      <tbody><tr><td>1-3 Giorni</td><td>€ 17/giorno</td><td>€ 21/giorno</td></tr></tbody></table>`;
    expect(parseScooterTariff(transposedOnly)).toEqual([]);
  });

  it("skips a season row it does not recognise rather than storing it", () => {
    const odd = `
      <h6 class="elementor-heading-title">Aprilia Sr Motard 50 cc</h6>
      <table><thead><tr><th>STAGIONE</th><th>1-3 giorni</th></tr></thead>
      <tbody><tr><td>MEDIA</td><td>€ 18/giorno</td></tr>
             <tr><td>BASSA</td><td>€ 17/giorno</td></tr></tbody></table>`;
    const out = parseScooterTariff(odd);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ season: "bassa", days: 2, pricePerDay: 17 });
  });
});
