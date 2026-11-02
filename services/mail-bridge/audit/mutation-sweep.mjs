// Mutation sweep over services/mail-bridge.
//
// **Why this exists.** On 27 October 2026 this service shipped two tests that
// asserted the defect they were written to catch — a lease test that proved a
// second send WAS admitted, and a rate-limit test that passed against the
// broken store. Both were written after re-breaking the code and watching a
// test fail, which proves a control is *reachable* and says nothing about
// whether the assertion is the right one.
//
// This closes that gap mechanically. Each entry below is a plausible defect:
// a control turned off, a check inverted, a guard deleted. The suite must fail
// for every one of them. **A mutation that SURVIVES is a property the code
// claims and no test asserts** — which is the thing a human reviewer cannot
// reliably spot and a machine can.
//
// Run it from the repository root:
//
//     node services/mail-bridge/audit/mutation-sweep.mjs
//
// It edits files in place and restores them after each run, so the working tree
// must be clean, and a crash mid-run leaves one file mutated — `git diff` says
// which. It is not part of `npm test`: it runs the whole service suite once per
// mutation, which takes minutes, and per AGENTS.md coverage-shaped numbers are
// diagnostics rather than merge gates. Run it when the service changes.
//
// **A mutation whose pattern no longer matches is a FAILURE, not a note.**
// Corrected 27 October after Codex's third review, which caught this tool doing
// the exact thing it exists to catch. Four mutations had gone stale when the
// code they targeted was rewritten; the sweep printed `SKIP` for each, carried
// on, and reported "61 mutations, 0 survived". Four controls were therefore
// unmutated while the summary said otherwise — a check that looks like
// protection and is not, which is the defect class this whole file is for. So a
// stale pattern now exits non-zero and the summary counts run, skipped and
// survived separately. If a mutation goes stale because the code moved on,
// repoint it or delete it deliberately; do not let it rot quietly.
//
// Adding a mutation is how you record "this property matters". Deleting one
// because it is awkward is how this file stops being worth running.

import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const L = "services/mail-bridge/lib";
const X = "services/mail-bridge/extension";

