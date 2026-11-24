#!/bin/bash
# Isolation proof: hashes of the user's real files + liveness of the user's app.
# Paths come from the environment, so no personal path is committed:
#   REAL_HOME (default $HOME), MAIN_CHECKOUT (default: git common dir's parent),
#   WT (default: this script's worktree, 4 levels up from harness/ in .ptah/specs/<task>/).
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REAL_HOME="${REAL_HOME:-$HOME}"
WT="${WT:-$(cd "$HERE/../../../.." && pwd)}"
MAIN_CHECKOUT="${MAIN_CHECKOUT:-$(cd "$(git -C "$WT" rev-parse --git-common-dir)/.." && pwd)}"
for f in "$REAL_HOME/.codex/config.toml" "$REAL_HOME/.gemini/config/mcp_config.json" "$REAL_HOME/.ptah/settings.json" "$REAL_HOME/.claude/settings.json" "$MAIN_CHECKOUT/.mcp.json" "$WT/.mcp.json" "$MAIN_CHECKOUT/.codex/config.toml" "$WT/.codex/config.toml"; do
  if [ -e "$f" ]; then echo "$(sha256sum "$f" | cut -d' ' -f1)  $(stat -c %Y "$f")  $f"; else echo "ABSENT  -  $f"; fi
done
# auth files: metadata only (never content, never hash)
for f in "$REAL_HOME/.claude/.credentials.json" "$REAL_HOME/.codex/auth.json"; do echo "meta size=$(stat -c %s "$f") mtime=$(stat -c %Y "$f") type=$(stat -c %F "$f")  $f"; done
for f in "$WT/.ptah/tmp/live-test-home/.claude/.credentials.json" "$WT/.ptah/tmp/live-test-home/.codex/auth.json" /tmp/ptah-lt/codex-native/auth.json; do echo "link $(stat -c %F "$f" 2>/dev/null || echo ABSENT) -> $(readlink "$f")  $f"; done
echo "user-app: $(ps -o pid=,lstart= -p $(pgrep -f "^/opt/Ptah/ptah-desktop$" | head -1) 2>/dev/null || echo DEAD)"
echo "user-app children: $(pgrep -P $(pgrep -f "^/opt/Ptah/ptah-desktop$" | head -1) | wc -l)"
ss -ltnp 2>/dev/null | grep -E "ptah|electron" | awk '{print "listen", $4, $6}'
