# Review brief: mail bridge Stage 1

**Last verified:** 27 October 2026, Claude — written for Codex's pass on commits
`7c3c88a`…`a1f3082` of `claude/pr59-collaboration-lwcnia`.

**Who this is for.** Codex, as reviewer. I wrote the code, so I am not the one
to say whether it is right. This brief is adversarial on purpose: it points at
what I am least sure of rather than at what I am pleased with, because a review
steered towards the good parts is worth nothing.

**Role, per `AGENTS.md`.** I held implementer. This asks you to review, not to
rebuild: where you think a design is wrong, say so and why, and leave the
blueprint note to whoever holds architect next.

---

## 1. What this is, in three sentences

`services/mail-bridge/` is the relay from the Gmail/Zoho office-mail proposal
(yours, PR #241, **unmerged** — the review verdict was *revise and re-review*,
in `REVIEW-GMAIL-ZOHO-BRIDGE-PROPOSAL.md`). Tasos instructed on 26 October to
build the bridge, and on 27 October to finish it end to end and have you review
it. **E39 is still undecided and my recommendation in it is unchanged** — the
bridge is the most expensive of the three options once maintenance is counted —
so this is engineering that removes unknowns from one side of that comparison,
not a decision that it is the option to take.

## 2. The claims I am making, so you can try to break them

Everything below is a claim about the code at `a1f3082`, not an aspiration.

1. **Nothing irreversible happens before every refusal has run.** The order in
   `lib/relay.ts` is kill switch → authentication → validation → rate limit →
   idempotency claim → send → audit → settle. Two positions are load-bearing:
   the kill switch precedes authentication, and the rate limit precedes the
   claim.
2. **The sender is never defaulted.** A request without an explicitly
   allowlisted sender is refused, per the review's HIGH 3.
3. **An audit failure blocks the send** (`AUDIT_FAILURE_BLOCKS_SEND`).
4. **Where Zoho's documentation is silent, the client refuses rather than
   guesses** — multiple recipients, threading headers, attachments.
5. **No upstream text, token or internal hostname reaches a caller.**
6. **A comparison with nothing in it is never reported `ok`** by the
   reconciliation detector.
7. **The extension never falls back to Gmail's own Send**, for every failure
   shape including a thrown messenger.
8. **One user cannot read or take another user's idempotency key.**

Each has tests. Several were proved by breaking the code and watching the test
fail in this working copy — the table is in
[`worklog/2026-10-27-claude.md`](worklog/2026-10-27-claude.md). **A test I
proved is still a test I wrote**; if one asserts the wrong property, it passes
and proves nothing, and that is the failure mode this project has hit twice.

## 3. Where I would look first if I were you

Ranked by what I think is most likely to be wrong.

1. **`InMemoryBridgeStore.claim` claims atomicity it cannot demonstrate.** The
   comment argues that a `get` followed by a `set` with no `await` between them
   is atomic within one event-loop turn, and that this is honest about what a
   real store must provide. Is that argument sound? And is the interface
   actually implementable as stated on the store Stage 2 would use — is
   `INSERT … ON CONFLICT DO NOTHING` enough for the three-state return, or does
   `in_flight` versus `settled` need a second read that reintroduces the race?
2. **The audit fail-closed path settles the key and returns 500.** Look at
   `relay.ts` step 7. If the audit throws, the message may already have left,
   so the key is settled to prevent a resend and the user is told to check
   Zoho's Sent folder. **That is a deliberate trade and it may be the wrong
   one**: it converts an unrecorded send into a permanently unretryable one. Is
   there a shape that keeps attribution without stranding the message?
3. **`extractMessageId` returns `unidentified:<key>` on a 200 with no readable
   id, and the send is reported successful.** The reasoning is that reporting
   failure would release the key and send a duplicate. But the detector then
   classifies that send `unmatchable`, so a relay that *always* gets an
   unreadable envelope would produce a permanently `inconclusive` detector and
   no alert. Is `inconclusive` forever actually distinguishable from working?
   I think this is the weakest link in the whole design.
4. **The capability flags could be turned on by someone who tested the easy
   case.** `multipleRecipientsPerField` is proved by watching a two-recipient
   message arrive at both addresses. Is two enough? Does a `cc` behave as a
   `to` does? The flag is one boolean covering three fields.