const M = [
  // --- sendRequest: the whole boundary ---
  [`${L}/sendRequest.ts`, "if (!claimedSender) {", "if (false) {", "sender: missing sender accepted"],
  [`${L}/sendRequest.ts`, "} else if (!sender) {", "} else if (false) {", "sender: unapproved sender accepted"],
  [`${L}/sendRequest.ts`, "const raw = Array.isArray(value) ? value : [value];", "const raw = Array.isArray(value) ? value : String(value).split(\",\");", "recipients: comma-split restored"],
  [`${L}/sendRequest.ts`, "if (!PLAUSIBLE_ADDRESS.test(address)) {", "if (false) {", "recipients: address shape unchecked"],
  [`${L}/sendRequest.ts`, "if (all.length > limits.maxRecipients) {", "if (false) {", "recipients: count limit removed"],
  [`${L}/sendRequest.ts`, 'if (/[\\r\\n]/.test(subject)) reasons.push("subject must not contain line breaks");', "", "subject: line breaks allowed"],
  [`${L}/sendRequest.ts`, 'if (!text && !html) reasons.push("a text or html body is required");', "", "body: empty body allowed"],
  [`${L}/sendRequest.ts`, "if (extensionSegmentsOf(filename).some((ext) => BLOCKED_ATTACHMENT_EXTENSIONS.has(ext))) {", "if (false) {", "attachments: blocklist removed"],
  [`${L}/sendRequest.ts`, "if (total > limits.maxTotalAttachmentBytes) {", "if (false) {", "attachments: size limit removed"],
  [`${L}/sendRequest.ts`, "if (bodyBytes + attachmentBytes > limits.maxMessageBytes) {", "if (false) {", "message: size limit removed"],
  [`${L}/sendRequest.ts`, "} else if (idempotencyKey.length < 16 || idempotencyKey.length > 200) {", "} else if (false) {", "key: length unchecked"],
  [`${L}/sendRequest.ts`, "} else if (!/^[A-Za-z0-9._:-]+$/.test(idempotencyKey)) {", "} else if (false) {", "key: url-safety unchecked"],
  [`${L}/sendRequest.ts`, "if (value !== undefined && /[\\r\\n]/.test(value)) {", "if (false) {", "threading headers: line breaks allowed"],

  // --- store ---
  [`${L}/store.ts`, "if (existing.userId !== userId) return { state: \"in_flight\" };", "", "store: cross-user claim allowed"],
  [`${L}/store.ts`, "if (recent >= limits.maxSendsPerWindow) return { state: \"rate_limited\" };", "", "store: rate limit removed"],
  [`${L}/store.ts`, 'if (this.intentBroken) throw new Error("intent store unavailable");', "", "store: intent failure no longer surfaces"],
  [`${L}/store.ts`, 'if (!existing || existing.token !== token) throw new Error("stale fencing token");', "if (!existing) throw new Error(\"no entry\");", "store: fencing token unchecked"],
  [`${L}/store.ts`, 'if (existing.state === "settled") throw new Error("already settled, fencing refused");', "", "store: settle-once removed"],
  [`${L}/store.ts`, "const i = this.admitted.findIndex((a) => a.idempotencyKey === idempotencyKey && a.token === token);", "const i = this.admitted.findIndex((a) => a.userId === existing.userId);", "store: release removes wrong admission"],
  [`${L}/store.ts`, 'if (record.delivery === "not_attempted") return;', "", "store: not_attempted settles the key"],

  // --- relay ordering ---
  [`${L}/relay.ts`, "if (!(await deps.store.isSendingEnabled())) {", "if (false) {", "relay: kill switch inert"],
  [`${L}/relay.ts`, "if (!user) return json(401, { error: \"Not authenticated.\" });", "", "relay: authentication inert"],
  [`${L}/relay.ts`, "if (!validation.ok) return json(400, { error: \"Rejected.\", reasons: validation.reasons });", "", "relay: validation inert"],
  [`${L}/relay.ts`, "if (!outcome.ok && mayReleaseKey(outcome)) {", "if (!outcome.ok) {", "relay: any failure releases the key"],

  // --- zohoApi ---
  [`${L}/zohoApi.ts`, "if (!this.capabilities.multipleRecipientsPerField && recipientCount > 1) {", "if (false) {", "zoho: multi-recipient refusal removed"],
  [`${L}/zohoApi.ts`, "if (send.inReplyTo || send.references) {", "if (false) {", "zoho: threading refusal removed"],
  [`${L}/zohoApi.ts`, "if (send.attachments.length > 0) {", "if (false) {", "zoho: attachment refusal removed"],
  [`${L}/zohoApi.ts`, "if (!token.apiDomain) return notAttempted(REFUSALS.noApiDomain);", "", "zoho: missing api_domain unchecked"],
  [`${L}/zohoApi.ts`, "return [...defaults, ...vetted].map((o) => o.toLowerCase()).includes(origin);", "return true;", "zoho: host allowlist inert"],
  [`${L}/zohoApi.ts`, "fromAddress: send.sender.address,", "fromAddress: `${send.sender.displayName} <${send.sender.address}>`,", "zoho: fromAddress format regressed"],

  // --- http transport ---
  [`${L}/http.ts`, "if (origin && Object.keys(cors).length === 0) {", "if (false) {", "http: origin check inert"],
  [`${L}/http.ts`, "if (!origin || !options.allowedOrigins.includes(origin)) return {};", "if (!origin) return {};", "http: origin allowlist inert"],
  [`${L}/http.ts`, '"Access-Control-Allow-Origin": origin,', '"Access-Control-Allow-Origin": "*",', "http: wildcard CORS"],
  [`${L}/http.ts`, "if (!/^application\\/json\\b/i.test(contentType.trim())) {", "if (false) {", "http: content-type unchecked"],
  [`${L}/http.ts`, "if (size > MAX_BODY_BYTES) {", "if (false) {", "http: body cap removed"],
  [`${L}/http.ts`, "if (parsed === null || typeof parsed !== \"object\" || Array.isArray(parsed)) {", "if (false) {", "http: non-object body accepted"],
  [`${L}/http.ts`, "const match = /^Bearer ([^\\s]+)$/.exec(raw.trim());", "const match = [raw, raw.replace(/^Bearer /, \"\")];", "http: bearer scheme unchecked"],

  // --- reconcile ---
  [`${L}/reconcile.ts`, "    : inconclusiveBecause.length > 0\n      ? \"inconclusive\"\n      : \"ok\";", "    : \"ok\";", "reconcile: absence of evidence = ok"],
  [`${L}/reconcile.ts`, "const graceMs = Math.min(Math.max(0, input.graceMs), MAX_GRACE_MS);", "const graceMs = input.graceMs;", "reconcile: grace unbounded"],
  [`${L}/reconcile.ts`, "    ? new Set(input.officeCopies.messages.map((m) => m.correlationId))\n    : undefined;", "    ? new Set(input.officeCopies.messages.map((m) => m.correlationId))\n    : new Set();", "reconcile: failed listing = empty mailbox"],
  [`${L}/reconcile.ts`, "if (!isMatchable(send.correlationId)) {", "if (false) {", "reconcile: unmatchable counted as matched"],

  // --- extension ---
  [`${X}/relayClient.js`, "        ? httpOk && parsed && body.sent === true", "        ? httpOk", "ext: any 2xx is a send"],
  [`${X}/relayClient.js`, 'credentials: "omit",', "", "ext: cookies may be attached"],
  [`${X}/relayClient.js`, 'redirect: "error",', "", "ext: redirects followed"],
  [`${X}/relayClient.js`, 'if (typeof origin !== "string" || !origin.startsWith("https://")) {', "if (false) {", "ext: plaintext relay origin allowed"],
  [`${X}/corporateSend.js`, "if (result && result.ok === true && result.body?.sent === true) {", "if (result && result.ok === true) {", "ext: send flag not required at the top layer"],
  [`${X}/corporateSend.js`, 'if (result && result.body?.delivery === "unknown") {', "if (false) {", "ext: unknown delivery offered as retryable"],
  [`${X}/corporateSend.js`, "throw new Error(\"No cryptographic random source is available.\");", "return \"0123456789abcdef0123456789abcdef\";", "ext: predictable idempotency key"],
];

