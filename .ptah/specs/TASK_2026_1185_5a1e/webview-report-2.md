# Webview regression fix report

## Changes

- Narrowed the per-tab `chat:start` guard to the grace window after the renderer receives `RPC timeout: chat:start`. Sends made before that timeout follow the existing path and may issue another `chat:start`.
- Kept retries in the existing held follow-up queue during that grace window. A session binding, tab close, or grace expiry clears the guard; ordinary host errors do not enter it.
- Made the new tab-close and pending-start hooks tolerate existing test doubles that omit them. Changed only the new pre-timeout test; existing spec expectations remain unchanged.
- No files outside `libs/frontend/chat` or this report were edited by this lane.

## Decisions

- Preserve the original concurrent-send behavior before the RPC timeout. Evidence: the reported regressions and the task's explicit boundary. Reversible: yes.
- Reuse the held follow-up queue for post-timeout retries. Evidence: the existing dispatch path already queues text until a session binds. Reversible: yes.

## Verification

- Found the affected existing suites in `message-sender.host-data.spec.ts`, `message-sender.command-center.spec.ts`, `message-dispatch.command-center-lock.spec.ts`, and `tab-close-session-end.integration.spec.ts`.
- `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --testPathPatterns "message-sender|message-dispatch|command-center|tab-close|close"` — exit 0; **12 suites passed, 212 tests passed, 0 failed**.
- `npx eslint libs/frontend/chat/src/lib/services/message-sender.service.ts libs/frontend/chat/src/lib/services/message-sender.service.spec.ts libs/frontend/chat/src/lib/services/chat-store/message-dispatch.service.ts libs/frontend/chat/src/lib/services/chat-store/message-dispatch.service.spec.ts` — exit 0; **0 errors, 1 warning** (existing `max-lines` warning in `message-sender.service.ts`, 791 lines versus 700).
- `ptah_get_diagnostics` on the four changed chat files — unavailable after its 45-second TypeScript check timeout; no diagnostic conclusion.
- The `angular-frontend-patterns` skill could not be loaded because this lane exposed no skill-loading tool. Repository patterns were followed directly.

## Limitation

The renderer cannot observe a host reply that arrives after its RPC timeout unless session binding occurs. The guard therefore also expires after the existing 30-second admission margin.
