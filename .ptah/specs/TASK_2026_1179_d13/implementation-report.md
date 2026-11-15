# Implementation report: D13 stop-but-alive session

## Changes
- `libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.service.ts`
  - New private `verifyAndHardStop(childSessionId, sdkSessionId?)`. It soft-interrupts (`interruptSession(id,'parent-stop')`) the tab id and the SDK id when it differs. It re-checks `isSessionActive` on both ids. If any is still active it calls `endSession` on each active id, then re-checks. It returns `{ stopped, interruptError? }`, and `stopped` is true only when the adapter reports every id inactive. With no adapter or an unparseable id it returns `stopped: true`, which was the old behaviour.
  - `stop()` uses the helper. If the session is still active after the hard end, it clears `runtime.stopping` and returns the refusal `{ ok:false, reason:'still-active' }`. It does not call `markEnded`, `releaseResources` or `releaseBudget`. Interrupt errors are still recorded in the end reason.
  - `interruptInBackground` uses the helper. Its budget release stays in `finally`, and the result is the helper's `stopped` value.
  - `onHandoffGraceExpired` uses the helper. An incomplete stop is logged and succession still proceeds, as before.
- `session-spawner.port.ts`: new `SessionChildStopStillActiveRefusal` (`reason: 'still-active'`) added to `SessionChildStopResult`.
- `codex-chat-session-controls.ts`: `interruptSession(id, cause?)`. For `parent-stop` and `user-stop` it also closes the session in the idle path and after an accepted interrupt. The refused-interrupt path already closed. Other causes keep the soft behaviour.
- `codex-chat-adapter.ts`: `interruptSession` forwards `cause` to the controls (it was dropped before). It imports `SessionEndCause`.

## Tests added
- `session-spawner.service.spec.ts`
  - Harness adapter now has `endSession`, and `interruptSession` deactivates the id, as the fixed Codex adapter does.
  - Three new tests: the hard path is used when the soft interrupt leaves the session active; refusal with no stopped marking while still active; and the case where the SDK id differs from the child id.
- `codex-chat-adapter.spec.ts`
  - Three new tests: an idle session is inactive after `interruptSession(id,'parent-stop')`; a busy session with an accepted interrupt is inactive after `'parent-stop'`; and a soft interrupt with no cause keeps the idle session open.

## Decisions
- New refusal reason `still-active` (additive, reversible). The alternative was to reuse an existing reason, which would be misleading.
- `verifyAndHardStop` takes `(childSessionId, sdkSessionId?)`. The spec's duplicated third parameter was dropped.
