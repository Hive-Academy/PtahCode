# Follow-up queue refusal fix

## Files changed

- `libs/frontend/chat/src/lib/services/chat-store/follow-up-queue.service.ts`: Classifies and logs every submission refusal, shows fixed safe reasons, reconciles uncertain sends against backend receipts, and reuses the client ID on a same-text queued retry.
- `libs/frontend/chat/src/lib/services/chat-store/follow-up-queue.service.spec.ts`: Covers typed and unknown refusals, timeout receipts, timeout restoration, and retry ID reuse.
- `libs/backend/rpc-handlers/src/lib/chat/session/chat-session.service.ts`: Rechecks ownership and live registration identity immediately before follow-up binding and SDK send.
- `libs/backend/rpc-handlers/src/lib/chat/session/chat-session.follow-up-queue.spec.ts`: Covers registration replacement during admission; existing busy-turn admission test remains.
- `libs/backend/rpc-handlers/src/lib/chat/follow-up/chat-follow-up-queue.service.ts`: Exposes tab-scoped queued and delivered receipts and live registration identity.
- `libs/backend/rpc-handlers/src/lib/handlers/chat-rpc.handlers.ts`: Includes a requested receipt in the existing queued-list RPC.
- `libs/backend/rpc-handlers/src/lib/handlers/chat-rpc.schema.ts`: Validates the optional receipt client ID with Zod.
- `libs/shared/src/lib/types/rpc/rpc-chat.types.ts`: Types the optional receipt request and response.
- `libs/shared/src/lib/types/rpc/rpc-error-codes.types.ts`: Adds stable `SESSION_CHANGED` refusal code.

## Error code to safe reason

| Error code | User-facing reason |
| --- | --- |
| `SESSION_CHANGED`, `SESSION_NOT_FOUND` | the session changed |
| `SESSION_ENDED` | the session ended |
| `AUTH_REQUIRED` | sign-in is needed |
| `SEND_TIMEOUT` or transport timeout | the request timed out |
| `CODEX_UNAVAILABLE` | the provider is not connected |
| `SESSION_DRIVEN_ELSEWHERE` | the session is connected elsewhere |
| cancelled reply | the request was stopped |
| other or unknown code | the request could not be completed |

Raw backend or transport errors go only to the injected logger with tab, session, client ID and error code.

## Verification

- Requested command: `npm run verify -- -p @ptah-extension/chat,@ptah-extension/rpc-handlers,@ptah-extension/shared`. It was queued behind other worktree verifications; no project header or result was available at report time.
- An initial invocation with space-separated project names failed argument parsing; the comma-separated command above is the valid invocation.
- Direct Jest fallback with project config and `--maxWorkers=2` failed before tests with `spawn EPERM` (sandbox worker creation). In-band fallback also failed before tests with `spawn EPERM` from esbuild. No test assertions ran.
- Scoped TypeScript check `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json` passed after the final owner-identity edit.
- Scoped Angular check `npx ngc --noEmit --project libs/frontend/chat/tsconfig.lib.json` passed with three existing NG8107 warnings in `chat-ui` and `peer-session-send-dialog`.
- `git diff --check` passed.

## Remaining limitation

Client ID reuse applies when the same uncertain draft is queued again through `FollowUpQueueService.enqueue`. A draft sent through a different, normal composer path does not carry that ID. The queued-list reconciliation covers backend items already queued or delivered when the receipt lookup runs; acceptance after a negative receipt remains a transport timing window.
