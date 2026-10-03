# Expected production changes

**Last verified:** 3 October 2026, Claude.

A **declaration, committed before the paste**, that one specific production change
is expected. The nightly production check treats a change with a valid marker as
explained, and everything else as unexplained.

## Why not "every production change must match a merge commit"

Because `AGENTS.md` forbids an agent applying a Supabase migration: a human pastes
it into the SQL editor. So legitimate schema changes routinely have **no automated
trail**, and that rule would have fired on every one of the 45 migrations here.
**An alarm that cries wolf monthly gets muted, and a muted alarm is worse than
none, because it still looks present.**

Proposed by Codex in the 3 October adversarial review, which is where the field
list comes from.

## The format

One JSON file per expected change, named for the migration:

```json
{
  "migration": "20260923120000_grant_service_role_post_023_tables.sql",
  "sha256": "<64-hex digest of that file>",
  "expected_objects": ["grant select", "service_role"],
  "operator": "Tasos",
  "declared": "2026-10-03",
  "expires": "2026-10-17",
  "applied": null
}
```

Get the digest with:

```bash
shasum -a 256 supabase/migrations/<file>
```

## The three rules that make it mean something

**Declared before, never after.** A marker committed afterwards would explain
anything, including a change nobody intended. The ordering is the control.

**The hash is checked against the file.** Without it the marker says only "some
change to this file is expected", which an edited migration satisfies just as well
as the reviewed one. `lib/migrationPasteParity.test.ts` already holds the migration
and its SQL-editor copy to each other; this holds both to the exact bytes that were
declared — and migration 033 is the precedent for a paste copy drifting after
review.

**Expiry makes an unapplied marker escalate itself.** A declaration sitting past
its own date is either a forgotten migration or one applied without the record
being closed. Both fail. `DEFINING-STATEMENTS.md` §12 requires dated items to be
checked against the calendar rather than carried forward; this is that rule as a
test.

## Closing one

Set `applied` to the date or ISO timestamp it was run. The marker then stops being
checked against the calendar and stays in place as history, so a change seen in the
audit log weeks later can still be explained.

A closing value must be a date that **could have happened**: a real calendar date,
not in the future, not before the declaration. Until 3 October 2026 any non-empty
string closed a marker — `applied: "yes"` switched off the expiry rule, which is
the only part of this mechanism that escalates on its own. Codex found it; the
dated fields shared the same shape-only check, so `expires: "2026-99-98"` was a
marker that could never expire.

## What this does NOT yet do

Listed because the paragraphs above read as a finished control and it is not one.
Each of these was proposed in the 3 October review and none is built:

- **No 24-hour window.** `expires` is whatever the declaration says, so a marker
  can authorise a paste a fortnight out.
- **No immutable production identifier**, no approval identity beyond a free-text
  `operator` field, no rollback reference, and no statement of the expected
  *effect* — only the objects named in the SQL.
- **Not consume-once.** A marker stays valid until it expires or is closed by
  hand, so two pastes of the same migration are equally explained.
- **And it explains rather than permits.** Nothing about a marker gates the paste
  itself; `AGENTS.md` keeps that with Tasos. What the marker does is let the
  nightly check tell an expected change from a surprise — and it only works if
  someone is reading the nightly check, which is W31 and not yet in place.

## What enforces this

`tests/expectedProductionChange.test.ts`, in `npm run verify:fast`. Sixteen cases,
most of them exercising the validator against declarations that **must** be
rejected — because a test that only checked the markers that happen to exist would
pass on an empty directory, report clean, and be believed. Both load-bearing rules
were mutation-tested: removing the hash comparison or the expiry escalation makes a
test fail. The four added on 3 October — the ones covering invalid closing
values and impossible dates — were each watched failing against the pre-fix
validator before being trusted, per the fail-first rule in `AGENTS.md`.

**There are no markers committed yet.** The format exists; nothing is pending.
