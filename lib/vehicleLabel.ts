/**
 * How a vehicle is named on screen.
 *
 * `name` is the model — what the customer bought, and what appears in their
 * confirmation email. `plate` is the identity — what a staff member matches
 * against the car in front of them. They are separate columns and stay that
 * way: one field holding both cannot be searched or sorted by either, and a
 * plate in the model name reaches the customer, where it means nothing.
 *
 * Everywhere staff choose or identify a specific vehicle, the two are joined.
 * Bicycles carry no plate, so they keep the "#1" suffix that distinguishes them.
 */
export interface Labelled {
  name: string;
  plate?: string | null;
}

/** "Hyundai i20 — IOZ-4176", or just "Cinzia Retro Men" where there is no plate. */
export function vehicleLabel(v: Labelled | null | undefined): string {
  if (!v) return "";
  const plate = (v.plate ?? "").trim();
  return plate ? `${v.name} — ${plate}` : v.name;
}

/**
 * Greek number plates use only the fourteen capitals that exist in both
 * alphabets, so a plate typed on a Greek keyboard looks identical to one typed
 * on a Latin keyboard and is a completely different string. Staff searching for
 * "ZAZ" would not find "ΖΑΖ". Normalising on the way in keeps one form.
 */
const GREEK_TO_LATIN: Record<string, string> = {
  "Α": "A", "Β": "B", "Ε": "E", "Ζ": "Z", "Η": "H", "Ι": "I", "Κ": "K",
  "Μ": "M", "Ν": "N", "Ο": "O", "Ρ": "P", "Τ": "T", "Υ": "Y", "Χ": "X",
};

export function normalisePlate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const latin = [...raw.trim().toUpperCase()]
    .map((c) => GREEK_TO_LATIN[c] ?? c)
    .join("");
  const tidied = latin.replace(/[\s-]+/g, "-").replace(/^-|-$/g, "");
  return tidied || null;
}
