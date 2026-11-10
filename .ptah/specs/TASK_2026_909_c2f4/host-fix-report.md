# Host task-index cold-start measurement

## Root cause

The supplied host timestamps point to the first task-index `ensureStarted` after a new worktree root appears, not to every `ptah_task_create`. The first call latches startup, starts a watcher, awaits a full scan and index replacement, then checks/writes README (`libs/backend/task-specs/src/lib/task-index.service.ts:164-189,216-225,243-267,614-656`). The observed `[task-specs] wrote .ptah/specs/README.md` line marks the end of this path. This is a plausible correlation, not a proven cause of the 6-30 s main-loop blocks.

`SqliteTaskIndexStore.replaceWorkspace` uses `this.db.transaction()` (`libs/backend/task-specs/src/lib/task-index.store.ts:267-286`). `SqliteConnectionService` hands consumers a `withSlowStatementTiming` wrapped database (`libs/backend/persistence-sqlite/src/lib/sqlite-connection.service.ts:223-232`), and that wrapper times transactions (`libs/backend/persistence-sqlite/src/lib/slow-statement-timing.ts:442-460,475-507`). The unchanged host breadcrumb, `transaction 65ms at 22:22:16`, therefore weighs against SQLite replacement causing the later multi-second hangs. The throwaway measurement used the real scanner and in-memory index store, so it independently measured the non-SQLite stages but did not reproduce a production SQLite write.

## Measurement

One throwaway Jest spec ran `TaskIndexService.ensureStarted` with the real Electron filesystem adapter and `TaskScannerService` against `D:\projects\ptah-extension\.ptah\specs`. It redirected any README write to an OS temp directory; no source checkout README was written. The adapter's watcher was replaced with a no-op watcher, so this run does not measure chokidar startup. The store was the real `InMemoryTaskIndexStore`. The test counted 306 returned tasks/exclusions; a separate directory count found 418 `TASK_*` folders. The machine was running other Nx/Jest checks, so these are contended-machine timings, one sample only.

| Step | Wall ms | Event-loop max / p99 ms |
| --- | ---: | ---: |
| Full `ensureStarted`, watcher stub + scan + in-memory index + README check | 850.4 | 106.7 / 41.4 (whole measurement window) |
| Scanner: async directory/carrier reads + parse/validate + cross-file checks | 837.1 | not isolated |
| Directory reads, summed duration across calls (overlap possible) | 446.9 | not isolated |
| Carrier/README reads, summed duration across calls (overlap possible) | 5741.9 | not isolated |
| In-memory index replacement | 1.2 | not isolated |
| Standalone README render | 0.05 | not isolated |
| Cross-worktree directory pass, 32 worktrees, 10 missing specs dirs | 25.7 | not isolated |

The 5.7 s read total is the sum of overlapping asynchronous operations, not main-thread blocking time. No measured stage showed a multi-second event-loop block. The 850 ms wall time exceeds the suggested 500 ms fast threshold on this busy machine, but is far below the reported 6-30 s hangs. This run cannot exonerate the real watcher or all new-root startup work.

## Change

No source change. The temporary `task-index.cold-start.measure.spec.ts` was deleted after the run. No worker-thread/store redesign was started.

## Verification

- Requested `npm run verify -- -t test -p @ptah-extension/task-specs -- --testPathPatterns=cold-start.measure 2>&1 | Select-Object -Last 40` queued behind the shared verify lock while other projects occupied its slots. It did not reach Jest and was stopped before deleting the throwaway spec; no pass/fail result from that command.
- Direct scoped fallback: `node D:\projects\ptah-extension\node_modules\jest\bin\jest.js --config libs/backend/task-specs/jest.config.ts --runInBand --coverage=false --testPathPatterns=cold-start.measure 2>&1 | Select-Object -Last 40`. Tail: `Test Suites: 1 passed, 1 total`; `Tests: 1 passed, 1 total`; `COLD_START_MEASUREMENT` contained the numbers above. PowerShell reported shell exit 1 because Jest wrote its success summary to stderr; Jest itself reported a passing suite. An initial direct run failed because one sibling worktree lacked `.ptah/specs`; the throwaway spec then counted unavailable dirs with `Promise.allSettled` and passed.
- No permanent project changed, so no changed-project verify was required.

## Decisions

- Treat the unchanged instrumented SQLite transaction breadcrumb and the measured 1.2 ms in-memory index build as evidence against SQLite, while retaining the limitation that this test did not run SQLite.
- Do not chunk the scanner or change consistency semantics without a reproduced multi-second event-loop block. The scanner already runs eight asynchronous readers (`libs/backend/task-specs/src/lib/task-scanner.service.ts:98-166`).
- Preserve atomic task-folder claims and cross-worktree ID uniqueness (`libs/backend/task-specs/src/lib/task-writer.service.ts:360-384`; `libs/backend/task-specs/src/lib/git-task-folder-visibility.service.ts:181-216,303-321`).

## Not done

The new-root hang remains unattributed. Next bounded entry points are the real task watcher startup (`libs/backend/task-specs/src/lib/task-index.service.ts:541-563`; `libs/backend/platform-electron/src/implementations/electron-file-system-provider.ts:225-265`), Electron Git root watchers (`apps/ptah-electron/src/services/git-root-watcher-pool.ts:183-185`; `apps/ptah-electron/src/services/git-watcher.service.ts:419`), workspace watcher host construction (`apps/ptah-electron/src/services/platform/electron-workspace-watch-host-factory.ts`), code-symbol index cold start (`libs/backend/workspace-intelligence/src/services/code-symbol-indexer.service.ts`), and the first `ptah_workspace_analyze` dispatch (`libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/protocol-dispatcher.ts:1151-1152`). These paths were identified, not investigated deeply.
