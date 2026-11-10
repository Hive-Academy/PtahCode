# Fix round 2 report

## Findings

1. **Native Codex resume receipt:** `chat-session.service.ts:1891` records the submitting tab and client id through `ChatFollowUpQueueService.acceptResumed` (`chat-follow-up-queue.service.ts:158`) before returning. The delivered receipt survives admission completion and is exposed by `chat:queued-list`. Tests: `keeps a delivered receipt after native resume admission ends for a timed-out renderer`; `settles a timed-out native resume from its durable delivered receipt`.
2. **Terminal rejection and bounded reconciliation:** `chat-session.service.ts:2061` records rejected admission before clearing pending, with typed refusal codes where available. `chat-follow-up-queue.service.ts:166` stores that receipt; `chat-rpc.handlers.ts:501` exposes its code. `follow-up-queue.service.ts:508` retries at 2, 4, 8, 16 and 30 seconds, settling definitive receipts immediately and restoring inconclusive text at the bound. Tests: `keeps a typed rejected receipt after refused admission ends`; `settles pending then rejected with the typed safe reason`; `restores after repeated receipt lookup failures`.
3. **Timer cleanup:** `follow-up-queue.service.ts:554` cancels tracked timers on settlement, tab close/reset, removed tabs and destroy, and guards in-flight lookups. Retry records are removed on close/reset. Tests: `tab close cancels receipt timer`; `a delivered push during an in-flight recheck settles once`.

## Checks

- `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json`: exit 0; no output.
- `npx ngc --noEmit --project libs/frontend/chat/tsconfig.lib.json`: exit 0; three NG8107 optional-chain warnings in unchanged `chat-ui` and `peer-session-send` components.
- `git diff --check`: exit 0; no output.

Jest was not run because this sandbox cannot start it (`spawn EPERM`), as specified. No commit, push or PR.

