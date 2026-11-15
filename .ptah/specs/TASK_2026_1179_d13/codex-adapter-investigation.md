# Codex vs Claude adapter: `user-stop` handling

## Findings
- `SdkAgentAdapter.interruptSession(sessionId, cause)` (`libs/backend/agent-sdk/src/lib/sdk-agent-adapter.ts` ~L2162) calls `sessionLifecycle.endSession(sessionId, cause)` unconditionally. `endRecord` tears the session down (interrupt, abort, registry removal) for every cause, so Claude **ends the session on `user-stop`**.
- Codex `interruptSession` hard-closes (`deps.close`) when `cause` is `parent-stop` or `user-stop`. That matches Claude's behaviour for `user-stop`.

## Decision
Task item 1 (narrow `hardStop` to `parent-stop` only) was **NOT applied**. Narrowing it would make a Stop-button press leave the Codex session alive, which Claude does not do. That is the bug this branch fixes. `codex-chat-session-controls.ts` is unchanged. It is reversible: change line 145 if the coordinator wants the narrower scope anyway.

## Other fixes (session-spawner.service.ts)
- F2: `interruptInBackground` logs when `stopped` is false. `onHandoffGraceExpired` logs that succession proceeds while the session may still be live.
- F3: the `verifyAndHardStop` call in the stop path is wrapped in try/catch, so `runtime.stopping` is reset to false before the error is rethrown.
