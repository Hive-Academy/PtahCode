#!/bin/bash
# Isolation proof: hashes of the user's real files + liveness of the user's app.
WT=/home/amun/ptah-extension/.claude-worktrees/chore-nav-benchmark-rerun-cb61d3eb8ef8
for f in /home/amun/.codex/config.toml /home/amun/.gemini/config/mcp_config.json /home/amun/.ptah/settings.json /home/amun/.claude/settings.json /home/amun/ptah-extension/.mcp.json $WT/.mcp.json /home/amun/ptah-extension/.codex/config.toml $WT/.codex/config.toml; do
  if [ -e "$f" ]; then echo "$(sha256sum "$f" | cut -d' ' -f1)  $(stat -c %Y "$f")  $f"; else echo "ABSENT  -  $f"; fi
done
# auth files: metadata only (never content, never hash)
for f in /home/amun/.claude/.credentials.json /home/amun/.codex/auth.json; do echo "meta size=$(stat -c %s "$f") mtime=$(stat -c %Y "$f") type=$(stat -c %F "$f")  $f"; done
for f in $WT/.ptah/tmp/live-test-home/.claude/.credentials.json $WT/.ptah/tmp/live-test-home/.codex/auth.json /tmp/ptah-lt/codex-native/auth.json; do echo "link $(stat -c %F "$f" 2>/dev/null || echo ABSENT) -> $(readlink "$f")  $f"; done
echo "user-app: $(ps -o pid=,lstart= -p $(pgrep -f "^/opt/Ptah/ptah-desktop$" | head -1) 2>/dev/null || echo DEAD)"
echo "user-app children: $(pgrep -P $(pgrep -f "^/opt/Ptah/ptah-desktop$" | head -1) | wc -l)"
ss -ltnp 2>/dev/null | grep -E "ptah|electron" | awk '{print "listen", $4, $6}'
