# What Tasos has to do, in order

**Last verified:** 3 October 2026, Claude — **step 1 is done** (reported by Tasos), which makes step 6 moot rather than pending. Steps 2 and 3 are now the two that matter most. Every command here was run, or run in
a rehearsal that exercised the same code — see **Rehearsed or not** on each step.

This is the steps, not the reasoning. The reasoning is in
[`CONSOLIDATED-2026-10-03.md`](CONSOLIDATED-2026-10-03.md) §8–9 and section 17 of
[`../STAGING-AND-OBSERVABILITY-RUNBOOK.md`](../STAGING-AND-OBSERVABILITY-RUNBOOK.md),
and documentation on the subject is **frozen** until the items below have run and
fired. This file is the exception the freeze exists for: it is what to type.

**Order is by value, not by effort.** 1 and 2 are the two that make everything
else worth having. If you do nothing else this week, do those.

Where a step says **send me**, paste the output back and I will act on it the
same session.

---

## 1 · ~~No standing production session in the agent's browser~~ — E28 · **DONE 3 October**

**Why first.** Every control built this week watches *tool calls*. A click in a
logged-in production dashboard is not a tool call, so none of them sees it. This
is the only step that removes the path rather than watching it, and it needs no
software.

1. Open Chrome, the profile Codex drives.
2. Go to <https://supabase.com/dashboard> → avatar → **Sign out**.
3. Same for <https://vercel.com> → avatar → **Log out**.
4. Decide where *your own* production access lives from now on. Two options and
   the second is better:
   - a **separate Chrome profile** for your own work (Chrome → profile icon →
     *Add profile*), leaving the agent's profile signed out; or
   - a **different browser entirely** for production consoles — Safari or
     Firefox — which cannot be reached by Codex's extension at all, because the
     extension is installed per Chrome profile.
5. In the agent's profile, confirm the sign-out stuck: open
   <https://supabase.com/dashboard> and check you land on a login page.

**DONE, reported by Tasos on 3 October.** The agent's Chrome profile is signed out of both production dashboards. **One line still outstanding:** which arrangement replaced it — a second Chrome profile, or a different browser. It matters, because Codex attaches through an extension installed *per Chrome profile*: a different browser is out of its reach entirely, while a second profile is only as good as the extension not being installed in it.

**Rehearsed or not:** not applicable — no code involved. The claim that Codex's
attachment is per Chrome profile is from the Codex documentation, read 3 October.

---

## 2 · Put the gate where an agent cannot edit it — W34

**Why second.** The gate currently lives at a path inside the workspace Codex
may write, and the rule protecting it is enforced by the gate itself. Fable's
review called that circularity the thing that dissolves every other boundary,
and it is right.

In a terminal, from a **current** checkout (see step 7 — not the stale Desktop
one):

```bash
cd ~/Documents/GitHub/anadyon
git fetch origin main && git checkout main && git pull
sudo bash scripts/install-managed-gate.sh
```

**Two rules for every command in this file, both learned the hard way on
3 October.**

**Never a placeholder inside a code block.** A line like
`tail -2 <the path it printed>` is instructions wearing the clothes of a
command, and it gets pasted verbatim — it produced `zsh: parse error near '\n'`.
Anything in a fenced block here is literal and runnable as written; where a value
has to be substituted, it is named in the prose above the block and the block
carries a real example.

**Paste one line at a time, and never with a trailing comment.**
Interactive `zsh` does **not** treat `#` as a comment by default, so a line like
`cd ~/path   # or wherever` passes the comment words to `cd` as arguments and
fails with `cd: too many arguments` — leaving you in the previous directory
while the rest of the block runs there anyway. **That happened on 3 October**
with the first version of this step: the `cd` failed, the `git pull` ran in a
different checkout, and the install then looked for a script that was not in it.
Every command in this file is now comment-free for that reason.

If your current checkout is somewhere else, substitute the path in the first
line. Step 7 is how you find out which one is current.

The script copies the gate and the library it imports to
`/usr/local/lib/anadyon-gate/`, owned by root; writes
`/Library/Application Support/ClaudeCode/managed-settings.json` from the
reviewed template, pointing the hook at the **root-owned** copy; and then fires
two real events through the installed copy — one that must be denied, one that
must not be. It refuses to finish if either comes out wrong.

Then check what it cannot check for you:

