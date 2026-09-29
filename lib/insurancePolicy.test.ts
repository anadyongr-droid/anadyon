import { describe, expect, it } from "vitest";
import {
  normalisePlate,
  parsePolicyDocument,
  readPolicyDocuments,
  toIsoDate,
} from "./insurancePolicy";

/**
 * Fixtures are cut from the real documents read out of the broker's mailbox on
 * 28 September 2026, keeping the exact spacing each insurer emits — including
 * the parts that look like typos and are not, such as ERGO's missing space
 * after the colon and Euroins' value column landing on its own line.
 */
const INTERSALONICA = `ΠΟΛΥΑΣΦΑΛΙΣΤΗΡΙΟ ΣΥΜΒΟΛΑΙΟ ΑΥΤΟΚΙΝΗΤΟΥ
ΑΡΙΘΜΟΣ ΠΟΛΥΑΣΦΑΛΙΣΤΗΡΙΟΥ: 217565447
ΑΡ. ΚΥΚΛΟΦ.: ΙΜΙ 2840  ΕΡΓ. ΚΑΤΑΣΚ.: HYUNDAI
ΛΗΠΤΗΣ ΑΣΦΑΛΙΣΗΣ: ΑΝΑΔΥΩΝ Ι.Κ.Ε
 ΔΙΑΡΚΕΙΑ ΑΣΦΑΛΙΣΗΣ ΑΠΟ: 16/09/2026 13:46 ΜΕΧΡΙ: 16/10/2026 23:59`;

const ERGO = `ERGO Ασφαλιστική Μονοπρόσωπη Α.Ε.
Αριθμός Ασφαλιστηρίου: 2088554551/0001 Αριθμός Απόδειξης: 2608070396
Διάρκεια Ασφάλισης Από: 10:22 της 10/08/2026 Έως: 23:59 της 10/09/2026
Αρ. Κυκλοφορίας:ΙΜΙ2840 Έτος Κατασκευής:2009
Κατασκευαστής: HYUNDAI Μοντέλο: I10 1.2I 16V`;

const TRIGLAV = `ΠΟΛΥΑΣΦΑΛΙΣΤΗΡΙΟ ΣΥΜΒΟΛΑΙΟ ΟΧΗΜΑΤΟΣ & ΑΠΟΔΕΙΞΗ ΕΙΣΠΡΑΞΗΣ ΑΣΦΑΛΙΣΤΡΩΝ
Zavarovalnica Triglav ΑΕ, D.D.- Ελληνικό Υποκατάστημα
ΣΥΜΒΑΛΛΟΜΕΝΟΣ: ΑΝΑΔΥΩΝ ΙΚΕ [800569811] ΑΣΦΑΛΙΣΗ ΕΩΣ: 09/08/2026 23:59
ΑΣΦΑΛΙΣΗ ΑΠΟ: 09/05/2026 11:07
ΕΡΓΟΣΤΑΣΙΟ/ΤΥΠΟΣ: HYUNDAI i20
ΑΡ.ΚΥΚΛΟΦΟΡΙΑΣ: ZAZ9892
Αρ.Πολυασφαλιστηρίου: 5605069`;

const EUROINS = `ΑΣΦΑΛΙΣΤΙΚΗ ΕΤΑΙΡΕΙΑ EUROINS Α.Ε.
ΑΣΦΑΛΙΣΤΗΡΙΟ ΣΥΜΒΟΛΑΙΟ ΑΥΤΟΚΙΝΗΤΟΥ
Αρ.Ασφαλ. 9190600829 Αρ.Αίτησης 04/07/26Έκδοση: Ημ.Έναρξης 04/07/26 Ημ.Λήξης 04/10/26 -5190685360 13:36 23:59
Ασφαλιζόμενος
ΑΝΑΔΥΩΝ Ι.Κ.Ε Ονοματ/νυμο:
Ε.Ι.Χ. ΕΝ. PROMO
ΙΟΖ4176
HYUNDAI 2010`;

describe("each insurer's own layout", () => {
  it("reads Intersalonica, whose plate carries a space", () => {
    expect(parsePolicyDocument(INTERSALONICA)).toEqual({
      insurer: "Intersalonica",
      plate: "ΙΜΙ2840",
      policyNumber: "217565447",
      coverFrom: "2026-09-16",
      coverTo: "2026-10-16",
    });
  });

  it("reads ERGO, whose colon is followed by no space and whose dates are inverted", () => {
    // "Από: 10:22 της 10/08/2026" puts the time before the date, so a pattern
    // that takes the first number after the label captures the hour.
    expect(parsePolicyDocument(ERGO)).toEqual({
      insurer: "ERGO",
      plate: "ΙΜΙ2840",
      policyNumber: "2088554551/0001",
      coverFrom: "2026-08-10",
      coverTo: "2026-09-10",
    });
  });

  it("reads Triglav, whose plate is in Latin script", () => {
    const p = parsePolicyDocument(TRIGLAV);
    expect(p?.insurer).toBe("Triglav/Apeiron");
    expect(p?.policyNumber).toBe("5605069");
    expect(p?.coverFrom).toBe("2026-05-09");
    expect(p?.coverTo).toBe("2026-08-09");
    // The whole point: ZAZ9892 and ΖΑΖ9892 are one vehicle, not two.
    expect(p?.plate).toBe("ΖΑΖ9892");
  });

  it("reads Euroins, whose value column lands on its own line", () => {
    expect(parsePolicyDocument(EUROINS)).toEqual({
      insurer: "Euroins",
      plate: "ΙΟΖ4176",
      policyNumber: "9190600829",
      coverFrom: "2026-07-04",
      coverTo: "2026-10-04",
    });
  });

  it("agrees with the certificate §1 already records for the car", () => {
    // Two independent routes to the same values is what §8 asks for: this is
    // the policy number and expiry the hand-supplied certificate carries.
    const p = parsePolicyDocument(EUROINS);
    expect(p?.policyNumber).toBe("9190600829");
    expect(p?.coverTo).toBe("2026-10-04");
  });
});

