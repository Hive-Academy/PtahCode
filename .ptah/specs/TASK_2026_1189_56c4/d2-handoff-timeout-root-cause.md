# D2: child handoff timeout and duplicate successors

## Executive summary

A child `ptah_session_handoff` holds its MCP request open while it synchronously creates and starts a successor chat session. That start can include provider admission, SDK startup, and host/UI work, with no child-specific deadline or cancellation boundary. When the caller's MCP/tool timeout fires first, the host operation can continue and eventually create a successor. A retry has no durable request ID or cached outcome; once an attempt fails or its in-memory `succeeding` guard clears, it can mint another successor. Thus a timeout is ambiguous to the caller and the operation is not idempotent.

## Code locations

- `libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.ts:326-343` and `:289-324` — child callers branch to `succeedChild()` and await `spawner.succeed()`; they bypass the top-level handoff deadline and acknowledgement-record path.
- `libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.service.ts:2373-2395` — each child request invokes succession afresh.
- `libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.service.ts:2413-2507` — the guard is an in-memory `runtime.succeeding` flag; a new successor ID is minted, and registry succession is recorded before awaited startup steps.
- `libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.service.ts:2543-2629` — host start and message transfer are awaited before the tool returns; failure reverts registry succession and clears the guard, while the caller may already have timed out.
- `libs/backend/rpc-handlers/src/lib/chat/session/child-chat-session-host.adapter.ts:95-151` and `libs/backend/rpc-handlers/src/lib/chat/session/chat-session.service.ts:1486-1560,1723-1887` — host startup awaits account/configuration work and `startChatSession` before reporting `started`.
- `libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.ts:401-413` — the 30-second deadline belongs to the top-level branch; even there it does not cancel a late host start.

## Specific defect cause

The child operation's external timeout and the host's succession transaction have different lifetimes. The MCP caller can stop waiting while `startOnHost` continues. The registry link is created early, but the result is only returned after startup and transfer. The `succeeding` boolean only rejects overlapping calls within one live runtime; it is not a persistent, request-keyed outcome. After rollback or loss of that runtime state, retrying the same logical handoff can start another session. The top-level deadline illustrates the same late-start ambiguity: it explicitly reverts adoption and returns failure while acknowledging that a session may still open later.
