#!/bin/bash
# Installs the production gate where the agents cannot edit it. Run with sudo.
#
#   sudo bash scripts/install-managed-gate.sh
#
# WHAT THIS IS FOR — open item W34, and Fable's round-two review put it second
# in the order of work for a reason that is hard to argue with: today the gate
# lives at a path inside the workspace Codex may write, and the rule protecting
# it is enforced by the gate itself. Every other control defends a boundary that
# this one circularity dissolves. Root ownership is the fix, and it is the only
# one on the list that cannot be done by an agent — which is the point.
#
# WHAT IT DOES
#   1. copies the gate and the library it imports to a root-owned directory,
#      keeping their relative layout, because the gate imports
#      ../../scripts/deployment-boundary-lib.mjs and a flat copy breaks it;
#   2. writes /Library/Application Support/ClaudeCode/managed-settings.json from
#      the reviewed template in docs/agent-controls/, pointing the PreToolUse
#      hook at the ROOT-OWNED copy;
#   3. fires one event through the installed copy to prove it denies production,
#      and one to prove it leaves staging alone.
#
# DIRECTION OF TRUST. The repository is the source; the root-owned files are the
# control. Never the reverse, and never a digest pinned beside the file it pins —
# that moves with the file, which is open item E30 observed rather than theorised.
# tests/managedGateTemplate.test.ts holds the template to the same production ref
# the rest of the controls use, so CI catches drift between the two.
#
# REVERSING IT: sudo rm -rf "$GATE_ROOT" "$MANAGED_DIR/managed-settings.json"
set -euo pipefail

GATE_ROOT="/usr/local/lib/anadyon-gate"
MANAGED_DIR="/Library/Application Support/ClaudeCode"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ "$(uname)" != "Darwin" ]; then
  echo "This installer writes the macOS managed-settings path. On Linux the directory is /etc/claude-code/." >&2
  exit 1
fi
if [ "$(id -u)" != "0" ]; then
  echo "Run this with sudo: the whole point is that the files end up owned by root." >&2
  exit 1
fi
for f in "$REPO/.claude/hooks/production-gate.mjs" \
         "$REPO/scripts/deployment-boundary-lib.mjs" \
         "$REPO/docs/agent-controls/managed-settings-template.json"; do
  [ -f "$f" ] || { echo "missing $f — run this from a current checkout" >&2; exit 1; }
done

echo "==> installing the gate to $GATE_ROOT"
install -d -o root -g wheel -m 0755 "$GATE_ROOT/.claude/hooks" "$GATE_ROOT/scripts"
install -o root -g wheel -m 0755 "$REPO/.claude/hooks/production-gate.mjs" "$GATE_ROOT/.claude/hooks/production-gate.mjs"
install -o root -g wheel -m 0644 "$REPO/scripts/deployment-boundary-lib.mjs" "$GATE_ROOT/scripts/deployment-boundary-lib.mjs"

echo "==> writing the managed policy to $MANAGED_DIR"
install -d -o root -g wheel -m 0755 "$MANAGED_DIR"
if [ -f "$MANAGED_DIR/managed-settings.json" ]; then
  cp -p "$MANAGED_DIR/managed-settings.json" "$MANAGED_DIR/managed-settings.json.before-$(date -u +%Y%m%dT%H%M%SZ)"
  echo "    an existing policy was found and copied aside, not overwritten blind"
fi
sed "s|GATE_ROOT_PLACEHOLDER|$GATE_ROOT|g" \
  "$REPO/docs/agent-controls/managed-settings-template.json" \
  > "$MANAGED_DIR/managed-settings.json"
chown root:wheel "$MANAGED_DIR/managed-settings.json"
chmod 0644 "$MANAGED_DIR/managed-settings.json"

echo "==> proving the installed copy works, rather than assuming it"
PROD=$(node -e 'import("'"$GATE_ROOT"'/scripts/deployment-boundary-lib.mjs").then(m=>console.log(m.PRODUCTION_PROJECT_REF))')
STAGING=$(node -e 'import("'"$GATE_ROOT"'/scripts/deployment-boundary-lib.mjs").then(m=>console.log(m.STAGING_PROJECT_REF))')

deny_check=$(printf '{"tool_name":"Bash","tool_input":{"command":"curl https://%s.supabase.co/rest/v1/"}}' "$PROD" \
  | node "$GATE_ROOT/.claude/hooks/production-gate.mjs" || true)
echo "$deny_check" | grep -q '"permissionDecision":"deny"' \
  || { echo "FAILED: the installed gate did not deny production" >&2; exit 1; }
echo "    production denied"

allow_check=$(printf '{"tool_name":"Bash","tool_input":{"command":"curl https://%s.supabase.co/rest/v1/"}}' "$STAGING" \
  | node "$GATE_ROOT/.claude/hooks/production-gate.mjs" || true)
[ -z "$allow_check" ] \
  || { echo "FAILED: the installed gate denied STAGING, which would break every task: $allow_check" >&2; exit 1; }
echo "    staging left alone"

cat <<NEXT

Installed. Three things to check yourself, because this script can only prove
what it ran:

  1. ls -l "$GATE_ROOT/.claude/hooks/production-gate.mjs"
     Owner must be root. If it is you, the gate is still editable by an agent
     running as you and nothing has changed.

  2. In a NEW Claude Code session (managed settings are read at startup):
       /doctor        — reports which settings files were loaded
       /hooks         — the gate should be listed, from the managed source
     Then fire one real denial and check the log gains a line:
       tail -n 2 "\${TMPDIR:-/tmp}/production-gate.jsonl"

  3. The project hook in .claude/settings.json still exists and still runs, so
     the gate currently fires TWICE — harmless, both agree. To make the managed
     one the ONLY one, add  "allowManagedHooksOnly": true  to the managed file.
     Verified to exist in the settings reference; its exact effect list was
     truncated when read, so treat it as UNVERIFIED until /hooks shows the
     result. NOTE: it would also stop your own ~/.claude stop-hook from running
     unless that hook moves into the managed file too.

NEXT