5. **The transport allows a request with no `Origin` header.** The reasoning is
   that this is a server-side caller or `curl`, not a browser. Is that safe
   here, given the only legitimate browser caller is the extension? A stricter
   rule would require the origin always, and I may have chosen convenience.
6. **`redirect: "error"` and `credentials: "omit"` in `relayClient.js`** are
   asserted by tests, but those tests assert the *arguments passed to a fake
   `fetch`*, not the browser's behaviour. Is there a way those options are
   wrong or insufficient that an injected-fetch test cannot see?
7. **The grace period in the detector is caller-supplied with no floor.** A
   caller passing a very large `graceMs` would make every send permanently
   `pending` and the detector permanently `inconclusive` — which, per point 3,
   may not alert. Should the module refuse an unreasonable value?

## 4. Specific questions, where a yes/no is more use than prose

1. Is the three-state `claim` the right interface, or does it leak a decision
   the relay should be making?
2. Does any refusal path leave an idempotency key in a state where a legitimate
   retry is refused forever? I believe the audit-failure path does, deliberately
   (point 2 above). Are there others I have not seen?
3. `handleListSenders` has no kill-switch check, because it is read-only. Is
   that right, or should the kill switch mean *the bridge is off* rather than
   *sending is off*?
4. The reconciliation detector counts `unexplainedOfficeCopies` but never
   alerts on them, on the grounds that the office mailbox legitimately receives
   other mail. Is there a threshold at which that reasoning stops holding?
5. Is there anything in `sendRequest.ts` that a crafted request gets past? That
   file is the whole boundary and it has 36 adversarial tests, which means I ran
   out of ideas, not that there are none left. Specifically: the address regex,
   the attachment-extension blocklist, and the line-break checks on `subject`,
   `inReplyTo` and `references`.
6. Does the HTTP transport's refusal order leak anything by timing or by status
   code? An unknown origin gets 403 before the method is examined; is there a
   case where 403-versus-405 tells a caller something?
7. **The one I would most like a second opinion on:** the client refuses to send
   a reply carrying `In-Reply-To` because Zoho documents no field for it. The
   alternative is to send it unthreaded, which breaks the customer's thread
   silently. I read refusing as the §13-correct choice — a broken thread is a
   customer-visible change — but refusing also means the bridge cannot reply to
   anything until that question is answered, which is most of its purpose. Is
   refusing right, or is this me preferring a safe no-op to a judgement call?

## 5. What is deliberately not built, so it is not a finding

- **The Gmail DOM selectors.** Stage 2, where a test account can exercise them.
  The only remaining promise in the extension.
- **A build step** inlining the extension modules into `content.js`. The seam is
  named in that file; a half-done build fails loudly rather than looking like a
  retryable send failure.
- **Attachment upload.** Blocked by our own request type: `Attachment` carries a
  byte count, not the bytes, because the validator never needed them. Widening
  it is a Stage 2 change.
- **Extraction to its own repository and credential boundary.** §6.2 requires
  it, this directory does not satisfy it, and the README says so. It is a
  precondition of Stage 2, not a tidy-up afterwards.
- **A durable store.** `InMemoryBridgeStore` loses everything on restart, which
  is why it is Stage 1 only.
- **The four observations only Tasos can make**, in `OPEN-ITEMS.md` W65.

## 6. How to run it

```
npx vitest run services/mail-bridge/     # 175 tests
npm run verify:fast                      # 1,915 tests, 0 lint errors
```

The service imports nothing from `lib/`, `app/` or `scripts/`, and
`lib/boundary.test.ts` inside it fails if that changes.

## 7. What I would find most useful back

In this order: a claim from §2 that is false; a refusal path that strands a
legitimate retry; a test that asserts the wrong property; and a design decision
in §3 you think is simply wrong. A finding with a failing test behind it is
worth more than ten without, and *"this is fine"* on a point you did not check
is worse than silence — say which of these you did not look at.

Per `DEFINING-STATEMENTS.md` §11, whatever you find goes into the document that
owns the subject and into `OPEN-ITEMS.md`, not only into a reply.
