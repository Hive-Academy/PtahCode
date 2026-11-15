# TASK_2026_1185_5a1e — chat:start stalls on the MCP registration queue

## Evidence (Electron log 2026-11-14/15)

- `chat:start` logs `[ptah.main] chat:start - session config` and then waits 14–51 minutes
  before `chat:start - prompt config`. The wait is
  `await this.codeExecutionMcp.ensureRegisteredForSubagents()` at
  `libs/backend/rpc-handlers/src/lib/chat/session/chat-session.service.ts:1252`.
- `ensureRegisteredForSubagents()` (`libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/http-mcp-server.service.ts:537`)
  runs in `enqueueMcpOp` (line 408), one FIFO queue with no timeout. Every job
  (`ensureRegisteredNow`, `retainRoot`, `releaseRoot`, `queueRepoint`) runs a FULL
  `reconcileRegistrations` over every desired slot (all open folders + every retained
  child-session worktree + home targets such as `~/.gemini/config/mcp_config.json` and
  `<root>/.agents/mcp_config.json`).
- Under load each `registerInSlot` took 1.5–10 minutes (persistentCredential →
  `callerCredentials.preparePersistent`, file write via harness-sync config lock,
  `credential.commit()` → `state.update`). 20 slot writes in 54 minutes. All six queued
  `chat:start` calls released in the same second at 00:35:36.
- The webview RPC timed out, the user re-sent, and several `chat:start` calls for the SAME tab
  then ran in the same millisecond. `SessionRegistry` displaced each one, which aborted it and
  produced `Session ended before its Ptah MCP credential was issued.`

## Fix scope

1. Fast path: `ensureRegisteredForSubagents` returns REGISTERED at once, without the queue,
   when the active root's claude `.mcp.json` slot is already in `registrations` at the current
   port and the file still holds our entry (cheap sync check is fine).
2. Deadline: callers on the chat-start path wait a bounded time (about 3 s, a named constant)
   for registration. On timeout they continue with `mcpServerRunning` per the existing
   degraded contract (`notRegistered('timeout')` or equivalent new reason) and the queued job
   still completes in the background. Apply in chat-session.service.ts (both call sites),
   chat-ptah-cli.service.ts and gateway-turn-preparation.ts, or centrally in the service.
3. Scoped work: `ensureRegisteredForSubagents` and `retainRoot` register only the slots of
   their own root (plus nothing else); `releaseRoot` removes only that root's slots. The full
   reconcile stays for workspace-folder changes / start.
4. Coalescing: at most one pending full reconcile in the queue; later requests join it.
5. Timing logs: debug/warn log with duration per step in `registerInSlot` when a step takes
   more than 1 s (credential prepare, write, commit).
6. Webview: do not send a second `chat:start` for a tab while one is in flight for that tab
   (separate lane).

## Lanes

| Lane | Scope | State |
|---|---|---|
| backend (codex) | items 1–5 | done (backend-report.md) |
| webview (codex) | item 6 | done (webview-report.md) |
| coordinator | timeout keeps session MCP on (chat-session, gateway); ptah-cli stays strict | done |
| review (codex) | independent logic review | done (code-logic-review.md) |
| backend fix (codex) | full reconcile in ensureRegisteredNow, token check on fast path | done (backend-report-2.md) |
| webview fix (codex) | guard only after the RPC timeout | done (webview-report-2.md) |
| coordinator | review findings 1 and 3: re-point during a running pass, abandoned start recovery | done |

## Follow-up (out of scope)

- `retainedRoots` is a `Set`: two sessions that retain one root, then one release, remove the
  entry for the other session. This existed on `main` before this task.
