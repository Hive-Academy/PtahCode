# Batch P — turn stop cause propagation

## Files changed
- `libs/shared/src/lib/types/agent-adapter.types.ts`, `sdk-hook.parsers.ts`, `wire-parsers.equivalence.spec.ts`
- `libs/backend/agent-sdk/src/lib/helpers/sdk-adapter-events.service.ts`, `stop-failure-hook-handler.ts`, `stop-failure-hook-handler.spec.ts`, `session-lifecycle/session-control.service.ts`, `session-lifecycle/session-registry.service.ts`, `session-lifecycle-manager.ts`, `sdk-agent-adapter.ts` (only the interrupt signature/pass-through in this file is mine; other edits belong to another lane)
- `libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.service.ts`, `.spec.ts`

## Changed signatures
- `IAgentAdapter.interruptCurrentTurn(sessionId, cause?: TurnStopCause)`; `SdkAgentAdapter` and `SessionLifecycleManager` forward the optional cause to `SessionControl`.
- `SdkAdapterTurnFailedEvent.stopCause?: TurnStopCause`.
- `SessionRegistry` accepts an optional turn-start callback; `SessionLifecycleManager.onTurnTerminal` accepts an optional preservation flag for the interrupt path.
- Ptah LSP references was attempted but returned `File path cannot be empty`; native `rg` was used to find implementers. Existing routing/Codex implementers retain their one-argument signatures, which are compatible with an optional second parameter.

## Origin ? cause
| Origin | Cause passed | Path |
| --- | --- | --- |
| Explicit busy child steer | `parent-steer` | Spawner `interruptTurn` ? adapter `interruptCurrentTurn` |
| Runtime-cap hard stop | `runtime-cap` | Spawner `verifyAndHardStop` ? `interruptCurrentTurn` before existing `interruptSession(..., 'parent-stop')` |
| Parent/host child hard stop | `host-stop` | Same hard-stop path; session-end cause remains `parent-stop` |
| User Stop (`chat:abort`, source stop-button/apps-stop/command-center) | `user-stop` | Existing `endCauseForAbortSource` ? `interruptSession`; `SessionControl.endRecord` records cause during interrupt |
| Send now (`chat:queued-steer`) | absent | The queued follow-up interrupt remains untagged. It is neither a parent steer nor a session stop. |
| Unattributed abort | absent | No `internal-abort` synthesized. |

`SdkAdapterEvents` holds one cause entry under both tab and SDK session ids. The failure hook consumes it once and adds it to the turn-failed event. A normal terminal callback, the next turn start, interrupt timeout/failure, and session teardown clear it. The notifier already validates the whole event with `SdkTurnFailedPayloadSchema` and broadcasts `parsed.data`, so its existing implementation forwards `stopCause` when present without an edit.

## Renderer event map
The visible `Interrupted` row is driven by an in-stream `turn_state` event (`TurnStateEvent`, `libs/shared/src/lib/types/execution/stream-background.ts:331`), not the `session:turnFailed` push. `libs/frontend/chat-streaming/src/lib/streaming-handler.service.ts:254-255` passes it to `TurnStateApplier`; `turn-state-applier.service.ts:141-150` sets `isInterrupted` for `aborted_streaming` or `aborted_tools`; `message-finalization.service.ts:193-214,369-387` writes the interrupted assistant row. `TurnStateEvent` / `SessionTurnState` has `terminalReason` but no `stopCause`, so the cause does **not** reach that row today. `session:turnFailed` is separately handled by `libs/frontend/chat/src/lib/services/chat-store/turn-end-handler.service.ts:247`. The later UI batch must bridge these paths and suppress the row for unknown causes. No frontend file was edited.

## Checks
- `npx tsc --noEmit --project libs/shared/tsconfig.lib.json`: pass.
- `npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.lib.json`: pass.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json`: pass.
- `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json`: pass.
- `npx jest --config libs/shared/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/shared/src/lib/types/wire-parsers.equivalence.spec.ts`: 14/14 pass; harmless Jest config ESM warning.
- `npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-sdk/src/lib/helpers/stop-failure-hook-handler.spec.ts`: 18/18 pass; same warning.
- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.service.spec.ts`: 120/121 passed; one host-shutdown timing assertion failed after the first hard-stop change.
- Same spawner command with `-t 'releases every listener'` after starting both interrupts before awaiting: 1/1 passed (120 skipped). The full 121-test suite was not rerun.
- `npx eslint` on the 12 changed TypeScript files: 0 errors, 5 warnings (existing file-length/unused-variable warnings; module-boundary rule skipped for missing cached ProjectGraph).
- `ptah_get_diagnostics` scoped attempt: unavailable after its 45-second TypeScript check; focused project `tsc` commands above passed.

## Not done
- `session:turnFailed` does not itself drive the interrupted transcript row; propagating cause into `turn_state` and changing the row are outside this batch's write set.
- The 12-file write limit prevented adding separate notifier and lifecycle integration specs. Notifier forwarding follows from its schema-validated `parsed.data` payload; the hook one-shot and parser equivalence are covered.
- The `chat:abort` Ptah CLI custom-abort return bypasses the SDK path. This batch did not add stop-cause propagation to that separate runtime.

## Decisions
- Keep `SessionEndCause` unchanged and store the turn cause separately in the adapter event bus.
- Invalid parser `stopCause` rejects the payload, matching the existing Zod enum schema (which does not use `.catch(undefined)`).
- Preserve the stop cause across `SessionControl`'s early turn-terminal callback during interrupt; clear it at the next turn start if no failure hook consumes it.
- Keep `Send now` untagged.


