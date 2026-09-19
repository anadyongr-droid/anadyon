#!/usr/bin/env node
/**
 * Reads DMARC aggregate reports and says which senders pass.
 *
 * Written 19 September 2026, to answer one question: can `_dmarc.anadyon.gr`
 * move off `p=none` without putting legitimate mail in spam? The answer is in
 * the aggregate reports receivers already send us daily — and which nobody had
 * ever read, because they were being deleted on arrival. Twenty-plus of them
 * were found in the Gmail bin, from five different receivers.
 *
 * Takes the gzipped XML those reports attach. Every receiver sends the same
 * schema (RFC 7489 appendix C), so one parser handles Microsoft, Google, Yahoo,
 * AOL and GMX alike.
 *
 *   node scripts/read-dmarc.mjs report1.xml.gz report2.xml …
 *   node scripts/read-dmarc.mjs docs/dmarc/*.gz
 *
 * Accepts .gz, .zip-less plain .xml, or a base64 file of either. Prints one row
 * per sending IP with its volume and whether SPF and DKIM aligned.
 *
 * What it deliberately does NOT do is decide for you. A clean week is evidence,
 * not proof: aggregate reports only cover receivers that send them, so a source
 * that mails exclusively to a domain with no reporting is invisible here.
 *
 * Validated 19 September 2026 against a real Outlook.com report, kept as a
 * fixture at docs/dmarc/. lib/dmarcReader.test.ts runs it against that file and
 * against two mutations of it; both mutation tests were confirmed to fail when
 * the script was changed to read `auth_results` instead of `policy_evaluated`,
 * which is the mis-parse that would matter.
 */
import { readFileSync } from "node:fs";
import { gunzipSync, inflateRawSync } from "node:zlib";

const files = process.argv.slice(2);
if (!files.length) {
  console.error("usage: node scripts/read-dmarc.mjs <report.xml.gz | .zip | .xml> …");
  process.exit(2);
}

/**
 * Pull the single member out of a ZIP without a dependency.
 *
 * Google sends `.zip` where Microsoft and GMX send `.xml.gz` — found the first
 * time a real Google report was opened, because the earlier version of this
 * script handled only gzip and silently failed on it. Reads the local file
 * header (RFC 1952's cousin, PKZIP APPNOTE 4.3.7): 30-byte fixed header, then
 * the name and extra field, then the data, stored (method 0) or deflated (8).
 */
function fromZip(buf) {
  if (buf.readUInt32LE(0) !== 0x04034b50) throw new Error("not a zip");
  const method = buf.readUInt16LE(8);
  const nameLen = buf.readUInt16LE(26);
  const extraLen = buf.readUInt16LE(28);
  const start = 30 + nameLen + extraLen;
  let size = buf.readUInt32LE(18); // compressed size

  // A streamed zip writes sizes to the data descriptor instead, leaving these
  // zero. Fall back to everything up to the central directory.
  if (size === 0) {
    const central = buf.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), start);
    size = (central === -1 ? buf.length : central) - start;
  }

  const body = buf.subarray(start, start + size);
  return (method === 0 ? body : inflateRawSync(body)).toString("utf8");
}

/** Tolerant of however the file arrived: zip, gzip, plain XML, or base64 of any. */
function xmlFrom(path) {
  let buf = readFileSync(path);
  if (buf[0] === 0x1f && buf[1] === 0x8b) return gunzipSync(buf).toString("utf8");
  if (buf[0] === 0x50 && buf[1] === 0x4b) return fromZip(buf);
  const text = buf.toString("utf8").trim();
  if (text.startsWith("<")) return text;
  // Base64 — decode once, then it is either gzip or XML.
  const decoded = Buffer.from(text.replace(/\s+/g, ""), "base64");
  if (decoded[0] === 0x1f && decoded[1] === 0x8b) return gunzipSync(decoded).toString("utf8");
  if (decoded[0] === 0x50 && decoded[1] === 0x4b) return fromZip(decoded);
  return decoded.toString("utf8");
}

