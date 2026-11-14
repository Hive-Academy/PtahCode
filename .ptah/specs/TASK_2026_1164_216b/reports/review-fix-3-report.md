# Review 3 fix report

## Changes

- Codex continuation: Electron `apps/ptah-electron/src/di/phase-2-libraries.ts` and CLI `libs/backend/cli-engine/src/lib/container.ts` now use the shared `listCodexFiles` binding exported by `libs/backend/cli-agent-runtime/src/index.ts`. The binding forwards `startAfter` to `listCodexRolloutFiles`.
- Thread correction: `libs/backend/persistence-sqlite/src/lib/session-store/session-stats-repository.ts` captures prior native thread IDs before upsert and re-evaluates lane and replay ownership and affected session totals for both old and new threads in the transaction.
- Large file: `libs/backend/usage-analytics/src/lib/usage-reconciliation.service.ts` saves a `pending` discovery key at the 4 MiB cap and resumes that file first on the next pass.

## Tests

- `codex-rollout-file-source.spec.ts`: 21 real rollout files, saved path deletion, newer path insertion, continuation and next sweep.
- `session-stats-repository.spec.ts`: A-to-B correction for `codex` and `openai-codex`, separate lane/replay sessions, ownership, tokens and cost.
- `usage-reconciliation.spec.ts`: file exceeds 4 MiB and resumes in the immediately following pass.

## Verification

- `npx jest --config libs/backend/persistence-sqlite/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/persistence-sqlite/src/lib/session-store/session-stats-repository.spec.ts` — PASS, 38 tests.
- `npx jest --config libs/backend/usage-analytics/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/usage-analytics/src/lib/usage-reconciliation.spec.ts` — PASS, 8 tests.
- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-rollout-file-source.spec.ts` — PASS, 1 test.
- `npx tsc --noEmit --project libs/backend/persistence-sqlite/tsconfig.lib.json` — PASS.
- `npx tsc --noEmit --project libs/backend/usage-analytics/tsconfig.lib.json` — PASS.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json` — PASS.
- `npx tsc --noEmit --project libs/backend/cli-engine/tsconfig.lib.json` — PASS.
- `npx tsc --noEmit --project apps/ptah-electron/tsconfig.app.json` — PASS.
- `npx eslint apps/ptah-electron/src/di/phase-2-libraries.ts libs/backend/cli-engine/src/lib/container.ts libs/backend/cli-agent-runtime/src/index.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-rollout-file-source.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-rollout-file-source.spec.ts libs/backend/persistence-sqlite/src/lib/session-store/session-stats-repository.ts libs/backend/persistence-sqlite/src/lib/session-store/session-stats-repository.spec.ts libs/backend/usage-analytics/src/lib/usage-reconciliation.service.ts libs/backend/usage-analytics/src/lib/usage-reconciliation.spec.ts` — PASS, 0 errors; 3 existing max-lines warnings.
- After expanding aggregate assertions, reran the persistence Jest command above — PASS, 38 tests; `npx eslint libs/backend/persistence-sqlite/src/lib/session-store/session-stats-repository.spec.ts` — PASS, 0 errors.

## Open issue

- A single large directory can exceed the discovery budget before its first yielded path. Left open as requested.
- Local skill discovery returned no installed matching skill; repository guidance was used.
- Ptah diagnostics timed out under load; the five direct TypeScript checks above provided the compiler fallback.
