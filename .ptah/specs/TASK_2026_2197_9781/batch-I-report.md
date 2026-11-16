# Batch I — abort backend

## Files changed
- `libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.service.ts` and `.spec.ts`
- `libs/backend/rpc-handlers/src/lib/chat/follow-up/chat-follow-up-queue.service.ts`
- `libs/shared/src/lib/types/sdk-hook.schemas.ts` and `.spec.ts`

## Paths and causes
| Path | Before | After / cause |
| --- | --- | --- |
| Busy child, explicit `ptah_session_send` `steer` | Interrupts current turn then sends | Same behavior; origin logged as `parent-steer` after successful interrupt. The adapter API cannot carry the tag yet. |
| `queue` and `if-idle` | Queue while busy or refuse busy respectively | Unchanged; neither calls interrupt. |
| Runtime warning | Sends through `sendMessageToSession`, which queues while busy | Unchanged; no interrupt. |
| Runtime-cap grace expiry | `verifyAndHardStop` interrupts with adapter session-end cause `parent-stop` | Calls hard stop with local `runtime-cap` origin tag and logs it. Existing adapter session-end cause remains `parent-stop` because `SessionEndCause` does not include `runtime-cap`. |
| Parent/host child stop | Hard stop with `parent-stop` session-end cause | Local `host-stop` origin tag; adapter `parent-stop` and child outcome `parent-stop` remain intact. |
| External user session end | `onSessionEnd` parses user-stop and `endOutside` retains it | Unchanged; `user-stop` is retained in child end cause. |
| Explicit `Send now` | `chat:queued-steer` delegates to adapter, which may return `mode: interrupt` | Same behavior, documented as explicit only. No `user-stop` tag: this steers, it does not stop the session. Queue state delivery never invokes `steer`. |
| Renderer `session:turnFailed` parse | Zod stripped `stopCause` | Schema now accepts and retains optional `user-stop`, `parent-steer`, `runtime-cap`, `host-stop`, `internal-abort`; rejects other values. |

## Propagation gap
- `libs/shared/src/lib/types/agent-adapter.types.ts:385` defines `interruptCurrentTurn(sessionId)` with no cause parameter; `SessionSpawnerService.interruptTurn` at `session-spawner.service.ts:2107` can only pass the ID. `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-control.service.ts:106` implements the cause-less method. Thus `parent-steer` is logged at origin but cannot enter a turn-failed event.
- `libs/backend/agent-sdk/src/lib/helpers/session-end-callback-registry.ts:22-35` defines `SessionEndCause` without `runtime-cap` or `host-stop`; `interruptSession` uses that contract. The spawner therefore passes `parent-stop` while logging the more specific local origin. A follow-on contract change must carry the stop cause separately.
- `libs/backend/agent-sdk/src/lib/helpers/sdk-adapter-events.service.ts:52-60` defines `SdkAdapterTurnFailedEvent` without `stopCause`. `libs/backend/agent-sdk/src/lib/helpers/stop-failure-hook-handler.ts:92-100` builds the event without it. `libs/backend/rpc-handlers/src/lib/handlers/session-lifecycle-notifier.ts:143-159` builds/broadcasts `session:turnFailed` from this event. These files are outside the write set.
- `libs/shared/src/lib/types/sdk-hook.parsers.ts:186-205` manually parses the same payload but drops `stopCause`; it is outside the write set. Follow-on work should update it with the schema and extend `wire-parsers.equivalence.spec.ts` with valid causes.

## Checks
- `ptah_get_diagnostics` scoped call timed out after 45 seconds without a result; focused TypeScript checks were used.
- `npx tsc --noEmit --project` on `libs/shared/tsconfig.lib.json`, `libs/backend/cli-agent-runtime/tsconfig.lib.json`, and `libs/backend/rpc-handlers/tsconfig.lib.json`: all pass.
- Shared schema Jest spec: 10/10 pass.
- CLI runtime and RPC handlers Jest specs: both fail before tests because the configured `marked` mapper points at missing `node_modules/marked/lib/marked.umd.js` in this worktree. No test assertion ran.
- ESLint on changed TypeScript files: 0 errors; existing spawner warnings for file length and unused `minutes`. Nx module-boundary rule skipped because no cached ProjectGraph.

## Decisions
- Keep queued host messages on the existing `sendMessageToSession` path. It already queues busy turns; adding an interrupt-free wrapper would duplicate behavior. Evidence: spawner `onRuntimeWarning` and `send` queue branch. Reversible.
- Keep `Send now` cause unset. It is an explicit user steer, whereas `user-stop` means session stop. Evidence: `chat:queued-steer` and adapter return `mode: interrupt`. Reversible.
- Log `parent-steer`, `runtime-cap`, and `host-stop` at origin while preserving the adapter's existing session-end cause. Changing the cross-library event and adapter interfaces is outside this batch's write set. Reversible.