const tag = (xml, name) => {
  const m = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(xml);
  return m ? m[1].trim() : "";
};
const blocks = (xml, name) =>
  [...xml.matchAll(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, "g"))].map((m) => m[1]);

/** ip -> { count, spfPass, dkimPass, dmarcPass, envelopes, orgs } */
const sources = new Map();
const reports = [];

for (const file of files) {
  let xml;
  try { xml = xmlFrom(file); }
  catch (err) { console.error(`  ! ${file}: ${err.message}`); continue; }

  const meta = tag(xml, "report_metadata");
  const policy = tag(xml, "policy_published");
  reports.push({
    file,
    org: tag(meta, "org_name") || "(unknown)",
    from: tag(tag(meta, "date_range"), "begin"),
    to: tag(tag(meta, "date_range"), "end"),
    p: tag(policy, "p"),
  });

  for (const rec of blocks(xml, "record")) {
    const row = tag(rec, "row");
    const ip = tag(row, "source_ip") || "(none)";
    const count = Number(tag(row, "count") || 0);
    const evaluated = tag(row, "policy_evaluated");

    const entry = sources.get(ip) ?? {
      count: 0, spfPass: 0, dkimPass: 0, dmarcFail: 0, envelopes: new Set(), orgs: new Set(),
    };
    entry.count += count;
    // policy_evaluated is the ALIGNED result, which is what DMARC acts on —
    // not the raw auth result further down the record. A message can pass SPF
    // and still fail DMARC because the envelope domain does not align.
    if (tag(evaluated, "spf") === "pass") entry.spfPass += count;
    if (tag(evaluated, "dkim") === "pass") entry.dkimPass += count;
    if (tag(evaluated, "spf") !== "pass" && tag(evaluated, "dkim") !== "pass") entry.dmarcFail += count;

    for (const spf of blocks(rec, "spf")) {
      const d = tag(spf, "domain");
      if (d) entry.envelopes.add(d);
    }
    entry.orgs.add(tag(meta, "org_name") || "?");
    sources.set(ip, entry);
  }
}

const when = (s) => (s ? new Date(Number(s) * 1000).toISOString().slice(0, 10) : "?");
console.log(`\n${reports.length} report(s):`);
for (const r of reports) console.log(`  ${r.org.padEnd(24)} ${when(r.from)} → ${when(r.to)}   policy seen: p=${r.p}`);

const rows = [...sources.entries()].sort((a, b) => b[1].count - a[1].count);
const total = rows.reduce((s, [, e]) => s + e.count, 0);
const failing = rows.filter(([, e]) => e.dmarcFail > 0);

console.log(`\n${total} message(s) from ${rows.length} source IP(s):\n`);
console.log("  " + "source IP".padEnd(18) + "msgs".padStart(6) + "  SPF✓".padStart(7) + "  DKIM✓".padStart(8) + "   envelope domain(s)");
console.log("  " + "-".repeat(78));
for (const [ip, e] of rows) {
  const flag = e.dmarcFail > 0 ? " ← FAILS DMARC" : "";
  console.log(
    "  " + ip.padEnd(18) + String(e.count).padStart(6) +
    String(e.spfPass).padStart(7) + String(e.dkimPass).padStart(8) +
    "   " + ([...e.envelopes].join(", ") || "-") + flag,
  );
}

console.log("");
if (failing.length === 0 && total > 0) {
  console.log("  Every message in these reports passed DMARC on SPF, DKIM or both.");
  console.log("  That supports tightening p=none, but read the caveat in");
  console.log("  docs/EMAIL-DELIVERABILITY.md before changing the record: these reports");
  console.log("  only cover receivers that send them.");
} else if (failing.length) {
  console.log(`  ${failing.length} source(s) failed DMARC. Identify each one before tightening:`);
  console.log("  a legitimate sender failing here is mail that would be quarantined.");
}
