# Fix C races — report

Fixes re-review findings #1 and #2 and new defect 1 (`code-logic-re-review.md`).
Implemented by a backend-developer subagent (stopped by the budget monitor). The coordinator finished
it: lazy gate maps and spec type casts.

## Design

- **Race #2 (restart after tab close).** `SessionControl.endRecord` samples `startedAt` before any
  await and passes it in the session-end payload, for the `no-activity-timeout` cause only.
  `HandoffWatchdogRecovery.onSessionEnd` uses it as `endedAt`, so a close during the teardown
  interrupt counts as a stop after the end. The recovery checks for a stop at entry, after the
  folder await, after `gateAccount` and after `beginDrive`. A stop after a launch ends the
  relaunched session with `interruptSession(id, 'user-stop')`.
- **Race #1 (duplicate turn).** `ChatSessionService.withActivationGate(keys, 'user'|'recovery', run)`
  serializes activation per session id and tab id. `continueSession`, `resumeSession` and
  `ensureSessionActiveForRewind` enter as `'user'`. A user entry marks any recovery in progress
  (`userArrived`), and recovery then stands down. The prompt is sent with
  `admission: 'require-idle'`. A refusal maps to `already-active`, and nothing is queued.
- Gate maps are lazy getters, so specs that build a receiver without the constructor still work.

## Files

- `libs/backend/agent-sdk/src/lib/helpers/session-end-callback-registry.ts` (`startedAt?`)
- `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-control.service.ts`
- `libs/backend/cli-agent-runtime/src/lib/session-children/handoff-watchdog-recovery.ts` (+ spec, 1 test)
- `libs/backend/rpc-handlers/src/lib/chat/session/chat-session.service.ts`
- `libs/backend/rpc-handlers/src/lib/chat/session/chat-session-watchdog-recovery.spec.ts` (11 tests:
  happy path, already active, user continue during activation and during folder preparation,
  turn between activation and admission, tab close during teardown / folder / account / launch,
  stop before the end does not cancel, thrown resume and failed send)

## Checks

| Check | Result |
|---|---|
| `npm run verify -- --related -p rpc-handlers,cli-agent-runtime,agent-sdk` | agent-sdk and cli-agent-runtime pass; rpc-handlers 36/37 suites, 870 tests pass; 1 suite type error in the spec cast, then fixed |
| focused jest `chat-session-watchdog-recovery.spec.ts` after the fix | 11/11 pass |
| eslint on the 2 rpc-handlers files | 0 errors, 1 warning (`max-lines`, file was already over the limit) |
| full gate, 3 projects | see `.ptah/tmp/fixc-gate.log` |

## Not done

- No record-identity token check before admission beyond `require-idle`, `hasLiveSessionStream`,
  the gate and `userArrived`.
- Fixes A, B, D and E are unchanged.
