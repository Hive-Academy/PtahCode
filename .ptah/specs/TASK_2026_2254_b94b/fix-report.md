# TASK_2026_2254_b94b review fixes

## Findings corrected

- Major 1: `shutdownHostRuntime()` now stops `RepositoryIdentityBackfillService` before other runtime drains and before the caller disposes persistence. It uses the existing guarded disposal helper: absent registration, resolution failures and stop failures cannot short-circuit other teardown. The unused container wrapper delegates to this path instead of duplicating backfill stop. Tests cover normal/repeated teardown, partial initialization without registration, unresolvable registration, and the existing all-failures teardown sequence.
- Major 2: CLI surface composition now requires autonomous backfill startup after lane outcomes, forbids reconciliation startup and after-pass hooks, and retains producer-token singleton resolution. Enqueue causes zero root listings and leaves zero timers. Searched CLI and Electron specs for usageReconciliation / setAfterPass / UsageReconciliationTrigger; no other obsolete positive expectations remain. The Electron source guard checks backfill stop in Electron and the common shutdown route for CLI.
- Minor: one shared in-flight promise serializes public and scheduled passes; concurrent public callers join and receive the same result. Lifecycle generations invalidate stopped work and stale timer callbacks/finalizers. Restart waits for the previous pass to settle before beginning another. Cancellation is checked between pages, after reads, while resolving rows, and before each page write. Only one unref timer can remain. Pages remain bounded to 200 rows with setImmediate yields. Production service is 121 lines (under 700).
- Review note respected: dashboard summary sources are unchanged; automatic ledger reconciliation remains disabled, enqueue remains a no-op, and no DI tokens were added or removed.

## Files changed in this revision

- `libs/backend/cli-engine/src/lib/bootstrap/shutdown-host-runtime.ts`
- `libs/backend/cli-engine/src/lib/bootstrap/shutdown-host-runtime.spec.ts`
- `libs/backend/cli-engine/src/lib/container.ts` (remove duplicate backfill stop only)
- `libs/backend/cli-engine/src/lib/surface-composition.spec.ts`
- `libs/backend/usage-analytics/src/lib/repository-identity-backfill.service.ts`
- `libs/backend/usage-analytics/src/lib/repository-identity-backfill.spec.ts`
- `apps/ptah-electron/src/di/usage-reconciliation-composition.spec.ts`
- This report.

All earlier lane changes were preserved. No files outside this worktree were edited; no commit, push, stash or PR was created.

## Focused verification (sequential)

1. `npx jest --config apps/ptah-electron/jest.config.ts --runInBand --coverage=false --runTestsByPath apps/ptah-electron/src/di/surface-composition.spec.ts apps/ptah-electron/src/di/usage-reconciliation-composition.spec.ts`
   - Initial and final runs: **2 suites passed, 16 tests passed, 0 failed**. Final: 11.934 s. Unlike the earlier lane, the module-loading environment now supports these suites without configuration changes.
2. `npx jest --config libs/backend/usage-analytics/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/usage-analytics/src/lib/repository-identity-backfill.spec.ts libs/backend/usage-analytics/src/lib/usage-reconciliation.spec.ts`
   - Initial: **25 passed**. Final after adding stale-callback coverage: **2 suites passed, 26 tests passed, 0 failed**, 4.871 s. Includes deferred-resolution cancellation/restart/concurrency, stale callback, failed read recovery (no unhandled rejection), and 401 rows across 200/200/1 pages with two yields.
3. `npx jest --config libs/backend/cli-engine/jest.config.cjs --runInBand --coverage=false --runTestsByPath libs/backend/cli-engine/src/lib/surface-composition.spec.ts libs/backend/cli-engine/src/lib/bootstrap/shutdown-host-runtime.spec.ts`
   - First two attempts: surface suite **13 passed**, shutdown suite failed to compile (TS2345: class token incompatible with the helper's all-verbs shape). Fixed with explicit class-token resolution and typeof narrowing.
   - Third attempt: **34 passed, 1 failed** because the existing all-resolve-failures test needed the newly attempted backfill token in its expected sequence. Updated that expectation.
   - Final: **2 suites passed, 35 tests passed, 0 failed**, 15.45 s.

4. `npx tsc --noEmit --project apps/ptah-electron/tsconfig.app.json`
   - **Passed**, exit 0, zero diagnostics.
5. `npx tsc --noEmit --project libs/backend/cli-engine/tsconfig.lib.json`
   - **Passed**, exit 0, zero diagnostics.
6. `npx tsc --noEmit --project libs/backend/usage-analytics/tsconfig.lib.json`
   - **Passed**, exit 0, zero diagnostics.
7. `npx eslint apps/ptah-electron/src/di/container.ts apps/ptah-electron/src/di/surface-composition.spec.ts apps/ptah-electron/src/di/usage-reconciliation-composition.spec.ts libs/backend/cli-engine/src/lib/container.ts libs/backend/cli-engine/src/lib/surface-composition.spec.ts libs/backend/cli-engine/src/lib/bootstrap/shutdown-host-runtime.ts libs/backend/cli-engine/src/lib/bootstrap/shutdown-host-runtime.spec.ts libs/backend/usage-analytics/src/lib/repository-identity-backfill.service.ts libs/backend/usage-analytics/src/lib/repository-identity-backfill.spec.ts libs/backend/usage-analytics/src/lib/usage-reconciliation.service.ts libs/backend/usage-analytics/src/lib/usage-reconciliation.spec.ts`
   - **Passed**, exit 0: **0 errors, 1 warning**. Existing `cli-engine/container.ts` exceeds max-lines (863 counted lines); this revision removes one line from that existing oversized file.
8. `git diff --check`
   - **Passed**, exit 0; only Git CRLF-to-LF normalization notices.

Final result: **6 focused suites, 77 tests passed, 0 failed; all 3 scoped typechecks passed; lint has zero errors.** No required focused check remains unverified. Read-only discovery also used Get-Content, rg, git status/diff and Get-Process to inspect the workspace and the running check; no changes to check configuration or dependencies were needed.

## Tool availability and limits

CLI-native skill discovery/loading is unavailable in this session. Local skill files were discovered; `humanize-library/SKILL.md` was inspected but explicitly excludes bug fixes, so it was not applied. No matching lifecycle-fix skill was found. This is backend work; design/frontend skills and rendered UI checks do not apply.

Ptah tools are present. Dependent lookup initially rejected the `filePath` field and was retried with `file`; source structure/dependent inspection provided no actionable additional impact information. Native rg/Get-Content/git inspection was used. Scoped Ptah diagnostics did not finish within the bounded wait and were terminated; focused tsc/eslint are the fallback.

No npm verify, nx command, build, serve, dev, e2e or package target ran. No live provider or Electron profiling run was performed. Existing explicit scanner internals and read-only dashboard transcript sources remain outside this revision's scope.
