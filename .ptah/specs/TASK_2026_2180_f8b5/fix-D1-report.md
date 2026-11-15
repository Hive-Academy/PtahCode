# D1 fix report

## Confirmed?
Yes. `switchSession` marked A `resuming` with an empty streaming state at `session-loader.service.ts:1065-1073`, then the generation check after `chat:resume` returned before A's replay. Its catch also returned on a stale rejection. `TabManagerService.applyResumingSession` clears messages and sets `resuming`; `applyResumeFailure` sets `loaded`. The new regression tests failed before the fix: A's JSONL event never replayed, and A's rejected RPC resolved silently.

## Changes
- Updated `session-loader.service.ts` so a superseded cold switch continues processing the resume reply for its own claimed tab. Its JSONL events remain the transcript source. Per-tab tail paging and failure settlement complete while shared session status, resumable subagents, and CLI session publication are guarded by the current-switch check.
- On a stale error after A entered `resuming`, clear its pending updates, apply resume failure, mark it idle, and rethrow. The replay claim is still released in `finally` by its token.
- Updated `session-loader.service.spec.ts` with deferred A resume tests for success and rejection, checking A's modeled status and transcript after B opens. The old stale-reply expectation now requires A's own event to replay.

## Checks
- `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat/src/lib/services/chat-store/session-loader.service.spec.ts libs/frontend/chat/src/lib/services/chat-store/session-loader.resync-live-seed.spec.ts libs/frontend/chat/src/lib/services/chat-store/session-loader.command-center-persona.spec.ts libs/frontend/chat/src/lib/services/chat-store/session-loader.cli-restore.spec.ts`: PASS, 4 suites; 156 passed, 2 skipped. Red run before fix: 2 new cases failed. Logs: `.ptah/tmp/fixD1-jest.log`, `.ptah/tmp/fixD1-jest-red.log`.
- `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json`: PASS, zero errors. Log: `.ptah/tmp/fixD1-tsc.log`.
- `npx eslint libs/frontend/chat/src/lib/services/chat-store/session-loader.service.ts libs/frontend/chat/src/lib/services/chat-store/session-loader.service.spec.ts`: PASS, zero errors and 12 existing warnings, matching batch 6. Log: `.ptah/tmp/fixD1-eslint.log`.

## Decisions
- Used the preferred per-tab completion approach. A stale switch still owns A's replay claim; global state remains with B. This preserves the JSONL transcript and the existing token-based replay fence.
- `session:load` continues to supply metadata only; it is never painted as A's final transcript.

## Open issues
- No matching `angular-frontend-patterns` skill was available from this lane's Ptah skill discovery. Native file reads were used.
- Other modified files in the worktree belong to existing task changes and parallel writers; none were altered or reverted for this fix.
