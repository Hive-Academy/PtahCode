# Fix round 1 report

## Review findings

- **Own resume identity:** `libs/backend/rpc-handlers/src/lib/chat/session/chat-session.service.ts:1838-1843,1951-1956` recaptures identity and owner after this request's successful resume, then checks both and current ownership immediately before bind/send. `chat-session.follow-up-queue.spec.ts:292` simulates a stale same-tab registration replaced by the request's successful resume and verifies the send occurs.
- **Absent-to-present identity:** `chat-session.service.ts:1951-1956` compares full before/after identity including `undefined`. `chat-session.follow-up-queue.spec.ts:279` introduces a same-tab registration during the admission await and verifies `SESSION_CHANGED` without send.
- **Uncertain timeout:** `libs/frontend/chat/src/lib/services/chat-store/follow-up-queue.service.ts:465-516` keeps a timed-out or transport-uncertain entry pending after an empty or failed receipt lookup. After a fixed 2-second delay, it performs one more lookup; only a successful response with no receipt restores the text with the fixed timeout reason. The backend also reports `pending` while the original admission is still running (`chat-follow-up-queue.service.ts:135-160`), so a negative receipt is considered definite only after that admission has ended. A queued push prevents the failed branch and delayed restore. Retry retains the original client ID. `follow-up-queue.service.spec.ts:311,325,337,349,361,375` tests negative receipt, retry ID, failed lookup, delayed original admission, and push during reconciliation.
- **Failed push reason:** `libs/shared/src/lib/types/rpc/rpc-chat.types.ts:295` adds a typed error code; `libs/frontend/chat/src/lib/services/chat-store/queued-follow-up-event.ts:9-46` parses the push with Zod; `follow-up-queue.service.ts:222-223` logs raw reason through injected logger and renders only the fixed code mapping. `follow-up-queue.service.spec.ts:391` verifies sensitive detail never reaches the banner.
- **Receipt ownership:** `libs/backend/rpc-handlers/src/lib/chat/follow-up/chat-follow-up-queue.service.ts:154-160,289-298` authorizes by the immutable submitting tab and does not relabel events from the current session registration. `libs/backend/rpc-handlers/src/lib/handlers/chat-rpc.handlers.ts:499-500` keeps list ownership separate from receipt-only lookups. `chat-session.follow-up-queue.spec.ts:303,314` checks receipts for both tabs after ownership transfer and pending admission visibility.

## Verification

- `npm run verify -- -p @ptah-extension/chat,@ptah-extension/rpc-handlers,@ptah-extension/shared`: started; waiting for a machine-wide slot (queue position 13 initially, 9 at last position report). No completed result yet.
- `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json`: final rerun passed, exit 0, no output. An earlier intermediate run found the missing `ChatFollowUpQueue` Pick members; those were added before the final pass.
- `npx ngc --noEmit --project libs/frontend/chat/tsconfig.lib.json`: final rerun passed, exit 0, with three existing NG8107 warnings in `chat-ui` and `peer-session-send-dialog`.
- `npx jest --config libs/frontend/chat/jest.config.ts --runTestsByPath libs/frontend/chat/src/lib/services/chat-store/follow-up-queue.service.spec.ts --coverage=false --maxWorkers=2`: failed before assertions with `Error: spawn EPERM` in `jest-worker` process creation.
- `git diff --check`: passed, no output.

## Not done

No commit, push, or PR. Scoped Jest assertions have not run because worker creation is denied (`spawn EPERM`); the coordinator should run them outside this sandbox.









