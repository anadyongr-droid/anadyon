/**
 * Reads the fields that matter out of a motor insurance policy document.
 *
 * The fleet's policies arrive as PDF attachments from the broker K.EXPRESS, and
 * four insurers are in use — Intersalonica, ERGO, Triglav (administered by
 * Apeiron) and Euroins. **Each writes a different document, and no two label the
 * same field the same way**, so this is four parsers behind one entry point
 * rather than one parser with a loose pattern. A loose pattern is the dangerous
 * shape here: a wrong expiry date entered against a vehicle is worse than no
 * date at all, because `lib/fleetStatus.ts` scores a missing date `unknown` and
 * warns, while a wrong one scores `valid` and actively suppresses the
 * stop-sell check.
 *
 * This module takes **text** and returns fields. Turning a PDF into text is a
 * separate concern and a separate dependency; keeping it out means every layout
 * rule here is testable against a fixture with no binary in the repository.
 *
 * `docs/INSURANCE-COVER-AND-RESTRICTIONS.md` §1a records what reading them
 * found, including the two insurers the project did not know it had.
 */

export type Insurer = "Intersalonica" | "ERGO" | "Triglav/Apeiron" | "Euroins";

export interface ParsedPolicy {
  insurer: Insurer;
  /** Registration, normalised to Greek letters and without spaces. */
  plate: string;
  policyNumber: string;
  /** ISO `YYYY-MM-DD`, or null when the document states only one end. */
  coverFrom: string | null;
  coverTo: string;
}

/**
 * Greek plates use only the fourteen letters that look identical in both
 * alphabets — that is the point of the scheme, so a plate reads the same to a
 * Greek officer and a foreign one. Triglav's documents write them in Latin
 * (`ZAZ9892`); the other three use Greek (`ΖΑΖ9892`). They are the same vehicle
 * and must not become two rows, so Latin is folded onto Greek. The mapping is
 * unambiguous **because** the alphabet is restricted this way; it would not be
 * safe for arbitrary text.
 */
const LATIN_TO_GREEK: Record<string, string> = {
  A: "Α", B: "Β", E: "Ε", Z: "Ζ", H: "Η", I: "Ι", K: "Κ",
  M: "Μ", N: "Ν", O: "Ο", P: "Ρ", T: "Τ", Y: "Υ", X: "Χ",
};

/** Both alphabets' plate letters, for use inside the layout patterns. */
const PLATE_LETTERS = "ΑΒΕΖΗΙΚΜΝΟΡΤΥΧABEZHIKMNOPTYX";
const PLATE = `([${PLATE_LETTERS}]{2,3}\\s?\\d{3,4})`;

export function normalisePlate(raw: string): string {
  return raw
    .replace(/\s+/g, "")
    .toUpperCase()
    .split("")
    .map(c => LATIN_TO_GREEK[c] ?? c)
    .join("");
}

/**
 * `dd/mm/yyyy` or `dd/mm/yy` to ISO.
 *
 * Euroins alone writes a two-digit year. These are motor policies running weeks
 * to months, never decades, so a two-digit year is the current century; `26`
 * becomes 2026 rather than 1926. Returns null rather than a guess when the
 * shape is anything else, because a malformed date silently coerced is exactly
 * how a wrong expiry reaches a vehicle record.
 */
export function toIsoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/.exec(value.trim());
  if (!m) return null;
  const [, dd, mm, yy] = m;
  const year = yy.length === 2 ? 2000 + Number(yy) : Number(yy);
  const month = Number(mm);
  const day = Number(dd);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // Rejects 31 April and 30 February rather than letting Date roll them over.
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function identifyInsurer(text: string): Insurer | null {
  if (text.includes("ERGO")) return "ERGO";
  if (/Triglav/i.test(text) || text.includes("Apeiron") || text.includes("apeiron")) {
    return "Triglav/Apeiron";
  }
  if (/EUROINS/i.test(text)) return "Euroins";
  if (text.includes("ΠΟΛΥΑΣΦΑΛΙΣΤΗΡΙΟ") || text.includes("ΙΝΤΕΡΣΑΛΟΝΙΚΑ")) {
    return "Intersalonica";
  }
  return null;
}

/** One layout's attempt: the raw strings it found, before validation. */
interface RawFields {
  plate?: string;
  policyNumber?: string;
  from?: string;
  to?: string;
}