describe("plates fold onto one alphabet", () => {
  it.each([
    ["ZAZ9892", "ΖΑΖ9892"],
    ["ΙΜΙ 2840", "ΙΜΙ2840"],
    ["ipm6966", "ΙΡΜ6966"],
  ])("%s -> %s", (raw, expected) => {
    expect(normalisePlate(raw)).toBe(expected);
  });

  it("maps Latin P onto Greek Ρ, which is the one that is not self-evident", () => {
    // A, B, E... look the same; P and Ρ are different letters that render alike.
    expect(normalisePlate("IPM6966")).toBe("ΙΡΜ6966");
    expect(normalisePlate("IPM6966")).not.toContain("P");
  });
});

describe("dates are converted, never guessed", () => {
  it("expands the two-digit year Euroins alone writes", () => {
    expect(toIsoDate("04/10/26")).toBe("2026-10-04");
  });

  it("reads day-first, not month-first", () => {
    // 04/10 is 4 October. Read as US order it becomes 10 April - six months
    // early, and a stop-sell that fires half a year too soon or too late.
    expect(toIsoDate("04/10/2026")).toBe("2026-10-04");
  });

  it.each(["31/04/2026", "30/02/2026", "00/01/2026", "01/13/2026"])(
    "refuses the impossible date %s instead of rolling it over",
    value => expect(toIsoDate(value)).toBeNull()
  );

  it.each(["", "  ", "2026-10-04", "4/10/2026", "not a date", null, undefined])(
    "returns null for %s",
    value => expect(toIsoDate(value as string)).toBeNull()
  );
});

describe("a partial read is refused, not stored", () => {
  it("returns null when the end date is missing", () => {
    // The end date is what the stop-sell runs on. Without it the record is
    // useless rather than merely incomplete.
    const noEnd = INTERSALONICA.replace(/ΜΕΧΡΙ\s*:\s*[\d/]+/, "ΜΕΧΡΙ: ");
    expect(parsePolicyDocument(noEnd)).toBeNull();
  });

  it("returns null when the plate is missing", () => {
    expect(parsePolicyDocument(ERGO.replace("Αρ. Κυκλοφορίας:ΙΜΙ2840", ""))).toBeNull();
  });

  it("returns null when the policy number is missing", () => {
    expect(parsePolicyDocument(TRIGLAV.replace(/Αρ\.Πολυασφαλιστηρίου: \d+/, ""))).toBeNull();
  });

  it("keeps a policy whose start date alone is absent", () => {
    // Some documents state only the end. That is still enough to bar a vehicle,
    // so it is kept with coverFrom null rather than thrown away.
    const endOnly = TRIGLAV.replace(/ΑΣΦΑΛΙΣΗ ΑΠΟ: [\d/]+ [\d:]+/, "");
    const p = parsePolicyDocument(endOnly);
    expect(p?.coverTo).toBe("2026-08-09");
    expect(p?.coverFrom).toBeNull();
  });

  it("returns null for an unrecognised insurer rather than guessing", () => {
    expect(parsePolicyDocument("ΑΡ. ΚΥΚΛΟΦ.: ΙΜΙ 2840 from nobody in particular")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(parsePolicyDocument("")).toBeNull();
    expect(parsePolicyDocument("   ")).toBeNull();
  });
});

describe("a batch keeps its failures", () => {
  it("separates what parsed from what did not, with a reason for each", () => {
    const result = readPolicyDocuments([
      { source: "ANADYON.pdf", text: INTERSALONICA },
      { source: "ΙΜΙ2840.pdf", text: ERGO },
      { source: "1.PDF", text: "" },
      { source: "mystery.pdf", text: "a letter from somebody else entirely" },
    ]);

    expect(result.parsed.map(p => p.policyNumber)).toEqual(["217565447", "2088554551/0001"]);
    expect(result.unreadable).toEqual([
      { source: "1.PDF", reason: "no text layer" },
      { source: "mystery.pdf", reason: "insurer not recognised" },
    ]);
  });

  it("names a known insurer whose fields did not parse, which is the case worth chasing", () => {
    // "Euroins changed its template" and "this is not a policy at all" need
    // different responses, so they are not reported the same way.
    const result = readPolicyDocuments([
      { source: "changed.pdf", text: "ΑΣΦΑΛΙΣΤΙΚΗ ΕΤΑΙΡΕΙΑ EUROINS Α.Ε.\nnothing else recognisable" },
    ]);
    expect(result.parsed).toEqual([]);
    expect(result.unreadable[0].reason).toBe("known insurer, fields did not parse");
  });
});