// Added by the 27 October self-audit.
M.push(
  [`${L}/sendRequest.ts`, "const normalised = filename.replace(/[.\\s]+$/u, \"\").toLowerCase();", "const normalised = filename.toLowerCase();", "attachments: trailing dot/space bypass restored"],
  [`${L}/sendRequest.ts`, "return parts.slice(1);", "return parts.slice(-1);", "attachments: only the last segment checked"],
  [`${L}/sendRequest.ts`, "if (UNSAFE_FILENAME.test(filename)) {", "if (false) {", "attachments: control characters allowed in a filename"],
  [`${L}/sendRequest.ts`, "\\u0000-\\u001f\\u007f]+@", "]+@", "recipients: two at-signs and control chars accepted again"],
  [`${L}/relay.ts`, "if (found.state === \"in_flight\") {", "if (false) {", "status: in-flight indistinguishable from unknown key"],
  [`${L}/relay.ts`, "if (outcome.delivery === \"unknown\") {", "if (false) {", "status: unknown delivery reported as not sent"],
  // DELETED deliberately after the fourth review, not left to rot: the override
  // no longer parses a URL and check its scheme, it string-matches against
  // ZOHO_KNOWN_ENDPOINTS, every entry of which is https. The property is now
  // guaranteed by the shape of the data rather than by a check, so there is no
  // check to mutate. `zohoApi.test.ts` asserts every endpoint is https, which
  // is the replacement for this line.
  [`${X}/corporateSend.js`, "if (result && result.ok === true && result.body?.sent === true) {", "if (result && result.ok === true) {", "ext: top-layer sent flag removed"],
  [`${L}/store.ts`, "if (!existing || existing.userId !== userId) return { state: \"unknown_key\" };", "if (!existing) return { state: \"unknown_key\" };", "store: cross-user inspect allowed"],
  [`${L}/relay.ts`, "const admission = await deps.store.admit(send.idempotencyKey, user.userId, deps.limits, now());", "const admission = await deps.store.admit(send.idempotencyKey, \"shared\", deps.limits, now());", "relay: admission not scoped to the user"],
);

const run = () => {
  try {
    execSync("npx vitest run services/mail-bridge/ --reporter=dot", { stdio: "pipe" });
    return true; // passed = mutation survived
  } catch {
    return false; // failed = caught
  }
};

