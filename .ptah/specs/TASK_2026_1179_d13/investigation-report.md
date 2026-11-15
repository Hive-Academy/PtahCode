# D13 "stop-but-alive session" investigation

Static read only. No source was changed and no tests were run.

## Call chain of `ptah_session_stop`

1. Tool definition: `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/session-tools.ts` (`SESSION_STOP_TOOL_NAME`, L31; `buildSessionStopTool`, L147).
2. Implementation: `SessionSpawnerService.stop()` in `libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.service.ts` (L1148-1235).
3. Teardown: `this.adapter.interruptSession(tabId, 'parent-stop')` (L1213).
   - Claude path: `SdkAgentAdapter.interruptSession` (`libs/backend/agent-sdk/src/lib/sdk-agent-adapter.ts` L2162) calls `SessionControl.endSession`, which removes the record from the registry.
   - Codex path: `RoutingAgentAdapter.interruptSession` (`codex-app-server/routing-agent-adapter.ts` L232) calls `CodexChatSessionControls.interruptSession` (`codex-chat-session-controls.ts` L143-173).
4. Bookkeeping: `registry.markEnded(id, 'stopped', ...)` (L1220), then `releaseResources` and `releaseBudget`.

## State tracking and the alive check

There are two independent sources of truth.

| Concern | Source | Location |
| --- | --- | --- |
| "Stopped" as the parent sees it | `SessionChildRecord.terminalStatus` (set by `registry.markEnded`), plus the `runtime.stopping` flag | `session-spawner.service.ts` L1207, L1220 |
| "Alive" as the host sees it | `adapter.isSessionActive(id)` (SDK: `lifecycle.find`, `sdk-agent-adapter.ts` L1657; Codex: `sessions.has(id)`, `codex-chat-session-controls.ts` L64) | `activeIdOf()`, `session-spawner.service.ts` L2039-2046 |

`stop()` writes only the first one. It never confirms that the second one flipped to "not active".

## Root cause

`stop()` marks the child `stopped` unconditionally after calling `interruptSession`.

- The result of `interruptSession` is never checked.
- A throw is swallowed into the `reason` string (L1214-1218).
- A silent no-op is also treated as success.

`interruptSession` is a soft interrupt. For the Codex adapter it frequently does not end the session:

- `opening` set: it only sets `cancelled` and returns (L144-148).
- Session idle (`!session.busy`): it calls `cancelPendingUserInput` and returns (L151-154). The session stays in `deps.sessions`.
- Turn interrupt accepted (L158-168): it only ends the turn. `close(session)` runs only when the interrupt is refused or throws, so `sessions` still holds the session.
- Duplicate stop (`stopRequested` already true): it returns immediately (L155).

In each case `isSessionActive(id)` stays `true`. The host's lifecycle check (`activeIdOf`) therefore reports a live session while the registry says `stopped`.

A second gap sits in `stop()` itself. It interrupts only `target.childSessionId` (L1210-1213). `activeIdOf` shows that the adapter may know the live session under `sdkSessionId` instead. For Codex, a native thread id differs from the tab id. In that case the interrupt hits a non-existent key, which is a silent no-op.

Because `runtime.stopping = true` is set (L1207), `onSessionEnd` (L1497) ignores the later end event. No grace or `endOutside` reconciliation ever corrects the stale state.

The Claude path is mostly correct. `endSession` removes the registry record, and `find` resolves both tab id and real id. It leaves the same hole only when the interrupt throws or the id was not registered.

## Affected systems

| System | Effect |
| --- | --- |
| Stopping | Reports `ok: true, alreadyEnded: false` while the session is live. |
| Status checking | `statusOf` returns `stopped` because `terminalStatus` wins. `activeIdOf` and `isIdleWithoutPendingWork` use `isSessionActive`, so a live runtime is reported separately. |
| Message routing | A user message in the child's tab, or any adapter-level send, still reaches the live Codex session and runs a turn while the parent believes it is stopped. |
| Resources | `releaseResources` and `releaseBudget` run for a live session (slot, policy, MCP root, budget), so accounting leaks. |
| Resumption | A follow-up can land on the "stopped" session instead of cleanly resuming it. |
| Creation | Not affected. |

## Where changes are needed

1. `session-spawner.service.ts` L1206-1224, `stop()`:
   - Stop through every id from `activeIdOf` and `childSessionId` and `sdkSessionId`, not only `childSessionId`.
   - After the interrupt, re-check `adapter.isSessionActive` on both ids.
   - If a session is still active, escalate to a hard end. `IAgentAdapter` exposes `endSession` (`libs/shared/src/lib/types/agent-adapter.types.ts` L388 neighbourhood; confirm the signature).
   - If it is still active after that, return a refusal and do not mark the child `stopped`.
2. `codex-chat-session-controls.ts` L143-173, `interruptSession`:
   - It is used for `parent-stop`, whose contract is to end the session (Claude removes the record).
   - Close the session for the stop causes `parent-stop` and `user-stop`, or route those causes to `closeSession`.
   - `codex-chat-adapter.ts` L1251 drops the `cause` argument, so plumb it through.
3. `session-spawner.service.ts` L2187 and L2315 (`interruptInBackground`, `onHandoffGraceExpired`): apply the same verified-stop helper.

## Regression test strategy (Jest)

- `libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.service.spec.ts`, using a fake adapter whose `interruptSession` is a no-op and whose `isSessionActive` stays true:
  - Expect `stop()` to end the session through the hard path or refuse.
  - Expect no `stopped` marking while the adapter is still active.
  - Add a case where the live id is `sdkSessionId` and differs from `childSessionId`.
- `libs/backend/agent-sdk/src/lib/codex-app-server/*.spec.ts`: after `interruptSession(id, 'parent-stop')` on an idle session and on a busy session whose interrupt is accepted, `isSessionActive(id)` must be false.
- Command: `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath <spec>`.

## Decisions and caveats

- The Codex-only trigger is inferred from code reading, not reproduced. Whether a Claude-adapter variant exists (interrupt throws) should be confirmed with the spec above.
- I did not inspect git history beyond the recent log. Commit `f737c8ba3` ("stop successor started after parent stop") touches the same area.
