import { describe, expect, it } from "vitest";
import {
  annotations,
  countsLine,
  parseReport,
} from "../scripts/report-annotations.mjs";
import { renderReport } from "../scripts/productionFingerprint.mjs";

/**
 * Making the nightly findings readable without the artifact.
 *
 * **The defect this closes.** On 4 October 2026 the check ran against
 * production, found differences at `high`, sent the alert — and the rows could
 * not be read from an agent container at all. GitHub serves logs and artifacts
 * from a storage domain, so `gh api …/logs` and the artifact zip both refuse;
 * the only fact available through the API was that the job had failed. A control
 * whose output cannot be read is a control that gets summarised from memory, and
 * this project has already corrected two documents written that way.
 *
 * Check-run annotations are served by the API, so the rows go there as well.
 */
const report = (changes: Record<string, unknown>[]) =>
  renderReport({
    changes,
    expectedDigest: "aaaa (46 migrations)",
    actualDigest: "bbbb",
    at: new Date("2026-10-04T07:26:00Z"),
  });

describe("the report's own rows survive the round trip", () => {
  it("reads each severity group out of the rendered report", () => {
    // Parsed from the real renderer rather than from a handwritten fixture, so a
    // change to the report's shape breaks this rather than quietly producing no
    // annotations — which would look exactly like a clean night.
    const groups = parseReport(
      report([
        { kind: "grant", object: "reservations", role: "anon", severity: "critical" },
        { kind: "column", object: "quotes.pickup_date", severity: "high", expected: "date not null", actual: "text" },
        { kind: "indexes.added", object: "quotes.quotes_extra_idx", severity: "normal" },
        { kind: "grant", object: "customers", role: "anadyon_audit", severity: "explained", explained_by: "customers" },
      ]),
    );
    expect([...groups.keys()].sort()).toEqual(["critical", "explained", "high", "normal"]);
    expect(groups.get("high")?.[0]).toContain("quotes.pickup_date");
    expect(groups.get("critical")).toHaveLength(1);
  });

  it("is quiet on a clean night rather than inventing a group", () => {
    const groups = parseReport(report([]));
    expect(groups.size).toBe(0);
    expect(annotations(groups)).toEqual([]);
    expect(countsLine(groups)).toBe("no differences");
  });

  it("does not read the prose sections as findings", () => {
    // The report ends with a numbered "What to do" section whose first line
    // begins with `1. **Do not write a marker for this.**`. A parser that took
    // any list item would turn the advice into findings.
    const groups = parseReport(report([{ kind: "column", object: "quotes.x", severity: "high" }]));
    expect(groups.get("high")).toHaveLength(1);
    for (const rows of groups.values()) {
      for (const row of rows) expect(row).not.toContain("Do not write a marker");
    }
  });
});

describe("one annotation per severity, because ten per level is the limit", () => {
  const manyRows = Array.from({ length: 14 }, (_, index) => ({
    kind: "column",
    object: `quotes.column_${index}`,
    severity: "high",
  }));

  it("carries all fourteen high rows in a single annotation", () => {
    // GitHub shows at most ten annotations of each level per step, so fourteen
    // separate ones would silently drop four — a partial truth presented as a
    // report, which is the failure this check exists to avoid.
    const commands = annotations(parseReport(report(manyRows)));
    expect(commands).toHaveLength(1);
    expect(commands[0].startsWith("::error title=production fingerprint: high::")).toBe(true);
    for (let index = 0; index < 14; index += 1) {
      expect(commands[0], `column_${index} is missing from the annotation`).toContain(`column_${index}`);
    }
  });

  it("escapes the newlines, so the annotation is one command", () => {
    const commands = annotations(parseReport(report(manyRows)));
    expect(commands[0]).not.toContain("\n");
    expect(commands[0]).toContain("%0A");
  });

  it("says how many rows it had to drop rather than truncating in silence", () => {
    const commands = annotations(parseReport(report(manyRows)), { limit: 120 });
    expect(commands[0]).toContain("more row(s)");
    expect(commands[0]).toContain("the full report is the run artifact");
  });

  it("marks `normal` as a notice and never annotates `explained`", () => {
    // A declared change is not a finding, and putting it beside the findings is
    // how the two stop being distinguishable.
    const commands = annotations(
      parseReport(
        report([
          { kind: "indexes.added", object: "quotes.i", severity: "normal" },
          { kind: "grant", object: "customers", role: "anadyon_audit", severity: "explained", explained_by: "customers" },
        ]),
      ),
    );
    expect(commands).toHaveLength(1);
    expect(commands[0]).toContain("::notice title=production fingerprint: normal::");
  });

  it("counts every group for the alert's one-line summary", () => {
    const groups = parseReport(
      report([
        { kind: "column", object: "quotes.a", severity: "high" },
        { kind: "indexes.added", object: "quotes.i", severity: "normal" },
        { kind: "grant", object: "customers", role: "anadyon_audit", severity: "explained", explained_by: "customers" },
      ]),
    );
    expect(countsLine(groups)).toBe("high 1 · normal 1 · explained 1");
  });
});
