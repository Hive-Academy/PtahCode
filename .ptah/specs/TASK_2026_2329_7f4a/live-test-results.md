# Live test results — TASK_2026_2329_7f4a

Ptah Dev (Electron dev build of this worktree, CDP port 9333), scratch workspace
`/home/amun/ptah-yolo-test`. Child levels come from the log line
`[ptah.main] agent child session - session config`.

## Main chat permissions

| Provider | Case | Result |
| --- | --- | --- |
| Antigravity | Manual asks per tool; live readback `ask` | PASS |
| Antigravity | Manual -> Full Auto mid-chat (`ask->yolo mode auto`), no cards | PASS |
| Codex | Full Auto new chat, no cards, readback `yolo` | PASS |
| Codex | Full Auto -> Manual, card for shell command, Deny blocks | PASS |
| Claude | Manual, inline card for `ptah_session_start`, no timeout | PASS |

## Child sessions (`ptah_session_start`)

| Provider | Parent level | Child level | Result |
| --- | --- | --- | --- |
| Claude | Full Auto | `yolo`, file written, no card | PASS |
| Claude | Manual | `ask` (parent call approved inline) | PASS |
| Codex | Full Auto (before f963b775a) | `ask`, card per file change | FAIL -> fixed |
| Codex | Full Auto (after f963b775a) | `yolo`, file written, no card | PASS |
| Codex | Manual | parent MCP approval card not inline, request times out | FAIL, follow-up |
| Antigravity | any | `ptah_session_start` not exposed to the model | BLOCKED, follow-up |

## Follow-up defects (separate PR)

1. Antigravity drops every Ptah MCP tool whose declaration (name, description, parameters)
   is larger than about 2.1 KB: 8 tools, including `ptah_session_start` (4,981 B) and
   `ptah_agent_spawn` (8,679 B). All tools at or below 2,124 B are present. Evidence:
   `~/.gemini/antigravity-cli/mcp/ptah_lane/*.json` versus the model's own tool list.
2. Codex Manual: the approval for a Ptah MCP tool call (`mcp__ptah__elicitation`) shows only
   in the notifications list, not in the chat, and the request times out.