// Added after Codex's third review.
M.push(
  [`${L}/store.ts`, "if (this.resolveExpired(idempotencyKey, existing, now)) {", "if (false) {", "status: inspect stops resolving an expired claim"],
  [`${L}/store.ts`, "if (now - entry.claimedAt < this.leaseMs) return false;", "if (true) return false;", "store: lease never expires"],
  [`${L}/zohoApi.ts`, ".filter((o) => candidates.some((known) => known.toLowerCase() === o));", ";", "zoho: escape hatch unvetted"],
  [`${L}/relay.ts`, "const found = await deps.store.inspect(idempotencyKey, user.userId, (deps.now ?? Date.now)());", "const found = await deps.store.inspect(idempotencyKey, user.userId, 0);", "status: clock frozen so a lease never expires"],
);

// Added after Codex's fourth review.
M.push(
  [`${L}/zohoApi.ts`, "candidates.some((known) => known.toLowerCase() === o)", "o.endsWith(\"zoho.eu\")", "zoho: override back to a suffix match"],
);

// Added after Codex's fifth review.
M.push(
  [`${L}/zohoApi.ts`, "return permits(candidate, ZOHO_ACCOUNTS_ORIGINS, ZOHO_KNOWN_ACCOUNTS_ENDPOINTS, overrides);", "return permits(candidate, [...ZOHO_ACCOUNTS_ORIGINS, ...ZOHO_API_ORIGINS], [...ZOHO_KNOWN_ACCOUNTS_ENDPOINTS, ...ZOHO_KNOWN_API_ENDPOINTS], overrides);", "zoho: accounts list merged with api (client secret to a Mail host)"],
  [`${L}/zohoApi.ts`, "return permits(candidate, ZOHO_API_ORIGINS, ZOHO_KNOWN_API_ENDPOINTS, overrides);", "return permits(candidate, [...ZOHO_API_ORIGINS, ...ZOHO_ACCOUNTS_ORIGINS], [...ZOHO_KNOWN_API_ENDPOINTS, ...ZOHO_KNOWN_ACCOUNTS_ENDPOINTS], overrides);", "zoho: api list merged with accounts (bearer token to accounts)"],
  [`${L}/zohoApi.ts`, "if (url.username || url.password) return false;", "", "zoho: userinfo credentials accepted"],
);

M.push(
  [`${L}/zohoApi.ts`, "  return `unidentified:${fallbackKey}`;\n}", "  return \"\";\n}", "zoho: unreadable 200 yields an empty id instead of a key-derived one"],
);

// Added after Codex's sixth review.
M.push(
  [`${L}/zohoApi.ts`, "export const ZOHO_ACCOUNTS_OVERRIDE_CANDIDATES = ZOHO_KNOWN_ACCOUNTS_ENDPOINTS;", "export const ZOHO_OVERRIDE_CANDIDATES = [...ZOHO_KNOWN_ACCOUNTS_ENDPOINTS, ...ZOHO_KNOWN_API_ENDPOINTS];\nexport const ZOHO_ACCOUNTS_OVERRIDE_CANDIDATES = ZOHO_KNOWN_ACCOUNTS_ENDPOINTS;", "zoho: the superseded combined export reappears"],
);

const survivors = [];
const stale = [];
let executed = 0;

for (const [file, find, replace, label] of M) {
  const original = readFileSync(file, "utf8");
  if (!original.includes(find)) {
    // Not a note. See the header: an unmutated control reads as a tested one.
    console.log(`STALE     ${label}  (pattern no longer in ${file})`);
    stale.push(label);
    continue;
  }
  writeFileSync(file, original.replace(find, replace));
  const survived = run();
  writeFileSync(file, original);
  executed += 1;
  console.log(`${survived ? "SURVIVED" : "caught  "}  ${label}`);
  if (survived) survivors.push(label);
}

console.log(
  `\n${M.length} mutations listed: ${executed} run, ${stale.length} stale, ${survivors.length} survived`,
);
for (const s of stale) console.log(`  STALE:    ${s}`);
for (const s of survivors) console.log(`  SURVIVED: ${s}`);

if (stale.length > 0 || survivors.length > 0) {
  console.log("\nFAILED. A stale mutation leaves a control unmutated while the summary implies otherwise.");
  process.exitCode = 1;
} else {
  console.log("\nPASSED. Every listed mutation ran and every one was caught.");
}