```bash
ls -l /usr/local/lib/anadyon-gate/.claude/hooks/production-gate.mjs
```

The owner in that line must be **root**. If it is your own username, the gate is
still editable by an agent running as you and nothing has changed.

and in a **new** Claude Code session, because managed settings are read at
startup:

```
/doctor      # names the settings files that were loaded
/hooks       # the gate should appear, from the managed source
```

**Send me:** the owner line from `ls -l`, and whether `/hooks` lists the gate.

**Optional, and deliberately not done by the script:** adding
`"allowManagedHooksOnly": true` to the managed file makes the managed hook the
*only* hook that runs, which is the stronger control. The setting exists — it is
in the settings reference — but the page listing exactly what it stops was
truncated when I read it, so its effect here is **unverified**, and it would
also stop your own `~/.claude` stop-hook unless that moves into the managed file
too. Try it after step 2 is working, not during.

**Rehearsed or not:** **rehearsed.** The copy layout, the template rendering and
both live firings were run in this container against a temporary directory: the
copied gate resolves its import, the rendered hook path exists, the deny grep
matches the gate's real output, and staging produces nothing.
`tests/managedGateTemplate.test.ts` holds the template to the project's own deny
rules in CI. The macOS-only parts — the managed-settings path and `chown root` —
cannot be rehearsed on Linux and are from the documented path, read 3 October.

---

## 3 · Staging's live email configuration — E32

**Why here.** This was live this morning. Staging was allowed to hold a Resend
key with nothing saying where it may send, so a staging deployment could email a
real customer a real-looking booking confirmation, and no control in this
project would have seen it. The code rule is in as of today; the **live
configuration has never been read**.

1. <https://vercel.com> → the anadyon project → **Settings** → **Environment
   Variables**.
2. Look for `RESEND_API_KEY` and `MAIL_REDIRECT_TO` and note which environments
   each is set for (Production / Preview / Development).
3. If `RESEND_API_KEY` exists for Preview and `MAIL_REDIRECT_TO` does not:
   - either **add** `MAIL_REDIRECT_TO` = one address you own, scoped to Preview;
   - or **remove** `RESEND_API_KEY` from Preview.
   Production must keep its key and must **not** get a redirect.
4. Redeploy staging so the change takes effect.

**Send me:** which of the two it was, and whether the key had been present —
because a key that was present is a key that may have sent something, and if so
I will check Resend's log for what left.

**Rehearsed or not:** the code rules are tested, both watched failing with the
rule removed. The Vercel dashboard steps are not rehearsable; they are from the
Vercel console's own layout.

---

## 4 · One query to unblock `pgaudit` — W31

**Why it matters.** The nightly fingerprint sees structural change. It cannot
see a **read**: selecting every customer row changes no state. `pgaudit` is the
only thing that sees one, and on Supabase it is configured **per role** —
auditing the wrong role gives a log that is empty on exactly the activity it was
installed for.

You sent the **second** query's output earlier (the role list, now recorded).
This is the **first** and **third**, and the first is the one that decides.

In the production **SQL editor**:

```sql
select current_user, session_user, current_setting('role', true) as role_setting;

select r.rolname, s.setconfig
  from pg_db_role_setting s
  join pg_roles r on r.oid = s.setrole
 where array_to_string(s.setconfig, ',') like '%pgaudit%';
```

Then run the **first** statement again from the **table editor** — open any
table, and use whatever query box it offers — because the table editor goes
through PostgREST and may answer differently.

**Send me:** both answers, and say which editor each came from. With them, the
migration and its byte-identical paste copy take about an hour, and it will be
the first change to carry an expected-change marker.

**Rehearsed or not:** the queries are read-only catalog reads and were run
against a replayed Postgres in this container. `current_setting('role', true)`
returning null is a normal answer, not an error.

---

## 5 · Read the first fingerprint report — W36

The nightly job runs at **00:10 UTC** and has never run against production, so
its first report is both the finding and the proof the job works.

1. <https://github.com/anadyongr-droid/anadyon/actions> → **Nightly production
   fingerprint** → the most recent run.
2. Read the **step summary** on the run page; the full report is the
   `production-fingerprint` artifact, kept 30 days.

Three outcomes, each meaning something different:

