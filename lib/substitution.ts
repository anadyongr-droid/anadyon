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

/**
 * Transmission implied by a model name, for quotes whose transmission field
 * says "Any".
 *
 * "Any" on the public form means the customer expressed no preference between
 * the choices offered — it does not mean they are indifferent to what they end
 * up driving. Someone who picked a Fiat Panda picked a manual car, and handing
 * them an automatic is a change whether or not they touched the dropdown.
 *
 * Derived from the model rather than assumed, so a fleet change moves this
 * automatically. Names are matched loosely because the quote stores a model
 * ("Fiat Panda") while the fleet stores individual vehicles ("Fiat Panda #2").
 */
const MODEL_TRANSMISSION: { pattern: RegExp; transmission: string }[] = [
  { pattern: /peugeot\s*107/i,               transmission: "Automatic" },
  { pattern: /panda|micra|getz|i10|i20/i,    transmission: "Manual" },
  { pattern: /kymco|agility|scooter/i,       transmission: "Automatic" },
];

/** What the customer should end up driving: the stated preference, else the model's own. */
export function expectedTransmission(quoted: Quoted): string | null {
  const stated = (quoted.transmission ?? "").trim();
  if (stated && !/^any$/i.test(stated)) return stated;

  const model = (quoted.model ?? "").trim();
  if (!model) return null;
  return MODEL_TRANSMISSION.find(m => m.pattern.test(model))?.transmission ?? null;
}

export type Verdict = "ok" | "upgrade" | "downgrade" | "blocked";

/**
 * Why an assignment was refused, in a form code can branch on.
 *
 * The three blocked cases are not the same kind of problem, and only one is
 * something a customer can agree to. Telling them apart by matching the
 * message text would break the first time a word changed.
 */
export type BlockedReason =
  /** A car booking becoming a bicycle. A different product, not a substitution. */
  | "family"
  /** The vehicle's transmission is not recorded. Missing data, not a decision. */
  | "transmission_unknown"
  /** Manual against automatic. Something the customer can ask for. */
  | "transmission_mismatch"
  /** A lower category than booked. Something the customer can agree to. */
  | "downgrade";

export interface SubstitutionCheck {
  verdict: Verdict;
  /** Shown to staff. Empty when the assignment matches what was quoted. */
  message: string;
  /** Set whenever the verdict is "blocked" or "downgrade". */
  reason?: BlockedReason;
}

/**
 * Whether a recorded customer request can permit this assignment.
 *
 * Only the two a customer is actually able to consent to. A car booking cannot
 * become a bicycle because somebody ticked a box, and no amount of agreement
 * supplies a transmission the fleet record does not hold.
 */
const CONSENT_CAN_PERMIT: ReadonlySet<BlockedReason> = new Set<BlockedReason>([
  "transmission_mismatch",
  "downgrade",
]);

export function consentCanPermit(check: SubstitutionCheck): boolean {
  return check.reason !== undefined && CONSENT_CAN_PERMIT.has(check.reason);
}

export interface Quoted {
  pricing_group?: string | null;
  /** Broad family recorded on the quote: Car(s), Motorbike(s), or Bike(s). */
  vehicle_type?: string | null;
  /** "Manual", "Automatic", or "Any" when the customer expressed no preference. */
  transmission?: string | null;
  model?: string | null;
}

export interface Assigned {
  pricing_group?: string | null;
  /** Broad family on the fleet record. Kept as a fallback for legacy quotes. */
  category?: string | null;
  transmission?: string | null;
  name?: string | null;
}

/** Returns the fleet family for a pricing group, if it is a known group. */
export function familyForPricingGroup(pricingGroup?: string | null): string | null {
  return pricingGroup ? RANK[pricingGroup]?.family ?? null : null;
}

/**
 * Normalises the labels used by the public form and the database respectively.
 *
 * A few early quotes have no pricing_group, so this is not merely cosmetic:
 * it keeps a legacy "Cars" quote from ever being allocated a bicycle.
 */
export function familyForVehicleType(vehicleType?: string | null): string | null {
  const value = (vehicleType ?? "").trim().toLowerCase();
  if (value === "car" || value === "cars") return "car";
  if (value === "motorbike" || value === "motorbikes" || value === "motorcycle" || value === "motorcycles") return "motorbike";
  if (value === "bike" || value === "bikes" || value === "bicycle" || value === "bicycles") return "bike";
  return null;
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
  const requestedFamily = from?.family ?? familyForVehicleType(quoted.vehicle_type);
  const assignedFamily = to?.family ?? familyForVehicleType(assigned.category);

  // A different fleet family is never a substitution. This fallback is needed
  // for quotes taken before pricing_group was persisted: their broad type is
  // still sufficient to stop a car request becoming a bicycle reservation.
  if (requestedFamily && assignedFamily && requestedFamily !== assignedFamily) {
    return {
      verdict: "blocked",
      message: `The quote was for a ${FAMILY_LABEL[requestedFamily]}, but this is a ${FAMILY_LABEL[assignedFamily]}. That is not a substitution — raise a new quote instead.`,
      reason: "family",
    };
  }

  // Transmission is settled independently of category rank. It used to sit
  // behind the pricing-group lookup, which meant a quote with no pricing_group
  // returned "ok" without the transmission ever being examined.
  const wanted = expectedTransmission(quoted);
  const giving = (assigned.transmission ?? "").trim();

  if (wanted && !giving && (requestedFamily ?? assignedFamily) === "car") {
    return {
      verdict: "blocked",
      message: "This vehicle has no recorded transmission. Assign a vehicle whose manual or automatic transmission is recorded.",
      reason: "transmission_unknown",
    };
  }

  if (wanted && giving && wanted.toLowerCase() !== giving.toLowerCase()) {
    return {
      verdict: "blocked",
      message: wanted.toLowerCase() === "automatic"
        ? `The customer's booking is for an automatic and this vehicle is manual. They may not be able to drive it — assign an automatic, or agree the change with them first.`
        : `The customer's booking is for a manual and this vehicle is automatic. Not every driver is comfortable in an automatic, and it carries a premium they have not paid — assign a manual, or agree the change with them first.`,
      reason: "transmission_mismatch",
    };
  }

  // No rank on either side — a walk-in, or a quote predating pricing_group.
  // The broad family and transmission checks above still apply in that case.
  if (!from || !to) return { verdict: "ok", message: "" };

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
      reason: "downgrade",
    };
  }

  return { verdict: "ok", message: "" };
}

/**
 * The vehicles that may be offered without further customer consent.
 *
 * Same-category allocation and a higher category are both acceptable. A lower
 * category is intentionally not included in an ordinary dropdown: it needs a
 * separately recorded customer agreement rather than a staff mis-click.
 */
export function isEligibleAssignment(quoted: Quoted, assigned: Assigned): boolean {
  const verdict = checkSubstitution(quoted, assigned).verdict;
  return verdict === "ok" || verdict === "upgrade";
}

/** A downgrade is permitted, but only deliberately — hence a reason on the record. */
export function downgradeNeedsReason(verdict: Verdict): boolean {
  return verdict === "downgrade";
}
