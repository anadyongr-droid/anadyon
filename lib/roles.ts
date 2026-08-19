/**
 * The two roles that grant access to the admin area.
 *
 * Kept in one place because the same list is enforced in three: proxy.ts
 * decides what each role may reach, the users API validates what may be
 * assigned, and the management screen offers the choice. Previously the only
 * definition was a pair of string comparisons scattered through the proxy,
 * which is how "no role" came to be treated as a role.
 */
export const ROLES = ["admin", "staff"] as const;

export type Role = (typeof ROLES)[number];

/** Narrows an unknown value to a real role. Anything else grants nothing. */
export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** How each role is described to the person managing accounts. */
export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  staff: "User",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: "Full access, including rates, fleet, discounts and this screen.",
  staff: "Day-to-day work: today, calendar, reservations, quotes, customers and inbox.",
};