| What you see | What it means |
|---|---|
| green, no Telegram | production matches the migrations — the first independent confirmation of that |
| **NOT RUN** | a secret is missing or `psql` could not read a catalog; the message names which |
| a wall of `high` rows | most likely Supabase's catalogs differing from PGlite's. **First-run noise, not an incident** — send it to me and I narrow the query |
| a `critical` row | a table other than `rates`/`extras_config` is readable by the anonymous key. Revoke the grant before anything else |

**Send me:** the step summary, whatever it says.

**Rehearsed or not:** the comparison is tested 28 ways, including that it is
silent when production matches and that a seeded customer value never reaches
the output. It has **never run against production** — §8, recorded as not run.

---

## 6 · The Chrome path test, for the record — E29

**Downgraded.** Fable calls this one before it runs and I accept the reasoning:
Chrome's `URLBlocklist` is checked on a real navigation, and the Supabase
dashboard is a single-page app whose data comes from a different host — so a
path rule catches a typed URL and a reload and nothing else, while also blocking
you, because policy is per machine and not per profile. Step 1 makes it moot.

Five minutes if you want the fact on the record:

```bash
sudo defaults write com.google.Chrome URLBlocklist -array \
  "supabase.com/dashboard/project/idfavwwfiuncoudkcfsp"
```

Then in Chrome: `chrome://policy` → **Reload policies**, confirm the rule is
listed, and try (a) typing the production project URL, (b) navigating to it from
inside the staging dashboard by clicking through the project switcher. If (a) is
blocked and (b) is not, the finding is confirmed and the mechanism is not worth
keeping.

Undo:

```bash
sudo defaults delete com.google.Chrome URLBlocklist
```

**Send me:** which of (a) and (b) were blocked.

**Rehearsed or not:** **not rehearsed and not rehearsable here** — it needs
Chrome and the real dashboard. The `defaults write` form is from the Chrome
enterprise policy documentation, read 3 October.

---

## 7 · One checkout per machine — E30

`~/Documents/GitHub/anadyon` was **85 pull requests stale** on 3 October: no
production gate, no deny rules, and governance files predating two of the
project's own principles. It was also the only path an agent trusted. Fable's
search adds that the only local copy it could find is a frozen one on the
Desktop.

```bash
cd ~/Documents/GitHub/anadyon && git fetch origin main && git status -sb
```

If it is behind, bring it current (`git checkout main && git pull`), and delete
or clearly rename any other `anadyon` folder you are not using — including
`~/Desktop/anadyon` if it is the frozen copy.

**Send me:** the `git status -sb` line.

**Rehearsed or not:** read-only git commands; the staleness was measured on
3 October.

---

## 8 · The grep that decides the transcript control — W37

The root-owned transcript copy is the one control that does not depend on hooks
at all, so it survives an agent surface with no usable hook point. Its whole
value rests on one unverified fact: whether the ChatGPT desktop app's session
files contain **browser** actions, or only shell and file tool calls.

```bash
ls -la ~/Library/Application\ Support/ | grep -i -E "chatgpt|openai"
# then, inside whichever directory that names:
grep -ril "supabase.com/dashboard" ~/Library/Application\ Support/ChatGPT 2>/dev/null | head
```

**Send me:** whether anything matched, and the name of the directory that holds
the session files.

**Rehearsed or not:** not rehearsable — the paths exist only on your Mac.

---

## 9 · Two that were already on the list and are not mine to do

- **W29 — a scoped, staging-only Supabase token** for agent access. Note from
  the role inventory you sent: `supabase_read_only_user` already exists, so this
  may need neither creating nor a paid plan. It **bypasses RLS**, so it reads
  every customer row: wrong for production, plausible for staging. Check before
  use.
- **The restore drill** (E23 in the environment block): eight nightly archives
  decrypt and list, and **no full restore has ever been performed**. Fable's
  answer on spend was "no required spend — Supabase Pro only if the restore
  drill shows the recovery story is thin", which means the drill is what decides
  a money question.

---

## What I do once you send things back

| You send | I do |
|---|---|
| step 4's two answers | write the `pgaudit` migration and its paste copy, for you to apply |
| step 3's answer, if a key was present | check what left, and say so plainly |
| step 5's report | act on it: narrow the query, or raise what it found |
| step 6's result | close E29 with the fact either way |
| step 8's result | design the transcript pull, or record that it cannot see the path that matters |