const LAYOUTS: Record<Insurer, (t: string) => RawFields> = {
  Intersalonica: t => ({
    plate: /ΑΡ\.\s*ΚΥΚΛΟΦ\.\s*:\s*/.test(t)
      ? new RegExp(`ΑΡ\\.\\s*ΚΥΚΛΟΦ\\.\\s*:\\s*${PLATE}`).exec(t)?.[1]
      : undefined,
    policyNumber: /ΑΡΙΘΜΟΣ ΠΟΛΥΑΣΦΑΛΙΣΤΗΡΙΟΥ\s*:\s*(\d+)/.exec(t)?.[1],
    from: /ΔΙΑΡΚΕΙΑ ΑΣΦΑΛΙΣΗΣ ΑΠΟ\s*:\s*([\d/]+)/.exec(t)?.[1],
    to: /ΜΕΧΡΙ\s*:\s*([\d/]+)/.exec(t)?.[1],
  }),

  // Note the colon may be followed by no space at all: "Αρ. Κυκλοφορίας:ΙΜΙ2840".
  ERGO: t => ({
    plate: new RegExp(`Αρ\\.\\s*Κυκλοφορίας\\s*:\\s*${PLATE}`).exec(t)?.[1],
    policyNumber: /Αριθμός Ασφαλιστηρίου\s*:\s*([\d/]+)/.exec(t)?.[1],
    from: /Διάρκεια Ασφάλισης Από\s*:\s*[\d:]*\s*της\s*([\d/]+)/.exec(t)?.[1],
    to: /Έως\s*:\s*[\d:]*\s*της\s*([\d/]+)/.exec(t)?.[1],
  }),

  "Triglav/Apeiron": t => ({
    plate: new RegExp(`ΑΡ\\.\\s*ΚΥΚΛΟΦΟΡΙΑΣ\\s*:\\s*${PLATE}`).exec(t)?.[1],
    policyNumber: /Αρ\.\s*Πολυασφαλιστηρίου\s*:\s*([\w/-]+)/.exec(t)?.[1],
    from: /ΑΣΦΑΛΙΣΗ ΑΠΟ\s*:\s*([\d/]+)/.exec(t)?.[1],
    to: /ΑΣΦΑΛΙΣΗ ΕΩΣ\s*:\s*([\d/]+)/.exec(t)?.[1],
  }),

  // Three columns, so the text layer emits every label in one run and every
  // value in another: "Αριθμ.Κυκλοφορίας:" never sits beside its own plate.
  // The plate is anchored on the use-class line that precedes it instead.
  Euroins: t => ({
    plate: new RegExp(`Ε\\.Ι\\.Χ\\.[^\\n]*\\n\\s*${PLATE}`).exec(t)?.[1],
    policyNumber: /Αρ\.Ασφαλ\.\s*(\d+)/.exec(t)?.[1],
    from: /Ημ\.Έναρξης\s*([\d/]+)/.exec(t)?.[1],
    to: /Ημ\.Λήξης\s*([\d/]+)/.exec(t)?.[1],
  }),
};

/**
 * Parses one policy document, or returns null.
 *
 * **Null is the right answer far more often than a partial record.** A caller
 * is going to propose this against a vehicle, so the bar is a plate, a policy
 * number and an end date that all parsed cleanly. Anything less is reported as
 * unreadable and handed to a person, rather than written as a half-fact.
 */
export function parsePolicyDocument(text: string): ParsedPolicy | null {
  if (!text?.trim()) return null;

  const insurer = identifyInsurer(text);
  if (!insurer) return null;

  const raw = LAYOUTS[insurer](text);
  const coverTo = toIsoDate(raw.to);

  // An end date is the field the stop-sell actually runs on, so its absence
  // makes the whole record useless rather than merely incomplete.
  if (!raw.plate || !raw.policyNumber || !coverTo) return null;

  return {
    insurer,
    plate: normalisePlate(raw.plate),
    policyNumber: raw.policyNumber.trim(),
    coverFrom: toIsoDate(raw.from),
    coverTo,
  };
}

export interface PolicyReadResult {
  parsed: ParsedPolicy[];
  /** Documents that could not be read, with the reason, for a person to open. */
  unreadable: { source: string; reason: string }[];
}

/**
 * Reads a batch, keeping the failures rather than dropping them.
 *
 * A silent skip is how a vehicle ends up with no policy on file and nobody
 * knowing one was missed — the same failure mode as open item F1, arrived at by
 * a different route.
 */
export function readPolicyDocuments(
  documents: { source: string; text: string }[]
): PolicyReadResult {
  const parsed: ParsedPolicy[] = [];
  const unreadable: { source: string; reason: string }[] = [];

  for (const doc of documents) {
    if (!doc.text?.trim()) {
      // A scanned receipt with no text layer lands here; OCR, not parsing.
      unreadable.push({ source: doc.source, reason: "no text layer" });
      continue;
    }
    const policy = parsePolicyDocument(doc.text);
    if (policy) parsed.push(policy);
    else {
      unreadable.push({
        source: doc.source,
        reason: identifyInsurer(doc.text)
          ? "known insurer, fields did not parse"
          : "insurer not recognised",
      });
    }
  }

  return { parsed, unreadable };
}
