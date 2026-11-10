# Fix round 3 report

## Blocker: atomic deadline resolution

- `libs/backend/rpc-handlers/src/lib/chat/follow-up/chat-follow-up-queue.service.ts:181` adds synchronous abandonment. A pending admission becomes a tab-owned rejected receipt; an already accepted receipt stays accepted.
- `libs/backend/rpc-handlers/src/lib/handlers/chat-rpc.schema.ts:141`, `libs/shared/src/lib/types/rpc/rpc-chat.types.ts:251`, and `libs/backend/rpc-handlers/src/lib/handlers/chat-rpc.handlers.ts:498` expose the Zod-validated `abandonPending` flag on `chat:queued-list`.
- `libs/backend/rpc-handlers/src/lib/chat/session/chat-session.service.ts:1892,1974,2839` refuses an abandoned follow-up before native resume or regular SDK send.
- `libs/frontend/chat/src/lib/services/chat-store/follow-up-queue.service.ts:514,525` asks for atomic abandonment when bounded polling ends. Accepted settles as sent; rejected restores the draft once. A failed abandonment retries after 30 seconds.

Changed tests: `settles a pending admission as sent when atomic abandon returns accepted`, `restores once when atomic abandon rejects a pending admission`, `settles failed after both atomic abandon attempts fail`, `refuses SDK send after atomic abandonment of a pending admission`, and `returns accepted receipt when abandonment arrives after admission`.

## Major: bounded receipts

- `libs/backend/rpc-handlers/src/lib/chat/follow-up/chat-follow-up-queue.service.ts:128,161` evicts terminal receipts after ten minutes or when a session exceeds 200 terminal receipts. One helper removes the ID from every receipt map. Pending admissions are preserved. Stale stop generations are pruned under the same bounds, and `retireSession` clears session records; this coordinator has no existing session-close callback.

New tests: `caps terminal receipts and expires them after ten minutes` and `keeps the original tab receipt after ownership transfers inside retention`.

## Residual risks

- If both atomic abandonment RPCs fail, the frontend settles failed with “it could not be confirmed”; the backend may still accept the admission. The draft can be restored in this transport-failure case.
- A native Codex resume already in flight when abandonment arrives cannot be cancelled at the SDK boundary. The pre-resume and post-resume checks reduce this window, but the SDK does not provide an atomic commit callback.
- An RPC promise that never resolves can still delay reconciliation; the retry assumes the transport eventually returns or rejects.
- Tests were not executed, as requested. The coordinator runs verification.

## Allowed checks

- Backend TypeScript compile: pass on the final run.
- Shared TypeScript compile: pass.
- Angular compile: pass with three existing NG8107 optional-chain warnings in `chat-ui` and `peer-session-send`.
- `git diff --check`: pass.
