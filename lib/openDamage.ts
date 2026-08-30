import { wholeDays } from "./wholeDays";

/**
 * Which vehicles are carrying damage nobody has repaired.
 *
 * `vehicle_damages` has recorded severity, repair cost and `repaired_on` since
 * migration 011, and that migration even created the partial index this query
 * wants — `vehicle_damages_open_idx ON vehicle_damages (vehicle_id) WHERE
 * repaired_on IS NULL`. Nothing ever ran it. The count rendered in exactly one
 * place, the Damages tab inside a single vehicle's modal, so the fleet-wide
 * question — "which cars are damaged right now?" — could only be answered by
 * opening all twenty-nine.
 *
 * ─── What this deliberately does not do ───
 *
 * It does not bar a rental. A scuffed bumper is not a KTEO expiry, and
 * lib/fleetStatus.ts keeps `blocksRental` for the two things that genuinely
 * void insurance. Whether major damage should stop a hand-over is a decision
 * for Tasos, not a default an implementer slips in; this only makes the fact
 * visible so the decision can be made by a person who can see it.
 *
 * It also carries no money. `repair_cost` stops at the ledger, which is
 * admin-only. Staff need to know a car is damaged before they hand it to a
 * customer; what it costs to put right is a different question with a
 * different audience.
 */

export type DamageSeverity = "minor" | "moderate" | "major";

/** Worst last, so an index comparison orders them. */
const SEVERITY_ORDER: DamageSeverity[] = ["minor", "moderate", "major"];

export interface OpenDamageRow {
  vehicle_id: string;
  severity: DamageSeverity;
  /** ISO calendar date. */
  reported_on: string;
  description: string;
}

export interface VehicleDamageSummary {
  vehicle_id: string;
  total: number;
  bySeverity: Record<DamageSeverity, number>;
  /** The worst present, which is not necessarily the most recent. */
  worst: DamageSeverity;
  oldestReportedOn: string;
  /** Whole days since the oldest unrepaired report. 0 on the day it was made. */
  daysOpen: number;
}

/**
 * Group open damage by vehicle, longest-standing first.
 *
 * Rows are expected to be already filtered to `repaired_on is null` by the
 * query — the partial index only helps if the filter is in SQL.
 */
export function summariseOpenDamage(
  rows: OpenDamageRow[],
  today: Date = new Date(),
): VehicleDamageSummary[] {
  const byVehicle = new Map<string, OpenDamageRow[]>();
  for (const r of rows) {
    const list = byVehicle.get(r.vehicle_id);
    if (list) list.push(r);
    else byVehicle.set(r.vehicle_id, [r]);
  }

  const summaries: VehicleDamageSummary[] = [];
  for (const [vehicle_id, group] of byVehicle) {
    const bySeverity: Record<DamageSeverity, number> = { minor: 0, moderate: 0, major: 0 };
    let worst: DamageSeverity = "minor";
    let oldestReportedOn = group[0].reported_on;

    for (const r of group) {
      bySeverity[r.severity] += 1;
      if (SEVERITY_ORDER.indexOf(r.severity) > SEVERITY_ORDER.indexOf(worst)) worst = r.severity;
      // String comparison is safe on ISO dates and avoids a Date per row.
      if (r.reported_on < oldestReportedOn) oldestReportedOn = r.reported_on;
    }

    summaries.push({
      vehicle_id,
      total: group.length,
      bySeverity,
      worst,
      oldestReportedOn,
      daysOpen: wholeDays(oldestReportedOn, today),
    });
  }

  // Longest-standing first: the briefing is read top-down, so the car nobody
  // has dealt with should be the one that is hardest to skip.
  return summaries.sort(
    (a, b) => b.daysOpen - a.daysOpen || a.vehicle_id.localeCompare(b.vehicle_id),
  );
}

/** One line a human reads. No money in it — see the note at the top. */
export function damageLabel(s: VehicleDamageSummary): string {
  if (s.total === 1) return `1 open damage — ${s.worst}`;
  return `${s.total} open damages — worst ${s.worst}`;
}
