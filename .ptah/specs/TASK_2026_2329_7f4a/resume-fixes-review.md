# Resume fixes code-logic review

**Verdict: PASS WITH NOTES**

## Findings

### 1. Medium — a concurrent permission change can still lose to the prepared snapshot

**Blocking: No** for the reported sequential toggle-then-continue case.

`prepare` reads the saved level once (`libs/backend/rpc-handlers/src/lib/chat/provider-session-host/provider-session-chat-host-ports.ts:129-137`). The adapter applies that snapshot during attach (`libs/backend/agent-sdk/src/lib/provider-session/provider-session-chat-adapter.ts:384-387`) but publishes the session only after attach (`provider-session-chat-adapter.ts:299-317`). Until then, native controls see no session token and only save the new value for the next turn (`libs/backend/rpc-handlers/src/lib/chat/codex-host/native-session-controls.ts:176-181`).

Therefore, a toggle that completes after the `prepare` read but before session publication is not applied to the process. The older prepared level wins. This narrow race can retain Full Auto when the toggle and `chat:continue` overlap. A later live toggle corrects it. Consider a follow-up if concurrent toggle/continue ordering is in scope.

### 2. Low — invalid or unreadable saved settings now fail a reused-process continue

**Blocking: No**; this is a fail-closed behavior change, but it needs explicit acceptance.

The new read runs before pool acquire (`provider-session-chat-host-ports.ts:124-132`). Previously, the reader ran only when the pool built a new process (`libs/backend/rpc-handlers/src/lib/chat/provider-session-host/provider-session-open-request.ts:252-263`). A reused process returned without that build (`libs/backend/rpc-handlers/src/lib/chat/provider-session-host/provider-session-pool.ts:193-196`).

Thus, if settings become unreadable or invalid after a history open, `readSavedPermissionLevel` now throws and `chat:continue` fails where it previously reused the process. This avoids silently using an unknown or stale permission level. Add a focused test or document this intentional failure behavior. Do not fall back to the process's old level.

## Verified behavior

- **Fix 1 is correct.** New provider metadata receives the raw `seed.workspacePath` (`libs/backend/agent-sdk/src/lib/provider-session/provider-session-chat-session.ts:91-96`). The store normalizes only `providerSessionExecution.workspaceId` and preserves the caller path in top-level `metadata.workspaceId` (`libs/backend/agent-sdk/src/lib/session-metadata-store.ts:1800-1815`, `1857-1869`). It is not a hashed id.
- **Fix 2 applies to a reused history process.** On the first adapter attach, `live !== previous`, even when the pool supplied an existing process. The adapter calls `live.setPermission(session.settings.permission)` before it starts the turn (`provider-session-chat-adapter.ts:369-387`). An explicit caller level still overrides the prepared level (`provider-session-chat-session.ts:51-65`).
- Electron passes the same reader to host preparation and process opens (`apps/ptah-electron/src/di/provider-session-composition.ts:342-351`, `378-397`).

## Focused checks

- Agent SDK: **2 suites passed, 70 tests passed**.
- RPC handlers: **1 suite passed, 21 tests passed**.
