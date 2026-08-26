import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The nightly backup is the only thing standing between a mistaken DELETE and
 * permanent loss: the Supabase Free plan takes no backups at all.
 *
 * Nothing tested this workflow. It is a YAML file that runs on a schedule, so
 * a change that quietly removes the decrypt check or the emptiness guard would
 * produce green CI and a backup nobody can restore — which is the same shape as
 * every other failure this project has had: the thing looks present and is not
 * doing its job.
 *
 * These assertions are deliberately about PROPERTIES rather than exact
 * commands, so the workflow can be rewritten without the tests becoming a
 * transcription of it.
 */
const root = new URL("../", import.meta.url).pathname;
const WORKFLOW = join(root, ".github/workflows/backup.yml");
const yml = readFileSync(WORKFLOW, "utf8");
/**
 * Comments stripped for any assertion about what the workflow DOES.
 *
 * The file explains its own reasoning in comments, including the phrase it
 * deliberately avoids emitting — so matching raw text finds the explanation and
 * reports the opposite of the truth. This has now caught me three times: a CSS
 * rule, an agent-loop path, and here.
 */
const steps = yml.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");

describe("the nightly backup exists and runs unattended", () => {
  it("is scheduled, not manual-only", () => {
    expect(yml).toMatch(/on:\s*[\s\S]{0,200}schedule:/);
    expect(yml).toMatch(/cron:/);
  });

  it("dumps roles and schema, not data alone", () => {
    // A data-only export turns a restore into a reconstruction: the roles and
    // grants that make the data reachable are exactly what it omits.
    expect(yml).toMatch(/--role|roles/i);
    expect(yml).toMatch(/schema/i);
  });
});

describe("it refuses to trust a backup it has not checked", () => {
  it("rejects an empty or truncated dump before uploading", () => {
    expect(yml).toMatch(/refuse|truncated|empty/i);
    // there must be a size comparison, not merely a comment about one
    expect(yml).toMatch(/-lt|\bsize\b/);
  });

  it("proves the archive decrypts before it is stored", () => {
    // An encrypted file nobody has ever decrypted is a guess, not a backup.
    expect(yml).toMatch(/-d\b[\s\S]{0,200}(aes-256-cbc|pbkdf2)|Verify the archive decrypts/i);
  });

  it("encrypts with a modern KDF, not a bare password", () => {
    expect(yml).toMatch(/pbkdf2/);
    expect(yml).toMatch(/-iter\s+\d{5,}/);   // iterations in the hundreds of thousands
  });
});

describe("it keeps history and says when it fails", () => {
  it("retains a longer-lived copy, not only dailies", () => {
    expect(yml).toMatch(/monthly/i);
  });

  it("prunes, so the destination does not grow without bound", () => {
    expect(yml).toMatch(/prune|delete|expire/i);
  });

  it("alerts on failure only", () => {
    // A nightly "backup succeeded" message trains people to ignore the channel,
    // and then the one failure is ignored too.
    expect(steps).toMatch(/failure\(\)|if:\s*failure/);
    expect(steps, "a success notification would defeat the alert")
      .not.toMatch(/backup succeeded/i);
  });
});

describe("Supabase Storage — the gap phase 2 makes real", () => {
  /**
   * A tripwire, not a passing feature.
   *
   * The workflow backs up the DATABASE only. Nothing touches a Supabase bucket
   * — the "storage" in that file is Cloudflare R2, the destination. Today that
   * costs nothing because no bucket holds anything that matters.
   *
   * The moment handover photographs exist, a restore returns every row, every
   * damage observation and every photo REFERENCE, and not one photograph: a
   * system that looks intact and cannot defend a single charge.
   *
   * So this test fails as soon as the schema gains photo storage without the
   * backup gaining it too. It is meant to fail one day.
   */
  const migrations = join(root, "supabase/migrations");
  const photoTableExists = existsSync(migrations) &&
    readFileSync(join(root, "supabase/migrations/001_baseline.sql"), "utf8").length > 0 &&
    // scan every migration for the phase-2 evidence tables
    require("node:fs").readdirSync(migrations)
      .filter((f: string) => f.endsWith(".sql"))
      .some((f: string) => /handover_photos|storage\.objects/i.test(readFileSync(join(migrations, f), "utf8")));

  const backupCoversStorage = /storage\/v1|supabase storage|storage\.objects|bucket_id/i.test(yml) ||
    /storage\/v1|storage\.objects/i.test(readFileSync(join(root, "scripts/backup.mjs"), "utf8"));

  it("if the schema stores photographs, the backup must cover them", () => {
    if (!photoTableExists) {
      // Not yet a defect — recorded so the reason is visible when it becomes one.
      expect(backupCoversStorage, "no photo storage yet; nothing to back up").toBe(false);
      return;
    }
    expect(
      backupCoversStorage,
      "handover photographs exist but the nightly backup does not include Supabase Storage — " +
      "a restore would return the rows and none of the images. See blueprint §4.2a.",
    ).toBe(true);
  });
});
