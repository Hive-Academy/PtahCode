# Webview item 6 report

## Files changed

- `libs/frontend/chat/src/lib/services/message-sender.service.ts`
- `libs/frontend/chat/src/lib/services/message-sender.service.spec.ts`
- `libs/frontend/chat/src/lib/services/chat-store/message-dispatch.service.ts`
- `libs/frontend/chat/src/lib/services/chat-store/message-dispatch.service.spec.ts`

No template changed.

## Design summary

`MessageSenderService` tracks a `chat:start` per tab before asynchronous preparation begins. A concurrent direct send returns a failure so its composer retains the text. `MessageDispatchService` detects the pending start and sends subsequent prompts to the existing held follow-up queue, which waits for a session binding and keeps the text. The guard clears on a successful or failed host response, tab close, session binding, or expiration of a 30-second grace window after renderer RPC timeout. After a timeout the tab retains its starting state during that window. The existing method timeout for `chat:start` is `CHAT_ADMISSION_RPC_TIMEOUT_MS` (120 seconds), already longer than the 30-second generic RPC timeout; it was left unchanged.

## Decisions

- Use the existing held follow-up queue because it already supports an unbound session, preserves prompt content, and submits after binding. Reversible: yes.
- Use a 30-second post-timeout grace window aligned with `CHAT_ADMISSION_RPC_MARGIN_MS`; the client RPC drops its response handler on timeout, so a later host reply is observed through session binding. Reversible: yes.

## Test commands and exact results

- `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat/src/lib/services/message-sender.service.spec.ts libs/frontend/chat/src/lib/services/chat-store/message-dispatch.service.spec.ts` — exit 0; 2 suites and 126 tests passed.
- `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json` — exit 0; no output.
- `npx tsc --noEmit --project libs/frontend/chat/tsconfig.spec.json` — exit 1; 806 output lines with project-wide type errors in existing specs and shared test helpers. The command output was truncated, so it does not establish whether every changed spec is type-error-free.
- `npx eslint libs/frontend/chat/src/lib/services/message-sender.service.ts libs/frontend/chat/src/lib/services/message-sender.service.spec.ts libs/frontend/chat/src/lib/services/chat-store/message-dispatch.service.ts libs/frontend/chat/src/lib/services/chat-store/message-dispatch.service.spec.ts` — exit 0; zero errors, one `max-lines` warning for the existing `message-sender.service.ts` file (795 lines), and cached ProjectGraph warnings.
- `ptah_get_diagnostics` scoped to changed files — unavailable after its 45-second TypeScript check timeout.

## Open risks

- An RPC response arriving after the client timeout cannot clear the guard directly because `ClaudeRpcService` discards its pending response handler. A session binding or the 30-second grace expiry clears it. A host that never binds a session leaves queued follow-ups held for the existing queue recovery path.
- The `angular-frontend-patterns` skill could not be loaded: this lane exposed no skill-loading tool, and Ptah file discovery did not return. Repository patterns were followed directly.
