# Task index merge fix

## Verification

- Jest: 93 passed, 0 failed, 1 suite passed. Command: `npx jest --config libs/backend/task-specs/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/task-specs/src/lib/task-index.service.spec.ts`.
- TypeScript: `npx tsc --noEmit --project libs/backend/task-specs/tsconfig.lib.json` passed; `npx tsc --noEmit --project libs/backend/task-specs/tsconfig.spec.json` passed.
- ESLint: `npx eslint libs/backend/task-specs/src/lib/task-index.service.spec.ts` exited 0 with 0 errors and 1 pre-existing warning at line 111 (`@typescript-eslint/no-non-null-assertion`).
- Ptah diagnostics were unavailable because their TypeScript check did not finish within 45 seconds; the explicit TypeScript checks above passed.
- Skill invocation was unavailable in this lane; Ptah skill discovery was present, but no skill invocation tool was exposed.

## Changed tests

- `does not suppress an unscanned watcher folder after a folder write`: start the writer, let its async setup arm the fake timer, advance the timer, then await it so the test still checks both folders.
- `coalesces five writers and settles them after one rebuild`: count folder scans, the rebuild mode for this batch, while retaining the single rebuild and five settled promises assertions.
- `rebuilds a writer folder even when its fingerprint is unchanged`: count folder scans to verify the unchanged writer folder is rebuilt.
- `rejects a writer promise when its rebuild fails`: fail both the folder scan and its full-scan fallback so the writer must reject.
- `rejects a writer when the ready store does not persist the rebuild` (new): fail both store write paths and assert that the writer receives the merged `indexWritten: false` error.
- `retries a failed writer batch with write reason and indexes the folder`: fail both initial scan paths so the retry is exercised, retaining the write reason and indexed folder checks.
- `settles a pending writer when the watcher state is disposed`: count the folder scan used by the dispose drain while still awaiting the writer.
- `rejects a pending writer when its dispose drain rebuild fails`: fail both scan paths so the drain rejection reaches the pending writer.
- `finishes an active writer flush before disposing the rebuild queue`: count the folder scan while retaining the queue disposal ordering checks.
- `does not arm a retry when an active flush fails after disposal`: fail both scan paths so the active flush rejects, retaining the zero timers and no further full scan checks.
- `runs a direct write rebuild when no watcher state exists`: count the direct folder scan.
- `runs a full scan when an unknown event follows a trailing writer folder rebuild`: start the first timer and let the second writer arm its timer before advancing it; the test still asserts a full scan and the indexed trailing folder.

The two rejected-run trailing rebuild tests required no edits: their existing folder-scan gates and full-scan rejection mocks cover the merged fallback. They pass once the earlier fake-timer tests complete. The watcher echo and writer coalescing cases overlap with main's folder-mode coverage, but retain distinct writer promise and reason assertions.

## Service

No service change was needed. The merged service retains the ready-store `indexWritten: false` throw, writer waiters, active flush and dispose behavior, and the state-identity retry guard.
