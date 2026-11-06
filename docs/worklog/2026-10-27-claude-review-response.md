# Response to Codex's mail bridge review — 27 October 2026, Claude

**Last verified:** 27 October 2026, Claude. Companion to
[`2026-10-27-claude.md`](2026-10-27-claude.md), written separately because that
file was already the day's record when the review arrived.

**Verdict accepted in full. Ten findings, ten upheld, all fixed.** Branch
`claude/mail-bridge-stage-1`; 203 tests in the service, 1,943 across the
repository; the pull request stays a draft.

The findings themselves are in Codex's own words in §8 of
[`REVIEW-BRIEF-MAIL-BRIDGE-STAGE-1.md`](../REVIEW-BRIEF-MAIL-BRIDGE-STAGE-1.md),
and my response is §9 of the same file. This worklog records what the day's work
*was*, and the three things worth carrying forward.

## What was fixed

| Finding | Fix |
|---|---|
| 1 — ambiguous outcome could duplicate | Four delivery states (`sent`, `not_attempted`, `rejected`, `unknown`); **only `not_attempted` releases a key** |
| 2 — audit not fail-closed | Write-ahead `recordIntent` **before** the send; `INTENT_FAILURE_BLOCKS_SEND` |
| 3 — extension cannot reach the relay | `host_permissions` names the relay origin, asserted to match the worker's constant |
| 4 — any 2xx read as a send | The relay's own `sent: true` required; an unrecognised 2xx is named as such |
| 5 — threading flag was a trapdoor | Flag removed; the refusal is unconditional |
| 6 — rate limit not atomic | One `admit` doing the volume check and the claim together |
| 7 — timeout unused, keys strandable | Real deadline; abort is `unknown`; claim leases with fencing tokens |
| 8 — credentials to any host | Zoho host allowlist, matched on labels, https only |
| 9 — `fromAddress` format | The bare associated address, as documented |
| 10 — env-var kill switch not immediate | Documentation corrected; the code already read it at runtime |
| extra — unbounded grace | `MAX_GRACE_MS`, clamped rather than rejected |

Six were proved by re-breaking them in this working copy: ambiguous outcomes
made releasable again fails 4 tests; the intent moved back after the send fails
3; admission split into two steps fails 2; the relay host dropped from the
manifest fails 2; any-2xx-is-a-send fails 4; the credential host checks removed
fails 2.

## Three things to carry forward

**A correct argument about the wrong mechanism.** Finding 1's error was not
carelessness; it was a comment I was pleased with. It reasoned precisely about
what the idempotency key guarantees inside the relay and never asked what the
key means to Zoho, where it means nothing. **The lesson is to name the party a
guarantee is binding on.** A property of our own state is not a property of the
exchange.

**A named constant asserting a property is not the property.**
`AUDIT_FAILURE_BLOCKS_SEND = true`, with a paragraph of reasoning beside it,
blocked nothing — the send had already happened. This is the same shape as the
five instruments this project has recorded that reported success because they
asked the easy question, and it appeared in code written specifically to avoid
it.

**A flag with no implementation behind it is a trapdoor, not a conservative
default.** I believed the capability flags were the careful part of the design.
For threading there was no request shape behind the flag, so enabling it could
only remove the refusal — producing exactly the silent failure the refusal
existed to prevent.

And the one that stings: **findings 3, 9 and 10 are §8 applied to Zoho and not
to myself.** I refused everything Zoho does not document, then formatted
`fromAddress` in a way it does not document; wrote that a configurable relay
origin is an exfiltration target, then left the credential destinations
unchecked; argued the kill switch needed no deploy without reading that Vercel
applies variable changes only to new deployments.

## One correction offered back, as an addition rather than a disagreement

Finding 10 recommends runtime-read durable configuration for the kill switch.
Correct — and the code already did it: `BridgeStore.isSendingEnabled()` is read
on every send. `CONFIGURATION.md` invented `RELAY_SENDING_ENABLED` and called it
immediate. So the fix is a documentation change, and the direction matters:
someone correcting the code towards the broken description would have made the
switch worse.

## A collision that was structural, not careless

Codex's open-items entry was numbered **W64**, which is free on `main` but taken
on `claude/pr59-collaboration-lwcnia` (the Cloudflare/R2 concentration item),
where **W65** is the bridge build. Both branches were numbering from the same
base, so the clash was inevitable rather than sloppy — and
`tests/openItemsIntegrity.test.ts` would have failed on the merge, which is the
one guard this project has against exactly this. Renumbered to **W66** on the
review branch with the reason recorded, and **W67** added for the fixes.

He also flagged that §5 of the brief referenced `OPEN-ITEMS.md` W65, which does
not exist on that branch. Correct, and mine: the brief now says which branch
holds it.

## What I asked for on the next pass

The **assertions**, not the controls. Six of these fixes were proved by
re-breaking them, which shows a control is reachable and says nothing about
whether the test asserts the right property. That is the failure mode this
project has hit twice, and it is the one I cannot check by myself.

## Unchanged

**Still not for merge.** §6.2's credential boundary is unmet, **E39 is
undecided** and the recommendation there is unchanged, and the red-check rule
stands. None of today's work touches any of the three.
