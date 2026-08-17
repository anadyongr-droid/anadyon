/**
 * Rules for assigning a vehicle that differs from the one quoted.
 *
 * Substitution is normal in car rental — a booking reserves a category, not a
 * registration plate, which is what "or similar" means on every listing. What
 * matters is which direction the substitution goes.
 *
 * Three rules, matching both the operator's policy and standard practice:
 *
 *   1. Transmission may never be crossed. It is encoded in the ACRISS category
 *      itself for this reason. A customer who booked an automatic may be unable
 *      to drive a manual at all; one who booked a manual is usually paying less
 *      precisely to avoid the automatic premium.
 *
 *   2. An upgrade is free. A higher category at the quoted price is the
 *      operator's cost to absorb, and needs no permission.
 *
 *   3. A downgrade needs consent and a lower price. Handing over a smaller
 *      vehicle at the original rate is charging for something not supplied.
 *
 * Cross-category substitution — a scooter for a car — is not substitution at
 * all and is refused outright.
 */

/**
 * Rank within a family. Higher number is the higher category, so a comparison
 * of two ranks says whether an assignment moves up or down.
 *
 * car_c sits above car_b because the automatic carries a premium over the
 * equivalent manual — roughly 21% against local competitors — not because it is
 * a physically larger car. Rule 1 means it is rarely reachable from a manual
 * booking anyway.
 */
const RANK: Record<string, { family: string; rank: number }> = {
  car_a:       { family: "car",       rank: 1 },
  car_b:       { family: "car",       rank: 2 },
  car_c:       { family: "car",       rank: 3 },
  motorbike_a: { family: "motorbike", rank: 1 },
  motorbike_b: { family: "motorbike", rank: 2 },
  bike:        { family: "bike",      rank: 1 },
};

const FAMILY_LABEL: Record<string, string> = {
  car: "car",
  motorbike: "motorbike",
  bike: "bicycle",
};

export type Verdict = "ok" | "upgrade" | "downgrade" | "blocked";

export interface SubstitutionCheck {
  verdict: Verdict;
  /** Shown to staff. Empty when the assignment matches what was quoted. */
  message: string;
}

export interface Quoted {
  pricing_group?: string | null;
  /** "Manual", "Automatic", or "Any" when the customer expressed no preference. */
  transmission?: string | null;
  model?: string | null;
}

export interface Assigned {
  pricing_group?: string | null;
  transmission?: string | null;
  name?: string | null;
}

/**
 * Compares the vehicle being assigned against what the customer was quoted.
 *
 * Returns "ok" when nothing meaningful differs — including when the quote
 * expressed no transmission preference, since there is then nothing to breach.
 */
export function checkSubstitution(quoted: Quoted, assigned: Assigned): SubstitutionCheck {
  const from = quoted.pricing_group ? RANK[quoted.pricing_group] : undefined;
  const to = assigned.pricing_group ? RANK[assigned.pricing_group] : undefined;

  // Nothing to compare against — a walk-in booked directly, not from a quote.
  if (!from || !to) return { verdict: "ok", message: "" };

  if (from.family !== to.family) {
    return {
      verdict: "blocked",
      message: `The quote was for a ${FAMILY_LABEL[from.family]}, but this is a ${FAMILY_LABEL[to.family]}. That is not a substitution — raise a new quote instead.`,
    };
  }

  // Rule 1, checked before category: transmission outranks size. "Any" means
  // the customer stated no preference, so there is no expectation to breach.
  const wanted = (quoted.transmission ?? "").trim();
  const giving = (assigned.transmission ?? "").trim();
  const expressed = wanted && !/^any$/i.test(wanted);

  if (expressed && giving && wanted.toLowerCase() !== giving.toLowerCase()) {
    return {
      verdict: "blocked",
      message: wanted.toLowerCase() === "automatic"
        ? `The customer booked an automatic and this vehicle is manual. They may not be able to drive it — assign an automatic, or agree a change with them first.`
        : `The customer booked a manual and this vehicle is automatic. Automatics carry a premium they have not paid — assign a manual, or agree the change with them first.`,
    };
  }

  if (to.rank > from.rank) {
    return {
      verdict: "upgrade",
      message: `Free upgrade — ${quoted.model || "the quoted category"} to ${assigned.name || "a higher category"}. Keep the quoted price; the customer pays no more.`,
    };
  }

  if (to.rank < from.rank) {
    return {
      verdict: "downgrade",
      message: `Downgrade from ${quoted.model || "the quoted category"} to ${assigned.name || "a lower category"}. Only proceed with the customer's agreement, and reduce the price to the lower category's rate.`,
    };
  }

  return { verdict: "ok", message: "" };
}

/** A downgrade is permitted, but only deliberately — hence a reason on the record. */
export function downgradeNeedsReason(verdict: Verdict): boolean {
  return verdict === "downgrade";
}
