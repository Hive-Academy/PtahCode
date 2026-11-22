# Context: child session reports after a session handoff

Relates to TASK_2026_2289_05cb (PR #1448), where the defect was observed on 2026-11-21.

## Gate 0.1

- Lane preference: memory says CLI lanes are a first-class option. Mode `enabled`.
- Spawnable lanes: codex (confirmed room), grok, antigravity, claude. Ollama Code and kimi code
  are at their plan limit.
- Implementation: `backend-developer` subagent (Claude family). Review: codex lane (other family).
- BUGFIX flow has no document gate.

## Evidence (host log `~/.config/Ptah/logs/Ptah Electron-2026-11-21.log`)

Five refusals were logged. No host restart occurred in the chain. No record was pruned.

| Time (UTC) | Caller | Reason | Recorded parent | Real state |
|---|---|---|---|---|
| 08:24:40 | `f9542ba0` (session 2) | `parent-session-not-active` | tab `73ed5ebf`, SDK `be201b72` | Parent stream exited at 08:03:09 (`cleaned up after stream exit`). Parent resumed at 08:29:40. |
| 11:15:01 | `2e876029` (session 3) | `parent-session-not-active` | tab `abee4308`, SDK `60f9f582` | Parent handed off at 08:51 and `reparent` ran (the record shows the new parent). Parent stream exited at 09:55:16. |
| 17:22:57, 20:28:26, 20:40:52 | `8d45c2eb` | `unattributed-caller` | none found | Session 6 (tab `b8d9fca1`, SDK `e4d215e8`) ended at 15:48:54 (provider-error, grace expired). It was resumed at 17:22:39 in a NEW tab `8d45c2eb` with the same SDK ID `e4d215e8`. The MCP URL carries the new tab ID. |

## Hypotheses

1. Child handoff registers the successor under the wrong ID: REJECTED for the succession path.
   `registry.succeed` registers the successor tab ID and `bindSdkSessionId` adds the SDK ID.
   The real `unattributed-caller` cause is different: an ENDED child that was resumed in a new
   tab. The MCP tool sends the new tab ID. The registry knows the old tab ID and the SDK ID only.
2. Parent handoff keeps the old parent ID: REJECTED. `SessionHandoffService.adoptWork` runs
   `reparent` (log: "the new session adopted ... 4 child session(s)") and the 11:15 refusal
   shows the new parent IDs. `forwardTarget` follows a chain of acknowledgement records.
3. Host restart or prune: REJECTED for this incident. The link is still in memory only.

## Real causes

- A. The parent was idle. Its SDK stream exited after its turn, so `isSessionActive` was false.
  The child route refuses and does not hold the report (rule of TASK_2026_584). The lane route
  and the completion route hold their payload until the parent is active.
- B. A report from a child session that was resumed in a new tab is looked up by the new tab ID
  only.

## Decisions

See `decisions.md`.
