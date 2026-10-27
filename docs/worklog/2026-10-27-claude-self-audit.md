# Self-audit of the mail bridge, before a third review — 27 October 2026, Claude

**Last verified:** 27 October 2026, Claude. Fourth worklog of the day.

Tasos asked for an A-to-Z re-check of my own bridge code before putting it to
Codex again. **Five defects, six unasserted properties, all fixed.** Head
`24c2a00b994900559c96d2e9c0bac66b803ccd11`; 236 tests in the service, 1,976
across the repository, **61 mutations with 0 surviving**.

## Why I did not just re-read it

Two rounds of review had found twelve findings in code I had read carefully, and
two of my own tests had asserted the defect they were written to catch. Reading
harder was not going to work. So the audit has an instrument in it.

## The instrument

[`services/mail-bridge/audit/mutation-sweep.mjs`](../../services/mail-bridge/audit/mutation-sweep.mjs)
applies 61 plausible defects one at a time — a control turned off, a check
inverted, a guard deleted — and requires the suite to fail for each. **A
mutation that survives is a property the code claims and no test asserts.**

That is the difference between this and what I had been doing. Re-breaking a fix
by hand shows the control is *reachable*; it says nothing about whether the
assertion is right, which is exactly how both bad tests passed. A sweep asks the
question for every control at once, including the ones nobody thought to doubt.

**The first run left six survivors.** One of them was my own test for a defect
Codex had found: it passed an array where the mutation only affected the
non-array branch, so it exercised the wrong path and would have passed against
the bug.

It is committed, with the reasoning in its header, so it is reproducible rather
than a claim. Not wired into `npm test` — it runs the suite once per mutation,
which takes minutes — and per `AGENTS.md` it is a diagnostic, not a merge gate.

## The five defects

**1. The status endpoint had the defect the whole send path was rebuilt to
avoid.** `handleStatus` answered an unknown delivery with `200 { sent: false }`
— a flat statement that the message was not sent, about the one outcome meaning
*we cannot tell*. Anyone acting on it resends. It also answered 404 both for a
key nobody had claimed and for one still in flight, so a person checking on a
send in progress was told it did not exist.

`sent` is now emitted **only when the answer is definite**; `state` and a
`guidance` sentence carry the rest, and an unknown has no `sent` field at all.
**Neither review covered this path** — both read the send path, and so had I.

**2. The attachment blocklist could be stepped around four ways.**
`evil.exe.` read as having no extension, and **Windows strips a trailing dot**,
so the saved file is `evil.exe`. `evil.exe ` read as `"exe "`; Windows strips
trailing spaces too. `evil.exe..` likewise. `evil.exe\u0000.pdf` read as a PDF
while a C-string parser downstream sees `evil.exe`.

Filenames with a control character or path separator are refused outright,
trailing dots and whitespace are stripped before splitting, and **every**
extension segment is checked. That over-blocks `quote.exe.pdf` on purpose: a
false positive costs a rename, a false negative is an executable sent under the
company's authenticated identity.

**3. `a@b@c.gr` passed as one address** — in a regex whose documented job is
rejecting what could smuggle a second recipient. Control characters in the local
part passed too.

**4. `lookup` was dead code holding a live-looking security check.** `inspect`
replaced every caller, so its user-scoping branch was unreachable. **An
unreachable security check is worse than none**: it reads as protection while
protecting nothing. Deleted rather than left in place.

**5. Two redundant guards made each other untestable** — the most transferable
finding. `isZohoHost` checked the protocol *and* filtered the allowlist to https
entries. Each masked the other, so removing either changed no behaviour and
failed no test. **Two redundant checks are not twice as safe; they are one check
and one untested line.** One gate now. The credential check beside it stays,
because it is genuinely load-bearing: `url.origin` omits userinfo, so
`https://user:pass@mail.zoho.eu` has a permitted origin and would otherwise pass.

## Two stale comments

One claimed threading headers were preserved, which stopped being true when the
trapdoor was removed. And `maxRecipients: 20` now says out loud that the
client's effective limit is 1 until somebody proves Zoho accepts two — the two
numbers looked like a contradiction and were not.

## What this does not change

**W68 stands untouched.** No durable store, no authenticator, no deployable
endpoint, no separate credential boundary, no Gmail integration or extension
build, `relay.invalid` still the destination, no scheduled reconciliation or
alerts, no controlled distribution. Five more defects fixed is not a bridge.

**And the sequencing is unchanged:** W68 first, then a credential-free separately
deployed test shell, and no Zoho credentials — not even test ones — until that
exists and has been reviewed. §6.2's boundary, E39 and the red-check rule are
untouched by any of today.

## What I would still not claim

That the code is correct. The sweep proves every control I thought to list is
asserted by something; it cannot prove the list is complete, and the three
rounds so far suggest it is not. What it does is make the next round's findings
likely to be about design rather than about controls that were never wired up.
