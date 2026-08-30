import type { DamageSeverity } from "./openDamage";

/**
 * When recording damage takes a vehicle off the road.
 *
 * ─── Why this is a vehicle_block and not a new kind of bar ───
 *
 * The instinct is to teach `rentalBar()` about damage. That would be wrong, and
 * the reason is worth writing down: **`rentalBar()` is not what stops a rental.**
 * It renders a warning. The thing that actually refuses to allocate a vehicle is
 * the SQL allocator in `20260828120000_vehicle_blocks.sql`, which checks
 * `status`, KTEO, insurance, and open rows in `vehicle_blocks`. A bar that lived
 * only in TypeScript would show a red line on the fleet screen while the website
 * carried on booking the car — the exact "recorded, but acted on by nothing"
 * failure this codebase keeps finding.
 *
 * So a barring damage opens a block. Everything else then follows for free, and
 * all of it was built in §7.4:
 *
 *   - the allocator refuses the vehicle, online and in the office alike;
 *   - `released_at` / `released_by` means only a person puts it back, never a
 *     date arriving;
 *   - `blockChase()` reminds at 2 days and escalates by email at 4;
 *   - the fleet list and Today already render "out of fleet" with the reason.
 *
 * The `reason` check constraint has allowed `'damage'` since the table was
 * created. This is the caller it was waiting for.
 */

/**
 * Severities that take the vehicle off the road immediately.
 *
 * Only `major`. `minor` and `moderate` are recorded and surfaced — see
 * lib/openDamage.ts — but a scuffed bumper is not a reason to refuse a booking,
 * and treating it as one would train everybody to log damage as `minor` to
 * avoid the consequence.
 */
export const BARRING_SEVERITIES: readonly DamageSeverity[] = ["major"];

export function severityBars(severity: string | null | undefined): boolean {
  return BARRING_SEVERITIES.includes(severity as DamageSeverity);
}

export interface DamageRow {
  severity?: string | null;
  description?: string | null;
  reported_on?: string | null;
  /** Set when the damage is already fixed. */
  repaired_on?: string | null;
}

/**
 * Whether recording this row should open a block.
 *
 * `repaired_on` is the guard that matters. The damage form allows back-filling
 * a historic repair — a major dent from June, fixed in July, entered in August
 * so the ledger is complete. Barring the vehicle for that would take a
 * perfectly good car off the road because somebody tidied up the records.
 */
export function shouldOpenBlock(row: DamageRow): boolean {
  if (!severityBars(row.severity)) return false;
  if (row.repaired_on) return false;
  return true;
}

/** The note carried on the block, so the fleet row says why without a lookup. */
export function blockNote(row: DamageRow): string {
  const description = String(row.description ?? "").trim();
  const shortened = description.length > 120 ? `${description.slice(0, 117)}…` : description;
  return shortened ? `Major damage: ${shortened}` : "Major damage recorded";
}

/**
 * Why a damage block is the one kind only an administrator may release.
 *
 * `app/api/admin/vehicles/blocks/route.ts` deliberately lets staff release a
 * block, and its reasoning is sound for the case it was written for: a car back
 * from the mechanic is an operational fact, and "a release that only an admin
 * can perform is a release that waits."
 *
 * That does not carry over here. Releasing a *damage* block is not recording
 * that a van returned; it is a judgement that a vehicle with unrepaired major
 * damage is fit to hand to a customer. That is a liability decision, and it
 * belongs to the person who carries the liability. Every other reason keeps the
 * old behaviour.
 */
export const ADMIN_ONLY_RELEASE_REASONS: readonly string[] = ["damage"];

export function releaseNeedsAdmin(reason: string | null | undefined): boolean {
  return ADMIN_ONLY_RELEASE_REASONS.includes(String(reason ?? ""));
}
