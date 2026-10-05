import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { chunk, MAX_ANNOTATIONS, MAX_CHARACTERS } from "../scripts/annotate-text.mjs";

/**
 * The read-production workflow, and the two properties that make it safe to
 * have at all.
 *
 * **Why it exists.** On 4 October 2026 five separate round trips asked a person
 * to paste a SELECT into the dashboard and type the result back. Every one was
 * read-only; one went wrong in a way that mattered, when a count was designed,
 * misread as an identity, and nearly recorded as "the audit is armed" when it
 * was not. The credential stays in Actions secrets either way — an agent
 * triggers the job and never holds the key.
 *
 * **The two properties:** only a committed file can run, and no file in that
 * directory may contain a writing verb. Postgres enforces read-only at the
 * transaction level as well, which is the belt; this is the braces, and it
 * fails in CI rather than at 2am.
 */
const DIR = "scripts/sql/readonly";
const WORKFLOW = ".github/workflows/production-query.yml";

describe("nothing in the read-only query directory can write", () => {
  const files = readdirSync(DIR).filter((name) => name.endsWith(".sql"));

  it("has queries to check, so this is not passing vacuously", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s contains no writing statement", (name) => {
    const sql = readFileSync(`${DIR}/${name}`, "utf8")
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n")
      // Quoted literals are data, not statements — the same allowance the
      // fingerprint's own read-only test makes for privilege names.
      .replace(/'[^']*'/g, "''")
      .toLowerCase();

    for (const verb of ["insert", "update", "delete", "drop", "alter", "create", "grant", "revoke", "truncate"]) {
      expect(new RegExp(`\\b${verb}\\b`).test(sql), `${name} contains \`${verb}\``).toBe(false);
    }
  });
});

describe("the workflow can only run a committed file", () => {
  const workflow = readFileSync(WORKFLOW, "utf8");

  it("refuses a path rather than a bare name", () => {
    // The input names a file; it never carries SQL, so there is nothing to
    // inject and nothing that is not in git.
    expect(workflow).toContain("*/*|*..*|");
    expect(workflow).toContain("scripts/sql/readonly/$QUERY");
  });

  it("forces read-only at the server, not by inspection", () => {
    expect(workflow).toContain("default_transaction_read_only=on");
  });

  it("refuses to run blind when the secret is absent", () => {
    expect(workflow).toContain("SUPABASE_DB_URL is not set");
  });

  it("never writes, applies a migration, or runs on a schedule", () => {
    expect(workflow).not.toContain("schedule:");
    expect(workflow.toLowerCase()).not.toContain("migrations/paste");
  });
});

describe("the output is readable without the artifact", () => {
  it("splits at line boundaries and stays inside GitHub's limits", () => {
    // 1,200 rows of ~67 characters is some 80KB against a ceiling of ten
    // annotations × 3,000 characters, so it must overflow. The first version of
    // this test used 400 rows, which *fits* — it asserted a truncation that
    // could not happen and failed on correct code.
    const text = Array.from({ length: 1200 }, (_, index) => `row ${index} ${"x".repeat(60)}`).join("\n");
    const { chunks, omitted } = chunk(text);
    expect(chunks.length).toBeLessThanOrEqual(MAX_ANNOTATIONS);
    for (const piece of chunks) expect(piece.length).toBeLessThanOrEqual(MAX_CHARACTERS);
    // No row was cut in half.
    for (const piece of chunks) {
      for (const line of piece.split("\n")) expect(line.startsWith("row ")).toBe(true);
    }
    expect(omitted, "400 long rows cannot fit, so it must say how many were dropped").toBeGreaterThan(0);
  });

  it("says nothing was dropped when everything fits", () => {
    const { chunks, omitted } = chunk("one\ntwo\nthree");
    expect(chunks).toEqual(["one\ntwo\nthree"]);
    expect(omitted).toBe(0);
  });

  it("truncates a single line longer than one annotation rather than losing the rest", () => {
    const { chunks } = chunk(`${"y".repeat(5000)}\nafterwards`);
    expect(chunks.join("\n")).toContain("afterwards");
    for (const piece of chunks) expect(piece.length).toBeLessThanOrEqual(MAX_CHARACTERS);
  });
});
