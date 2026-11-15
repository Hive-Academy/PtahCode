# D13: stopped child remains alive

## Executive summary

`ptah_session_stop` closes the child in Ptah's child registry, but that registry is separate from the chat adapter's live session and process state. The stop path relies on `interruptSession`, whose semantics are an interrupt of the current turn rather than a permanent close of the conversation. In particular, an idle Codex session returns from the interrupt without closing its context. The child can therefore be reported as stopped by the child registry while `session:status` still reports an active chat session, and a later tab continuation can start another turn.

## Code locations

- `libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.service.ts:1148-1234` — `stop()` awaits `adapter.interruptSession`, then unconditionally calls `registry.markEnded(..., 'stopped', ...)` and releases child runtime resources, including when interrupt throws.
- `libs/backend/cli-agent-runtime/src/lib/session-children/session-child.registry.ts:438-450` — `markEnded` makes the child registry's terminal state independent of adapter liveness.
- `libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-session-controls.ts:143-173` — `interruptSession` returns immediately for an idle session; for a busy session it interrupts the turn and normally leaves the context open.
- `libs/backend/agent-sdk/src/lib/sdk-agent-adapter.ts:2155-2170` — Claude adapter documents interrupt as resumable conversation teardown.
- `libs/backend/rpc-handlers/src/lib/handlers/session-rpc.handlers.ts:1946-1977` — `session:status.isActive` reads adapter liveness, not the child registry's terminal status.
- `libs/backend/rpc-handlers/src/lib/chat/session/chat-session.service.ts:3130-3189` — continuation can resume a known child by session ID without rejecting a terminal child record.

## Specific defect cause

The stop result equates a successful interrupt call with permanent termination. That assumption is false for the Codex adapter and for the resumable chat model generally. There is no shared terminal invariant or stop fence between the child registry, the adapter, and the continuation path. The `catch` at `session-spawner.service.ts:1214-1218` makes the split even more explicit: Ptah records `stopped` despite an interrupt failure. This is why the child state and actual process/turn lifecycle can disagree, and why a stopped child is not terminal at the chat layer.
