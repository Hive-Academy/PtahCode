# Fix round 4 report

## Changes

1. **Confirmed rejection retry identity.** `libs/frontend/chat/src/lib/services/chat-store/follow-up-queue.service.ts:534,564` no longer records a reusable ID for a rejected receipt. The transport-uncertain branch at line 550 still retains the ID. Changed spec: `allocates a new client id after authoritative rejection`; extended spec: `reuses the client id after both atomic abandon attempts fail` to assert ID reuse.
2. **Native Codex in-flight admission.** `libs/backend/rpc-handlers/src/lib/chat/session/chat-session.service.ts:2845` synchronously commits the admission before calling the SDK. Its try/finally records delivered on resume success and a typed rejected receipt on failure. `libs/backend/rpc-handlers/src/lib/chat/follow-up/chat-follow-up-queue.service.ts:190` preserves a committed admission as pending. `libs/shared/src/lib/types/rpc/rpc-chat.types.ts:260` and `libs/backend/rpc-handlers/src/lib/handlers/chat-rpc.handlers.ts:505` expose `receiptCommitted`; `libs/frontend/chat/src/lib/services/chat-store/follow-up-queue.service.ts:537` polls committed pending receipts every 30 seconds until terminal and cancels the tracked timer on settlement or tab cleanup. New specs: `keeps committed admissions pending until native resume accepts or rejects`, `keeps a committed native resume pending until a later accepted receipt`.
3. **Empty session maps.** `libs/backend/rpc-handlers/src/lib/chat/follow-up/chat-follow-up-queue.service.ts:152` evicts empty per-session maps, including the committed set, only when the session has no pending admissions. `endAdmission` removes its empty admission map. New spec: `removes empty per-session receipt maps after many sessions expire`. The inspected session service and chat RPC handlers have no safe session deletion callback; `retireSession` remains available for an owner that can identify a final lifecycle event.

## Checks and residual risk

- `git diff --check`: passed.
- `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json`: passed after all source edits.
- `npx tsc --noEmit --project libs/shared/tsconfig.lib.json`: passed.
- `npx ngc --noEmit --project libs/frontend/chat/tsconfig.lib.json`: passed with three NG8107 optional-chain warnings outside the changed files.
- Jest was not run, as requested. The backend committed-admission spec exercises the receipt state transition directly; it does not hold a real `resumeSession` promise in flight. A native resume integration test remains desirable.
