import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { gunzipSync } from "node:zlib";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * `scripts/read-dmarc.mjs`, run against a real aggregate report.
 *
 * The script exists to answer whether `_dmarc.anadyon.gr` can move off
 * `p=none`, which makes a quiet mis-parse the worst thing it could do: a parser
 * that silently finds no failures is indistinguishable from a domain with no
 * failures, and the difference is whether legitimate mail gets quarantined.
 *
 * So the load-bearing test here is the second one, which asserts the script can
 * *detect* a failure. The first was written before it and passed immediately —
 * on its own it would prove only that the script runs.
 *
 * The fixture is a genuine Outlook.com report from 15 September 2026, not
 * hand-written XML. An earlier version of this script was committed having
 * never parsed a real file, with its field names taken from RFC 7489's appendix
 * — the same reasoning-from-structure that produced a wrong SPF finding on this
 * project two days earlier.
 */
const FIXTURE = "docs/dmarc/outlook.com-2026-09-15.xml.gz";
const run = (path: string) =>
  execFileSync("node", ["scripts/read-dmarc.mjs", path], { encoding: "utf8" });

describe("read-dmarc", () => {
  it("reports what the fixture actually contains", () => {
    const out = run(FIXTURE);

    // Checked against the decompressed XML by eye, field by field.
    expect(out).toContain("Outlook.com");
    expect(out).toContain("2026-09-15 → 2026-09-16");
    expect(out).toContain("p=none");
    expect(out).toContain("78.46.171.57");
    expect(out).toContain("anadyon.gr");
    expect(out).toContain("Every message in these reports passed DMARC");
  });

  it("flags a source that failed DMARC", () => {
    // Same real report with the aligned results turned to fail. If the script
    // cannot see this, a clean run means nothing.
    const xml = gunzipSync(readFileSync(FIXTURE))
      .toString("utf8")
      .replace("<dkim>pass</dkim>", "<dkim>fail</dkim>")
      .replace("<spf>pass</spf>", "<spf>fail</spf>")
      .replace("<count>1</count>", "<count>42</count>");

    const dir = mkdtempSync(join(tmpdir(), "dmarc-"));
    const path = join(dir, "failing.xml");
    writeFileSync(path, xml);

    const out = run(path);
    expect(out).toContain("FAILS DMARC");
    expect(out).toContain("42");
    expect(out).not.toContain("Every message in these reports passed DMARC");
  });

  it("reads the aligned verdict, not the raw authentication result", () => {
    // The distinction that decides this whole exercise: `auth_results` reports
    // what each check returned, `policy_evaluated` reports whether it ALIGNED
    // with the From: header. DMARC acts on the second. A message can pass SPF
    // outright and still fail DMARC — which is exactly the confusion that
    // produced a wrong SPF finding on this project two days earlier.
    //
    // In this schema the two live in different tags: `policy_evaluated` holds
    // <dkim>pass</dkim>, while `auth_results` holds <result>pass</result>. So
    // flipping the former leaves the latter untouched, and the assertion below
    // proves the script followed the aligned verdict rather than the raw one.
    const xml = gunzipSync(readFileSync(FIXTURE))
      .toString("utf8")
      .replace("<dkim>pass</dkim>", "<dkim>fail</dkim>")
      .replace("<spf>pass</spf>", "<spf>fail</spf>");

    // Precondition: the raw results must still say pass, or this proves nothing.
    expect(xml).toContain("<result>pass</result>");
    expect(xml).not.toContain("<dkim>pass</dkim>");

    const dir = mkdtempSync(join(tmpdir(), "dmarc-"));
    const path = join(dir, "unaligned.xml");
    writeFileSync(path, xml);

    expect(run(path)).toContain("FAILS DMARC");
  });
});
