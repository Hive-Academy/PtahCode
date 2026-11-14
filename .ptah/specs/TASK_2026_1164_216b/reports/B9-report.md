# B9 report

## Status
Implemented Electron and CLI usage reconciliation composition. Focused TypeScript and lint checks pass. The Electron Jest suites passed all assertions but the Jest process exited 1 because an asynchronous existing SQLite callback ran after environment teardown; see Open issues.

## Files changed
- `apps/ptah-electron/src/di/phase-2-libraries.ts`: bind both collectors, cursor store, source enumeration, platform trigger and repository identity backfill adapter.
- `apps/ptah-electron/src/di/container.ts`: resolve one reconciler, attach backfill after-pass callback, defer start by one `setImmediate`, and expose idempotent stop.
- `apps/ptah-electron/src/main.ts`: stop reconciler at the real `will-quit` path before the disposal chain.
- `libs/backend/cli-engine/src/lib/container.ts`: matching bindings, start after lane outcomes, stop at `disposeHostRuntime`.
- `libs/backend/cli-engine/src/lib/usage/cli-git-read-runner.ts`: CLI argument-array Git runner using the existing `execGit` process-spawner convention, explicit timeout/output limit and background priority.
- `libs/backend/task-end-hook/src/index.ts`: additive public `ReadOnlyGit` export. This and the new CLI runner were approved out-of-set edits.
- `apps/ptah-electron/src/di/expected-resolvable.ts`, `container.smoke.spec.ts`, `surface-composition.spec.ts`: guard entries and Electron composition tests.
- `libs/backend/cli-engine/src/lib/surface-composition.spec.ts`, `usage/cli-git-read-runner.spec.ts`: CLI trigger lifecycle, binding and read-only runner tests.

## Bindings
Both roots bind `USAGE_RECONCILIATION_TOKENS.CLAUDE_COLLECTOR` to `ClaudeJsonlUsageCollector`, `CODEX_COLLECTOR` to `CodexRolloutUsageCollector`, `CURSOR_STORE` to `SqliteUsageCursorRepository`, and `SOURCES` to named Claude profile roots, Codex roots, lazy project/rollout enumeration and filesystem realpath. `PLATFORM_TOKENS.USAGE_RECONCILIATION_TRIGGER` aliases the registered singleton `UsageReconciliationService`. Both register `RepositoryIdentityBackfillService`, adapt `RepositoryIdentityResolver` through `ReadOnlyGit` to the requested `{ repositoryId, worktreePath } | null` shape, and log resolution failures through the injected logger. Electron uses task-end-hook's registered Git runner; CLI uses the new process-spawner runner. Both set `setAfterPass(() => backfill.runOnce().then(() => undefined))` and stop on host shutdown.

## Tests added and results
- CLI surface spec checks registration order, trigger alias, singleton identity, producer enqueue reaching a scan, idempotent start and no work after stop, and no direct host import in the CLI lib.
- CLI Git runner spec rejects an unsafe vector before the spawner and forwards a permitted vector with timeout and output limit.
- Electron guard specs check trigger/backfill registration, start order and quit stop path.

## Exact focused checks
- `npx tsc --noEmit --project apps/ptah-electron/tsconfig.app.json`: exit 0, twice (last run after final Electron source edit).
- `npx tsc --noEmit --project libs/backend/cli-engine/tsconfig.lib.json`: exit 0.
- `npx jest --config libs/backend/cli-engine/jest.config.cjs --runInBand --coverage=false --runTestsByPath libs/backend/cli-engine/src/lib/usage/cli-git-read-runner.spec.ts libs/backend/cli-engine/src/lib/surface-composition.spec.ts`: 12 surface tests passed; Git runner spec initially failed because its module mock omitted other `vscode-core` exports. Fixed the mock.
- `npx jest --config libs/backend/cli-engine/jest.config.cjs --runInBand --coverage=false --runTestsByPath libs/backend/cli-engine/src/lib/usage/cli-git-read-runner.spec.ts`: exit 0, 1 test passed after the fix.
- `npx jest --config apps/ptah-electron/jest.config.ts --runInBand --coverage=false --runTestsByPath apps/ptah-electron/src/di/container.smoke.spec.ts apps/ptah-electron/src/di/surface-composition.spec.ts`: 2 suites and 74 tests passed, but process exit 1 due to `ReferenceError: You are trying to require a file after the Jest environment has been torn down` in the existing asynchronous `SessionStoreDatabase` / `better-sqlite3` callback from `container.smoke.spec.ts`.
- `npx eslint apps/ptah-electron/src/di/phase-2-libraries.ts apps/ptah-electron/src/di/container.ts apps/ptah-electron/src/main.ts apps/ptah-electron/src/di/container.smoke.spec.ts apps/ptah-electron/src/di/expected-resolvable.ts apps/ptah-electron/src/di/surface-composition.spec.ts libs/backend/cli-engine/src/lib/container.ts libs/backend/cli-engine/src/lib/surface-composition.spec.ts libs/backend/cli-engine/src/lib/usage/cli-git-read-runner.ts libs/backend/cli-engine/src/lib/usage/cli-git-read-runner.spec.ts libs/backend/task-end-hook/src/index.ts`: exit 0, zero errors, six warnings. Four were existing file-size/unused-code warnings; two new empty-generator fixture warnings were fixed.
- `npx eslint libs/backend/cli-engine/src/lib/surface-composition.spec.ts`: exit 0, no warnings after the fixture fix.
- `ptah_get_diagnostics` scoped to changed source files: unavailable after 45-second compiler timeout. The focused `tsc` checks above passed.

## Open issues
1. Electron Jest exits 1 after all tests pass because a preexisting asynchronous SQLite callback outlives the Jest environment. This was not changed here and needs its own fixture teardown fix.
2. The B8 reconciliation service consumes every yielded file in a pass; the source iterators are lazy but the plan's strict startup first-directory-page cap is not enforced by that service. A paged discovery cursor in B8's service contract would be needed to enforce it without permanently skipping files. That library is outside this batch's write set.
3. The tests exercise the platform trigger alias and enqueue path. They do not instantiate the full B1/B2 production owner classes in the heavy host graph; the source confirms both constructors inject `PLATFORM_TOKENS.USAGE_RECONCILIATION_TRIGGER` optionally.

## Decisions
- Use the existing Electron task-end-hook runner and the same public `ReadOnlyGit` wrapper in both hosts. Evidence: task-end-hook already owns the read-only vector allowlist. Reversible: yes.
- Register B10 backfill directly in both roots because `registerUsageAnalytics` only registers the B8 reconciler. Reversible: yes.

## Tool availability
`ptah_workspace_analyze` succeeded. `ptah_ast_analyze` rejected the `filePath` argument, so native reads were used. No skill-loading tool is available in this lane; no skill was loaded.
