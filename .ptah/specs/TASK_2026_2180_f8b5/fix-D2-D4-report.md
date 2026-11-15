## D2

Confirmed. `rebuild` previously called `captureFingerprints` after `scanner.scan` and the index write. It now captures before the scan and invalidates fingerprints for folders with watcher events during the rebuild. A failed scan or write clears fingerprints so the next event cannot be called an echo. The new scan-window regression changes a carrier after the scanner returns its snapshot, fires the watcher, and verifies the next flush indexes the change. This would fail with post-scan capture.

## D3

Confirmed for queue saturation: the watcher retry path dropped folders after three failures. It now retains them in the bounded pending set and repeats the 30-second backoff cap. Supersession is reachable in `TaskIndexRebuildQueue` directly; the service's per-root running guard makes it uncommon in normal service calls, while the no-state branch can still reach it. The queue now unions superseded folder names into the replacement and settles all prior callers from the replacement result. Tests cover supersession, the 64-waiting-root limit, and a fifth attempt after capped backoff.

## D4

Confirmed. `chat:start` returned failure from missing/unauthorized/unsafe workspace and CLI dispatch without setting the timing result. `chat:resume` also returned a cancelled activation without setting it. Those paths now emit `error`. Existing exception paths already did. The timing collector spec passes; no direct service timing test was added because the available service harness requires substantial setup for these early-return branches.

## U1

Checked. `ChatHistoryReadService.readForResume` calls `resolveSessionFolder` (metadata get and filesystem validation) and `SessionHistoryRouter.readSessionHistory` (history read). It does not write or repair session metadata or CLI references. `getCliSessionsForRestore` reads CLI references and can itself persist stale-host interruption state. No ordering dependency from the history read to that query was found; concurrent order remains.

## Checks

- `npx jest --config libs/backend/task-specs/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/task-specs/src/lib/task-index.service.spec.ts libs/backend/task-specs/src/lib/task-index-rebuild-queue.spec.ts`: passed, 2 suites and 68 tests (`.ptah/tmp/fixD2-task-jest.log`).
- `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/chat/session/chat-admission-timing.spec.ts`: passed, 1 suite and 1 test (`.ptah/tmp/fixD2-rpc-jest.log`).
- `npx tsc --noEmit --project libs/backend/task-specs/tsconfig.lib.json`: passed, zero errors (`.ptah/tmp/fixD2-task-tsc.log`).
- `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json`: passed, zero errors (`.ptah/tmp/fixD2-rpc-tsc.log`).
- `npx eslint libs/backend/task-specs/src/lib/task-index.service.ts libs/backend/task-specs/src/lib/task-index.service.spec.ts libs/backend/task-specs/src/lib/task-index-rebuild-queue.ts libs/backend/task-specs/src/lib/task-index-rebuild-queue.spec.ts libs/backend/rpc-handlers/src/lib/chat/session/chat-session.service.ts`: passed, zero errors and three existing warnings (`.ptah/tmp/fixD2-eslint.log`): two file-length warnings and one non-null assertion in unchanged test code. No new warnings.

## Decisions

Pre-scan fingerprints may cause a false changed result if content changes before the scan reads it; this is safe. The watcher pending set bounds retry memory by distinct folder names; retry count saturates at three while backoff stays at 30 seconds. No public RPC, DI token, or shared contract changed.

## Open issues

Local skill discovery returned no installed matching skill; the remote catalog results were for other backend stacks. The standard RPC Jest run emitted the existing Node ES-module warning but passed. Other uncommitted files in this worktree belong to parallel lanes and were left untouched. No direct D4 service timing assertion was added.
