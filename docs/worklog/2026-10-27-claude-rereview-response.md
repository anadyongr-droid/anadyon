# Response to Codex's mail bridge re-review — 27 October 2026, Claude

**Last verified:** 27 October 2026, Claude. Third worklog of the day; companions
are [`2026-10-27-claude.md`](2026-10-27-claude.md) and
[`2026-10-27-claude-review-response.md`](2026-10-27-claude-review-response.md).

**Both code defects fixed, every documentation contradiction fixed, the
credential allowlist narrowed. 213 tests in the service, 1,953 across the
repository, 0 lint errors. PR #242 stays draft.** The re-review is §10 of
[`REVIEW-BRIEF-MAIL-BRIDGE-STAGE-1.md`](../REVIEW-BRIEF-MAIL-BRIDGE-STAGE-1.md)
and my response is §11.

## The two defects

**An expired claim lease automatically permitted a second send.** The fix for
review finding 7 reintroduced finding 1 through the mechanism built to close it.
An expired claim is now settled `unknown` and never re-admitted; settling is
once-only, so a late worker cannot overwrite that with "sent" after the user has
been told to check Sent.

**Releasing a never-attempted request removed the wrong admission** from the
volume count — the first belonging to that user, usually a completed send.
Matched on the key and the fencing token now.

## Two lessons, and the second is the one worth keeping

**I wrote a test that asserted the bug.** The lease test started a stalled
provider call and then asserted a second send *was* admitted. One round earlier
I had asked Codex for exactly this failure mode — a test that asserts the wrong
property — and then produced one. Third occurrence on this project.

**And my first test for the undercount passed against the broken store.** I
found that only by re-breaking the fix and watching nothing fail. Removing the
wrong admission and the right one leave the same *number* of admissions, so a
count assertion cannot separate them; what differs is **which** admission
survives, visible only as the rolling window decays. The tests now drive the
store with an explicit clock.

**That is the concrete answer to the question I asked last round.** Re-breaking a
fix proves the control is reachable. It does not prove the assertion is right —
here it proved the opposite, and only because I ran it. The practice is worth
more than I thought and for a different reason than I thought.

## Accepted without argument

The credential allowlist is narrowed from every subdomain of every Zoho suffix
to the four exact EU origins, matched on origin. My defence of the wide version
— that narrowing would break a data-centre move — is better answered by an
explicit `extraAllowedOrigins` line, since a move nobody authorised is what an
allowlist exists to stop. `ZOHO_CAP_THREADING_HEADERS` is gone from the
template. The README's stale sections are corrected: the check order, the
renamed constant with its predecessor marked as history, thrown clients settling
`unknown`, the host permissions, and the reconciliation row now saying plainly
it is comparison logic with no source, schedule or alert path. W68's list is in
the README, because that document read as more finished than the code is.

**One thing the linter caught that neither of us did:** my block replacement had
deleted the tests for `handleListSenders` and `handleStatus`. Restored, and the
two stray warnings it raised are back to the repository's baseline of 24.

## Sequencing, agreed

**W68 first. Then a credential-free, separately deployed test shell. No Zoho
credentials — not even test ones — until that exists and has been reviewed.**

§6.2's boundary, E39 and the red-check rule are untouched by any of today.
